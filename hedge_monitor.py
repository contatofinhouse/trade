import os
import json
import time
import csv
from datetime import datetime
import numpy as np
import pandas as pd
import requests
import MetaTrader5 as mt5
from dotenv import load_dotenv
from notifier import send_telegram_message

# Carrega as variáveis de ambiente do arquivo .env
load_dotenv()

# Parâmetros de Configuração com Fallbacks
SYMBOL = os.getenv("SYMBOL", "BBDC4")
LOOKBACK_HV = int(os.getenv("LOOKBACK_HV", "20"))
LOOKBACK_ZSCORE = int(os.getenv("LOOKBACK_ZSCORE", "252"))
TSMOM_WEIGHT_1M = float(os.getenv("TSMOM_WEIGHT_1M", "0.5"))
TSMOM_WEIGHT_3M = float(os.getenv("TSMOM_WEIGHT_3M", "0.5"))
VOL_ZSCORE_THRESHOLD = float(os.getenv("VOL_ZSCORE_THRESHOLD", "1.5"))
IV_PERCENTILE_MONETIZATION = float(os.getenv("IV_PERCENTILE_MONETIZATION", "0.95"))

STATE_FILE = "hedge_state.json"
HISTORY_FILE = "metrics_history.csv"

def load_state() -> dict:
    """Carrega o estado atual do hedge do arquivo JSON."""
    default_state = {
        "hedge_active": False,
        "activation_date": None,
        "activation_price": None,
        "active_put_ticker": None,
        "active_put_strike": None,
        "active_call_ticker": None,
        "active_call_strike": None
    }
    if os.path.exists(STATE_FILE):
        try:
            with open(STATE_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            print(f"Erro ao carregar {STATE_FILE}: {e}. Usando estado padrão.")
    return default_state

def save_state(state: dict):
    """Salva o estado atual do hedge no arquivo JSON."""
    try:
        with open(STATE_FILE, "w", encoding="utf-8") as f:
            json.dump(state, f, indent=4, ensure_ascii=False)
    except Exception as e:
        print(f"Erro ao salvar estado: {e}")

def calculate_quant_indicators() -> dict:
    """
    Conecta ao MetaTrader 5, extrai os preços históricos e calcula:
    - Retornos Logarítmicos
    - Volatilidade Histórica Anualizada (HV 20 dias)
    - Z-Score de Volatilidade (1 ano de baseline)
    - TSMOM (Média ponderada normalizada de 1M e 3M)
    Retorna um dicionário com os indicadores ou levanta exceção em caso de erro.
    """
    if not mt5.initialize():
        error_msg = f"Falha ao inicializar o MetaTrader 5: {mt5.last_error()}"
        raise RuntimeError(error_msg)
        
    try:
        # Puxa mais barras do que LOOKBACK_ZSCORE + LOOKBACK_HV para ter dados suficientes para rolling
        total_bars = LOOKBACK_ZSCORE + LOOKBACK_HV + 50
        rates = mt5.copy_rates_from_pos(SYMBOL, mt5.TIMEFRAME_D1, 0, total_bars)
        
        if rates is None or len(rates) < total_bars:
            raise RuntimeError(f"Não foi possível obter dados históricos suficientes para {SYMBOL} no MT5.")
            
        df = pd.DataFrame(rates)
        df['time'] = pd.to_datetime(df['time'], unit='s')
        
        # 1. Retorno Logarítmico Diário
        df['log_return'] = np.log(df['close'] / df['close'].shift(1))
        
        # 2. Volatilidade Realizada de 20 dias (Desvio Padrão * raiz de 252 para anualizar)
        df['hv_20'] = df['log_return'].rolling(window=LOOKBACK_HV).std() * np.sqrt(252)
        
        # 3. Z-Score da Volatilidade Histórica (média móvel e std móvel de 252 dias úteis)
        df['hv_mean_252'] = df['hv_20'].rolling(window=LOOKBACK_ZSCORE).mean()
        df['hv_std_252'] = df['hv_20'].rolling(window=LOOKBACK_ZSCORE).std()
        df['hv_zscore'] = (df['hv_20'] - df['hv_mean_252']) / df['hv_std_252']
        
        # Pega o último registro para os cálculos atuais
        current_row = df.iloc[-1]
        close_price = float(current_row['close'])
        current_hv = float(current_row['hv_20'])
        current_zscore = float(current_row['hv_zscore'])
        
        # 4. TSMOM (1 mês = 21 dias úteis, 3 meses = 63 dias úteis)
        # Retornos brutos
        ret_1m = (close_price - float(df['close'].iloc[-22])) / float(df['close'].iloc[-22])
        ret_3m = (close_price - float(df['close'].iloc[-64])) / float(df['close'].iloc[-64])
        
        # Normalização pela Volatilidade Corrente (AQR Style)
        tsmom_1m = ret_1m / current_hv if current_hv > 0 else 0
        tsmom_3m = ret_3m / current_hv if current_hv > 0 else 0
        
        # TSMOM Composto
        tsmom_composite = (TSMOM_WEIGHT_1M * tsmom_1m) + (TSMOM_WEIGHT_3M * tsmom_3m)
        
        # 5. KAMA (Kaufman Adaptive Moving Average)
        n_kama = 10
        fast_kama = 2
        slow_kama = 30
        
        change_kama = (df['close'] - df['close'].shift(n_kama)).abs()
        vol_kama = df['close'].diff().abs().rolling(window=n_kama).sum()
        er_kama = change_kama / vol_kama
        er_kama = er_kama.fillna(0)
        
        fast_sc = 2.0 / (fast_kama + 1)
        slow_sc = 2.0 / (slow_kama + 1)
        sc_kama = (er_kama * (fast_sc - slow_sc) + slow_sc) ** 2
        
        kama_series = pd.Series(index=df.index, dtype=float)
        kama_series.iloc[n_kama - 1] = df['close'].iloc[:n_kama].mean()
        for i in range(n_kama, len(df)):
            kama_series.iloc[i] = kama_series.iloc[i-1] + sc_kama.iloc[i] * (df['close'].iloc[i] - kama_series.iloc[i-1])
            
        current_kama = float(kama_series.iloc[-1])
        
        return {
            "close_price": close_price,
            "hv_20": current_hv,
            "vol_zscore": current_zscore,
            "ret_1m": ret_1m,
            "ret_3m": ret_3m,
            "tsmom_1m": tsmom_1m,
            "tsmom_3m": tsmom_3m,
            "tsmom_composite": tsmom_composite,
            "kama": current_kama
        }
        
    finally:
        mt5.shutdown()

def fetch_options_chain() -> dict:
    """
    Consome a API do opcoes.net.br para obter a grade de opções de BBDC4.
    Retorna o JSON retornado sob a chave 'results' do OptionsChain.
    """
    z = int(time.time() / 10)
    url = "https://www.opcoes.net.br/api/v1"
    params = {
        "z": z,
        "r0t": "LastQuotesInfo",
        "r1t": "OptionsChain",
        "r1p.underlying_asset_id": SYMBOL,
        "r1p.skip": 0,
        "r1p.load": 1000,
        "r1p.columns_info": "true",
        "r1p.underlying_quotes": "true"
    }
    
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "application/json"
    }
    
    response = requests.get(url, params=params, headers=headers, timeout=20)
    if response.status_code != 200:
        raise RuntimeError(f"Erro ao acessar API do opcoes.net.br: HTTP {response.status_code}")
        
    data = response.json()
    if not data.get("success"):
        error_msg = data.get("error", {}).get("message", "Erro desconhecido na API.")
        raise RuntimeError(f"Erro na API do opcoes.net.br: {error_msg}")
        
    # Extrai o resultado da requisição de OptionsChain
    options_chain = next(
        (r["results"] for r in data["requests"] if r["type"] == "OptionsChain"), 
        None
    )
    
    if not options_chain:
        raise RuntimeError("Grade de opções não foi encontrada na resposta da API.")
        
    return options_chain

def find_target_options(options_chain: dict) -> tuple:
    """
    Varre a grade de opções e busca as opções com vencimento mensal
    entre 15 e 45 dias úteis mais próximas de Deltas específicos.
    
    Retorna: (best_put, best_call, expiration_info, put_375, call_131, put_20, put_275, call_275)
    """
    expirations = options_chain.get("expirations", [])
    
    # 1. Filtrar vencimentos mensais com 15 <= du <= 45
    target_exp = None
    for exp in expirations:
        du = exp.get("du", 0)
        is_monthly = exp.get("m", False)
        if 15 <= du <= 45 and is_monthly:
            target_exp = exp
            break
            
    # Se não achar vencimento mensal puro, relaxa o filtro de mensal e pega o primeiro com du válido
    if not target_exp:
        for exp in expirations:
            du = exp.get("du", 0)
            if 15 <= du <= 45:
                target_exp = exp
                break
                
    if not target_exp:
        raise RuntimeError("Nenhum vencimento de opções disponível no intervalo de 15 a 45 dias úteis.")
        
    du_left = target_exp.get("du")
    exp_date = target_exp.get("dt")
    
    puts = target_exp.get("puts", [])
    calls = target_exp.get("calls", [])
    
    # Mapeamento de Colunas do nosso inspect
    # Suffix (0), Strike (3), Last Price (6), Vol. Impl. (17), Delta (18)
    
    best_put = None
    best_put_diff = float("inf")
    
    put_375 = None
    put_375_diff = float("inf")
    
    put_20 = None
    put_20_diff = float("inf")
    
    put_275 = None
    put_275_diff = float("inf")
    
    put_50 = None
    put_50_diff = float("inf")
    
    for p in puts:
        delta = p[18]
        if delta is not None:
            delta = float(delta)
            
            # best_put (closest to -0.275 within [-0.30, -0.20])
            diff = abs(delta - (-0.275))
            if -0.30 <= delta <= -0.20:
                if diff < best_put_diff:
                    best_put_diff = diff
                    best_put = {
                        "ticker": f"BBDC{p[0]}",
                        "strike": float(p[3]),
                        "price": float(p[6]) if p[6] is not None else 0.0,
                        "iv": float(p[17]) if p[17] is not None else 0.0,
                        "delta": delta
                    }
                    
            # put_375 (closest to -0.375)
            diff_375 = abs(delta - (-0.375))
            if diff_375 < put_375_diff:
                put_375_diff = diff_375
                put_375 = {
                    "ticker": f"BBDC{p[0]}",
                    "strike": float(p[3]),
                    "price": float(p[6]) if p[6] is not None else 0.0,
                    "iv": float(p[17]) if p[17] is not None else 0.0,
                    "delta": delta
                }
                
            # put_20 (closest to -0.20)
            diff_20 = abs(delta - (-0.20))
            if diff_20 < put_20_diff:
                put_20_diff = diff_20
                put_20 = {
                    "ticker": f"BBDC{p[0]}",
                    "strike": float(p[3]),
                    "price": float(p[6]) if p[6] is not None else 0.0,
                    "iv": float(p[17]) if p[17] is not None else 0.0,
                    "delta": delta
                }
                
            # put_275 (closest to -0.275)
            diff_275 = abs(delta - (-0.275))
            if diff_275 < put_275_diff:
                put_275_diff = diff_275
                put_275 = {
                    "ticker": f"BBDC{p[0]}",
                    "strike": float(p[3]),
                    "price": float(p[6]) if p[6] is not None else 0.0,
                    "iv": float(p[17]) if p[17] is not None else 0.0,
                    "delta": delta
                }

            # put_50 (closest to -0.50)
            diff_50 = abs(delta - (-0.50))
            if diff_50 < put_50_diff:
                put_50_diff = diff_50
                put_50 = {
                    "ticker": f"BBDC{p[0]}",
                    "strike": float(p[3]),
                    "price": float(p[6]) if p[6] is not None else 0.0,
                    "iv": float(p[17]) if p[17] is not None else 0.0,
                    "delta": delta
                }
                    
    best_call = None
    best_call_diff = float("inf")
    
    call_131 = None
    call_131_diff = float("inf")
    
    call_275 = None
    call_275_diff = float("inf")
    
    call_50 = None
    call_50_diff = float("inf")
    
    call_06 = None
    call_06_diff = float("inf")
    
    for c in calls:
        delta = c[18]
        if delta is not None:
            delta = float(delta)
            
            # best_call (closest to 0.275 within [0.20, 0.30])
            diff = abs(delta - 0.275)
            if 0.20 <= delta <= 0.30:
                if diff < best_call_diff:
                    best_call_diff = diff
                    best_call = {
                        "ticker": f"BBDC{c[0]}",
                        "strike": float(c[3]),
                        "price": float(c[6]) if c[6] is not None else 0.0,
                        "iv": float(c[17]) if c[17] is not None else 0.0,
                        "delta": delta
                    }
                    
            # call_131 (closest to 0.131)
            diff_131 = abs(delta - 0.131)
            if diff_131 < call_131_diff:
                call_131_diff = diff_131
                call_131 = {
                    "ticker": f"BBDC{c[0]}",
                    "strike": float(c[3]),
                    "price": float(c[6]) if c[6] is not None else 0.0,
                    "iv": float(c[17]) if c[17] is not None else 0.0,
                    "delta": delta
                }
                
            # call_275 (closest to 0.275)
            diff_275 = abs(delta - 0.275)
            if diff_275 < call_275_diff:
                call_275_diff = diff_275
                call_275 = {
                    "ticker": f"BBDC{c[0]}",
                    "strike": float(c[3]),
                    "price": float(c[6]) if c[6] is not None else 0.0,
                    "iv": float(c[17]) if c[17] is not None else 0.0,
                    "delta": delta
                }
                
            # call_50 (closest to 0.50)
            diff_50c = abs(delta - 0.50)
            if diff_50c < call_50_diff:
                call_50_diff = diff_50c
                call_50 = {
                    "ticker": f"BBDC{c[0]}",
                    "strike": float(c[3]),
                    "price": float(c[6]) if c[6] is not None else 0.0,
                    "iv": float(c[17]) if c[17] is not None else 0.0,
                    "delta": delta
                }
                
            # call_06 (closest to 0.065)
            diff_06 = abs(delta - 0.065)
            if diff_06 < call_06_diff:
                call_06_diff = diff_06
                call_06 = {
                    "ticker": f"BBDC{c[0]}",
                    "strike": float(c[3]),
                    "price": float(c[6]) if c[6] is not None else 0.0,
                    "iv": float(c[17]) if c[17] is not None else 0.0,
                    "delta": delta
                }
                    
    expiration_info = {
        "date": exp_date,
        "du": du_left
    }
    
    # Fallbacks de segurança se alguma das opções de referência não foi populada
    if not put_375:
        put_375 = {"ticker": "BBDCS170", "strike": 17.00, "price": 0.42, "iv": 0.249, "delta": -0.375}
    if not call_131:
        call_131 = {"ticker": "BBDCG195", "strike": 19.50, "price": 0.06, "iv": 0.215, "delta": 0.131}
    if not put_20:
        put_20 = {"ticker": "BBDCS165", "strike": 16.50, "price": 0.15, "iv": 0.242, "delta": -0.20}
    if not put_275:
        put_275 = best_put or {"ticker": "BBDCS174", "strike": 17.39, "price": 0.28, "iv": 0.247, "delta": -0.275}
    if not call_275:
        call_275 = best_call or {"ticker": "BBDCG190", "strike": 19.14, "price": 0.09, "iv": 0.213, "delta": 0.252}
    if not put_50:
        put_50 = {"ticker": "BBDCS175", "strike": 17.50, "price": 0.45, "iv": 0.245, "delta": -0.50}
    if not call_50:
        call_50 = {"ticker": "BBDCG175", "strike": 17.50, "price": 0.45, "iv": 0.220, "delta": 0.50}
    if not call_06:
        call_06 = {"ticker": "BBDCG200", "strike": 20.00, "price": 0.02, "iv": 0.210, "delta": 0.065}
        
    return best_put, best_call, expiration_info, put_375, call_131, put_20, put_275, call_275, put_50, call_50, call_06

def log_metrics_history(date_str: str, indicators: dict, iv_p: float, vrp: float, hedge_active: bool, kama: float, regime: str):
    """Registra os indicadores diários em um arquivo CSV para auditoria e histórico."""
    file_exists = os.path.exists(HISTORY_FILE)
    # Se o arquivo existe mas não tem a coluna 'kama', podemos recriar ou deixar anexar
    try:
        with open(HISTORY_FILE, "a", newline="", encoding="utf-8") as f:
            writer = csv.writer(f)
            if not file_exists:
                writer.writerow([
                    "data", "preco_fechamento", "hv_20d", "zscore_vol", 
                    "tsmom_1m", "tsmom_3m", "tsmom_composite", 
                    "iv_puts", "vrp_puts", "hedge_ativo", "kama", "regime"
                ])
            writer.writerow([
                date_str,
                f"{indicators['close_price']:.2f}",
                f"{indicators['hv_20']:.4f}",
                f"{indicators['vol_zscore']:.2f}",
                f"{indicators['tsmom_1m']:.4f}",
                f"{indicators['tsmom_3m']:.4f}",
                f"{indicators['tsmom_composite']:.4f}",
                f"{iv_p:.4f}",
                f"{vrp:.4f}",
                "1" if hedge_active else "0",
                f"{kama:.4f}",
                regime
            ])
    except Exception as e:
        print(f"Erro ao salvar histórico de métricas: {e}")

def format_telegram_report(indicators: dict, underlying_asset: dict, best_put: dict, best_call: dict, exp_info: dict, state: dict) -> str:
    """Gera o texto formatado em HTML para o relatório diário das métricas de hedge."""
    regime_str = "📈 <b>REGIME A (TENDÊNCIA DE ALTA)</b>" if state.get("regime") == "A" else "📉 <b>REGIME B (PRESERVAÇÃO DE CAPITAL)</b>"
    
    msg = f"📊 <b>Relatório Diário de Hedge - {SYMBOL}</b>\n"
    msg += f"Data de Cálculo: {datetime.now().strftime('%d/%m/%Y %H:%M:%S')}\n"
    msg += f"Regime KAMA: {regime_str}\n"
    msg += "━━━━━━━━━━━━━━━━━━━━━━━━\n"
    msg += f"💵 Preço de Fechamento: R$ {indicators['close_price']:.2f}\n"
    msg += f"📊 Média Adaptativa KAMA: R$ {indicators['kama']:.2f} ({'Preço > KAMA' if indicators['close_price'] > indicators['kama'] else 'Preço < KAMA'})\n"
    msg += f"📈 TSMOM Composto (Mom.): {indicators['tsmom_composite']:.4f} (1M: {indicators['tsmom_1m']:.2f} | 3M: {indicators['tsmom_3m']:.2f})\n"
    msg += f"📉 Vol. Histórica (HV 20d): {indicators['hv_20']*100:.1f}%\n"
    msg += f"📊 Z-Score de Vol. (HV): {indicators['vol_zscore']:.2f}\n"
    
    iv_p = underlying_asset.get("iv_p", 0.0)
    vrp = iv_p - indicators["hv_20"]
    msg += f"🔮 Vol. Implícita (IV Puts): {iv_p*100:.1f}%\n"
    msg += f"🛡️ Vol. Risk Premium (VRP): {vrp*100:+.1f}% (IV - HV)\n"
    msg += f"📊 Percentil IV Puts 12M: {underlying_asset.get('ivp_p_12m', 0.0)*100:.1f}%\n"
    msg += "━━━━━━━━━━━━━━━━━━━━━━━━\n"
    
    # Adiciona detalhes do estado ativo se houver
    if state.get("active_put_ticker") or state.get("active_call_ticker"):
        msg += f"📌 <b>Hedge Ativo na Carteira:</b>\n"
        msg += f" • Montado em: {state['activation_date']}\n"
        msg += f" • Preço de Entrada: R$ {state['activation_price']:.2f}\n"
        if state.get("active_put_ticker"):
            msg += f" • Put Comprada: {state['active_put_ticker']} (K: R$ {state['active_put_strike']:.2f})\n"
        else:
            msg += f" • Put Comprada: DESMONTADA (Regime A)\n"
        if state.get("active_call_ticker"):
            msg += f" • Call Vendida: {state['active_call_ticker']} (K: R$ {state['active_call_strike']:.2f})\n"
        msg += "━━━━━━━━━━━━━━━━━━━━━━━━\n"
        
    return msg

def format_telegram_alert(alert_type: str, reason: str, best_put: dict, best_call: dict, exp_info: dict, state: dict = None, extra: dict = None) -> str:
    """Gera o texto formatado para um alerta urgente de ativação ou desativação/rebalanceamento de hedge."""
    msg = ""
    if alert_type == "KAMA_CROSS_ABOVE":
        msg += "📈 <b>ALERTA KAMA: TENDÊNCIA DE ALTA (REGIME A)</b> 📈\n\n"
        msg += f"O preço de {SYMBOL} (R$ {extra['price']:.2f}) cruzou para <b>CIMA</b> da média adaptativa KAMA (R$ {extra['kama']:.2f}).\n\n"
        msg += f"<b>Ações Operacionais de Execução (Maximizar Alfa):</b>\n"
        msg += "━━━━━━━━━━━━━━━━━━━━━━━━\n"
        if state and state.get("active_put_ticker"):
            msg += "🔴 <b>DESMONTAR PUT (Venda):</b>\n"
            msg += f"   Zerar Put ativa <code>{state['active_put_ticker']}</code> (Strike R$ {state['active_put_strike']:.2f})\n\n"
        else:
            msg += "🔴 <b>DESMONTAR PUT:</b> Nenhuma Put ativa para zerar.\n\n"
        msg += "🔄 <b>ROLAR CALL PARA CIMA (OTM):</b>\n"
        if state and state.get("active_call_ticker"):
            msg += f"   • Recomprar Call ativa: <code>{state['active_call_ticker']}</code>\n"
        msg += f"   • Vender Call Delta ~0.06: <code>{extra['target_call']['ticker']}</code> (Strike R$ {extra['target_call']['strike']:.2f} | Delta: {extra['target_call']['delta']:.3f})\n"
        msg += "━━━━━━━━━━━━━━━━━━━━━━━━\n"
        msg += "⚠️ <i>Execute manualmente via Home Broker. Esta operação eleva o Delta Líquido para ~0.94 para capturar alta.</i>"
        
    elif alert_type == "KAMA_CROSS_BELOW":
        msg += "📉 <b>ALERTA KAMA: PROTEÇÃO TOTAL / CAIXA (REGIME B)</b> 📉\n\n"
        msg += f"O preço de {SYMBOL} (R$ {extra['price']:.2f}) cruzou para <b>BAIXO</b> da média adaptativa KAMA (R$ {extra['kama']:.2f}).\n\n"
        msg += f"<b>Ações Operacionais de Execução (Preservar Capital):</b>\n"
        msg += "━━━━━━━━━━━━━━━━━━━━━━━━\n"
        msg += "🟢 <b>COMPRAR PUT ATM (Delta ~-0.50):</b>\n"
        msg += f"   Código: <code>{extra['target_put']['ticker']}</code> (Strike R$ {extra['target_put']['strike']:.2f} | Delta: {extra['target_put']['delta']:.3f})\n\n"
        msg += "🔴 <b>VENDER CALL ATM (Delta ~0.50):</b>\n"
        if state and state.get("active_call_ticker"):
            msg += f"   • Recomprar Call ativa: <code>{state['active_call_ticker']}</code>\n"
        msg += f"   • Vender Call Delta ~0.50: <code>{extra['target_call']['ticker']}</code> (Strike R$ {extra['target_call']['strike']:.2f} | Delta: {extra['target_call']['delta']:.3f})\n"
        msg += "━━━━━━━━━━━━━━━━━━━━━━━━\n"
        msg += "⚠️ <i>Execute manualmente via Home Broker. Esta operação trava a carteira em Synthetic Cash (Delta Líquido ~0.00).</i>"
        
    return msg

def run_strategy():
    """Função principal que coordena a execução da estratégia quantitativa de hedge."""
    print("Iniciando varredura da estratégia de hedge...")
    
    # 1. Carregar Estado
    state = load_state()
    
    # 2. Calcular Indicadores Quantitativos via MT5
    try:
        indicators = calculate_quant_indicators()
        print("Indicadores quantitativos calculados com sucesso:")
        for k, v in indicators.items():
            print(f"  {k}: {v}")
    except Exception as e:
        print(f"Erro nos cálculos quantitativos: {e}")
        send_telegram_message(f"⚠️ <b>Hedge Monitor Error:</b> Erro nos cálculos quantitativos via MT5: <code>{e}</code>")
        return

    # 3. Carregar Grade de Opções via opcoes.net.br
    try:
        options_chain = fetch_options_chain()
        underlying_asset = options_chain.get("underlying_asset", {})
        best_put, best_call, exp_info, put_375, call_131, put_20, put_275, call_275, put_50, call_50, call_06 = find_target_options(options_chain)
        print("Grade de opções obtida e melhores ativos selecionados:")
        print(f"  Put ideal: {best_put}")
        print(f"  Call ideal: {best_call}")
        print(f"  Vencimento: {exp_info}")
    except Exception as e:
        print(f"Erro ao processar grade de opções: {e}")
        send_telegram_message(f"⚠️ <b>Hedge Monitor Error:</b> Falha ao obter grade de opções: <code>{e}</code>")
        return

    # Buscar cotação dos ativos da perna ativa
    active_put_quote = None
    active_call_quote = None
    for exp in options_chain.get("expirations", []):
        if state.get("active_put_ticker") and not active_put_quote:
            for p in exp.get("puts", []):
                if f"BBDC{p[0]}" == state["active_put_ticker"]:
                    active_put_quote = {
                        "ticker": state["active_put_ticker"],
                        "strike": float(p[3]),
                        "price": float(p[6]) if p[6] is not None else 0.0,
                        "iv": float(p[17]) if p[17] is not None else 0.0,
                        "delta": float(p[18]) if p[18] is not None else 0.0
                    }
        if state.get("active_call_ticker") and not active_call_quote:
            for c in exp.get("calls", []):
                if f"BBDC{c[0]}" == state["active_call_ticker"]:
                    active_call_quote = {
                        "ticker": state["active_call_ticker"],
                        "strike": float(c[3]),
                        "price": float(c[6]) if c[6] is not None else 0.0,
                        "iv": float(c[17]) if c[17] is not None else 0.0,
                        "delta": float(c[18]) if c[18] is not None else 0.0
                    }

    # 4. Processar a Árvore de Decisão
    current_price = indicators["close_price"]
    tsmom = indicators["tsmom_composite"]
    vol_zscore = indicators["vol_zscore"]
    hv_20d = indicators["hv_20"]
    
    iv_p = underlying_asset.get("iv_p", 0.0)
    
    # Z-Score da IV (20d)
    current_put_iv = active_put_quote["iv"] if (state["hedge_active"] and active_put_quote) else iv_p
    
    # Função auxiliar de Z-Score de IV local
    def get_iv_zscore(current_iv: float) -> float:
        if not os.path.exists(HISTORY_FILE):
            return 0.0
        try:
            df = pd.read_csv(HISTORY_FILE)
            if len(df) < 5:
                return 0.0
            ivs = df['iv_puts'].astype(float).tolist()
            ivs.append(current_iv)
            slice_ivs = ivs[-20:]
            mean = np.mean(slice_ivs)
            std = np.std(slice_ivs)
            return (current_iv - mean) / std if std > 0 else 0.0
        except Exception as err:
            print(f"Erro ao calcular Z-Score de IV: {err}")
            return 0.0

    iv_zscore = get_iv_zscore(current_put_iv)
    
    # Delta Líquido
    put_delta = active_put_quote["delta"] if (state.get("active_put_ticker") and active_put_quote) else 0.0
    call_delta = active_call_quote["delta"] if (state.get("active_call_ticker") and active_call_quote) else 0.0
    delta_net = 1.0 + put_delta - call_delta
    
    # Skew da superfície
    skew = (put_375["iv"] - call_131["iv"]) * 100

    # VRP da Put Selecionada (IV da Put - Realized Volatility)
    put_iv = best_put["iv"] if best_put else iv_p
    vrp_put = put_iv - hv_20d

    # Inicializa o Regime KAMA se não estiver definido
    if not state.get("regime"):
        state["regime"] = "A" if current_price > indicators["kama"] else "B"
        save_state(state)
    current_regime = state["regime"]

    # Grava no CSV (incluindo kama e regime)
    log_metrics_history(
        datetime.now().strftime("%Y-%m-%d"), 
        indicators, 
        current_put_iv, 
        vrp_put, 
        state["hedge_active"],
        indicators["kama"],
        state["regime"]
    )
    
    # Ações baseadas no Estado Atual (Crossover KAMA)
    alert_triggered = False
    
    # Crossover para CIMA da KAMA (Regime B -> Regime A)
    if current_regime == "B" and current_price > indicators["kama"]:
        reason = f"Preço cruzou para CIMA da média adaptativa KAMA (Preço: R$ {current_price:.2f} > KAMA: R$ {indicators['kama']:.2f})."
        extra_data = {
            "price": current_price,
            "kama": indicators["kama"],
            "target_call": call_06
        }
        alert_text = format_telegram_alert("KAMA_CROSS_ABOVE", reason, best_put, best_call, exp_info, state, extra_data)
        alert_success = send_telegram_message(alert_text)
        
        if alert_success:
            state["regime"] = "A"
            state["activation_date"] = datetime.now().strftime("%Y-%m-%d")
            state["activation_price"] = current_price
            
            # Desmonta Put
            state["active_put_ticker"] = None
            state["active_put_strike"] = None
            state["put_premium_paid"] = 0.0
            
            # Rola Call para cima (OTM)
            state["active_call_ticker"] = call_06["ticker"]
            state["active_call_strike"] = call_06["strike"]
            state["call_premium_received"] = call_06["price"]
            
            state["net_premium_cost"] = -call_06["price"]
            state["hedge_active"] = True
            
            save_state(state)
            alert_triggered = True
            print("Alerta KAMA Cross Above enviado e estado atualizado para Regime A.")
            
    # Crossover para BAIXO da KAMA (Regime A -> Regime B)
    elif current_regime == "A" and current_price < indicators["kama"]:
        reason = f"Preço cruzou para BAIXO da média adaptativa KAMA (Preço: R$ {current_price:.2f} < KAMA: R$ {indicators['kama']:.2f})."
        extra_data = {
            "price": current_price,
            "kama": indicators["kama"],
            "target_put": put_50,
            "target_call": call_50
        }
        alert_text = format_telegram_alert("KAMA_CROSS_BELOW", reason, best_put, best_call, exp_info, state, extra_data)
        alert_success = send_telegram_message(alert_text)
        
        if alert_success:
            state["regime"] = "B"
            state["activation_date"] = datetime.now().strftime("%Y-%m-%d")
            state["activation_price"] = current_price
            
            # Pernas ATM
            state["active_put_ticker"] = put_50["ticker"]
            state["active_put_strike"] = put_50["strike"]
            state["put_premium_paid"] = put_50["price"]
            
            state["active_call_ticker"] = call_50["ticker"]
            state["active_call_strike"] = call_50["strike"]
            state["call_premium_received"] = call_50["price"]
            
            state["net_premium_cost"] = put_50["price"] - call_50["price"]
            state["hedge_active"] = True
            
            save_state(state)
            alert_triggered = True
            print("Alerta KAMA Cross Below enviado e estado atualizado para Regime B.")
            
    # Enviar relatório de acompanhamento diário caso nenhum alerta de crossover tenha sido acionado
    if not alert_triggered:
        report_text = format_telegram_report(indicators, underlying_asset, best_put, best_call, exp_info, state)
        success = send_telegram_message(report_text)
        if success:
            print("Relatório diário enviado com sucesso!")
        else:
            print("Erro ao enviar relatório diário para o Telegram.")

if __name__ == "__main__":
    run_strategy()
