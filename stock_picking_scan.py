import os
import sys
import json
import warnings
import requests
import numpy as np
import pandas as pd
from datetime import datetime
import concurrent.futures

# Desativar avisos do pandas
warnings.filterwarnings('ignore')

# Guardar stdout original para a impressão final
original_stdout = sys.stdout

# Criar classe Dummy que ignora escritas e nunca lança erro de arquivo fechado
class DummyWriter:
    def write(self, x):
        pass
    def flush(self):
        pass

# Redirecionar stdout e stderr globais para o DummyWriter
sys.stdout = DummyWriter()
sys.stderr = DummyWriter()

# Configurar yfinance para ser silencioso
os.environ["YF_NO_PRINTS"] = "1"

import yfinance as yf

# Configurar sessão requests com cabeçalhos de navegador real
session = requests.Session()
session.headers.update({
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
    'Connection': 'keep-alive',
})

# Lista de tickers fornecida pelo usuário
TICKERS = [
    "ALOS3.SA", "ABEV3.SA", "ANIM3.SA", "ASAI3.SA", "AURE3.SA", "AXIA3.SA", "AZZA3.SA", "B3SA3.SA",
    "BBSE3.SA", "BBDC3.SA", "BBDC4.SA", "BRAP4.SA", "SAUD3.SA", "BBAS3.SA", "BRKM5.SA", "BRAV3.SA",
    "BPAC11.SA", "CXSE3.SA", "CBAV3.SA", "CEAB3.SA", "CMIG4.SA", "COGN3.SA", "CSMG3.SA", "CPLE3.SA",
    "CSAN3.SA", "CPFE3.SA", "CMIN3.SA", "CURY3.SA", "CVCB3.SA", "CYRE3.SA", "DIRR3.SA", "ECOR3.SA",
    "EMBJ3.SA", "ENGI11.SA", "ENEV3.SA", "EGIE3.SA", "EQTL3.SA", "EZTC3.SA", "FLRY3.SA", "GGBR4.SA",
    "GOAU4.SA", "GGPS3.SA", "GMAT3.SA", "HAPV3.SA", "HYPE3.SA", "IGTI11.SA", "INTB3.SA", "IRBR3.SA",
    "ISAE4.SA", "ITSA4.SA", "ITUB3.SA", "ITUB4.SA", "JHSF3.SA", "KLBN11.SA", "RENT3.SA", "LREN3.SA",
    "MGLU3.SA", "POMO4.SA", "MBRF3.SA", "BEEF3.SA", "MOTV3.SA", "MDNE3.SA", "MOVI3.SA", "MRVE3.SA",
    "MULT3.SA", "NATU3.SA", "ORVR3.SA", "PETR3.SA", "PETR4.SA", "RECV3.SA", "AUAU3.SA", "PSSA3.SA",
    "PRIO3.SA", "RADL3.SA", "RAPT4.SA", "RDOR3.SA", "RAIL3.SA", "SBSP3.SA", "SAPR11.SA", "SANB11.SA",
    "SMTO3.SA", "CSNA3.SA", "SIMH3.SA", "SLCE3.SA", "SMFT3.SA", "SUZB3.SA", "TAEE11.SA", "VIVT3.SA",
    "TEND3.SA", "TIMS3.SA", "TOTS3.SA", "UGPA3.SA", "USIM5.SA", "VALE3.SA", "VAMO3.SA", "VBBR3.SA",
    "VIVA3.SA", "WEGE3.SA", "YDUQ3.SA"
]

def get_fallback_record(ticker, error_msg="Erro"):
    clean_ticker = ticker.replace(".SA", "")
    return {
        "ticker": clean_ticker,
        "preco_atual": 0.0,
        "preco_sinal": 0.0,
        "z_price": 0.0,
        "vol_ratio": 0.0,
        "z_volume": 0.0,
        "vol_60d": 0.001,  # Evitar divisão por zero
        "momentum_3m": 0.0,
        "score_quant": -9999.0,  # Ordenação por último
        "data_sinal": datetime.now().strftime("%Y-%m-%d"),
        "days_ago": 0,
        "cond_price": False,
        "cond_vol": False,
        "cond_vol_z": False,
        "decisao": "HOLD",
        "alocacao_sugerida": 0.0,
        "error": error_msg
    }

def analyze_ticker(ticker, lookback_days=30):
    """
    Baixa histórico de 1 ano do ticker e executa as análises quantitativas.
    Varre os últimos 'lookback_days' dias. Se encontrar sinal, marca decisao = 'COMPRA'.
    Caso contrário, retorna decisao = 'HOLD' com métricas atuais do fechamento.
    """
    try:
        t = yf.Ticker(ticker, session=session)
        df = t.history(period="1y")
            
        if df is None or df.empty:
            return get_fallback_record(ticker, "Sem dados historicos")
            
        # Remover placeholder zero-rows
        df = df[(df['Close'] > 0) & (df['Volume'] > 0)]
        
        if len(df) < 65:
            return get_fallback_record(ticker, "Historico curto (<65 dias)")
            
        # 1. Z-Score de Preço (Z_Price) - Agora 20 dias
        df['ma_20'] = df['Close'].rolling(20).mean()
        df['std_20'] = df['Close'].rolling(20).std()
        df['z_price'] = (df['Close'] - df['ma_20']) / df['std_20']
        
        # 2. Regime de Volatilidade (Vol_Ratio) - Agora 5d vs 20d
        df['log_ret'] = np.log(df['Close'] / df['Close'].shift(1))
        df['vol_5d'] = df['log_ret'].rolling(5).std() * np.sqrt(252)
        df['vol_20d'] = df['log_ret'].rolling(20).std() * np.sqrt(252)
        df['vol_60d'] = df['log_ret'].rolling(60).std() * np.sqrt(252) # Mantido para cálculo de Risk Parity
        df['vol_ratio'] = df['vol_5d'] / df['vol_20d']
        
        # 3. Z-Score de Volume (Z_Volume) - Agora 20 dias
        df['ma_vol_20'] = df['Volume'].rolling(20).mean()
        df['std_vol_20'] = df['Volume'].rolling(20).std()
        df['z_volume'] = (df['Volume'] - df['ma_vol_20']) / df['std_vol_20']
        
        total_rows = len(df)
        start_idx = max(50, total_rows - lookback_days)
        
        # Procura por sinal de compra nas datas dentro da janela de lookback
        trigger_found = False
        trigger_idx = -1
        
        for i in range(total_rows - 1, start_idx - 1, -1):
            z_price_t0 = df['z_price'].iloc[i]
            z_price_t1 = df['z_price'].iloc[i-1]
            vol_ratio = df['vol_ratio'].iloc[i]
            z_vol = df['z_volume'].iloc[i]
            
            c_price = (z_price_t0 > 1.0) or (z_price_t1 > 1.0)
            c_vol = vol_ratio > 1.05
            c_volume = z_vol > 0.8
            
            if c_price and c_vol and c_volume:
                trigger_found = True
                trigger_idx = i
                break
                
        # Nome limpo do ticker
        clean_ticker = ticker.replace(".SA", "")
        
        # O preço de fechamento mais recente (D0)
        close_d0 = float(df['Close'].iloc[-1])
        
        # Filtro de Invalidação de Sinal para Swing Trade
        if trigger_found:
            idx = trigger_idx
            close_signal = float(df['Close'].iloc[idx])
            vol_60d_signal = float(df['vol_60d'].iloc[idx])
            
            # Estimativa de stop loss do dia do sinal
            vol_diaria = vol_60d_signal / 15.87
            risk_percent = max(0.025, min(0.075, 2.0 * vol_diaria))
            stop_loss = close_signal * (1.0 - risk_percent)
            
            # Verifica se fechou abaixo do stop em algum momento entre o dia do sinal e hoje
            has_stopped_out = False
            for j in range(idx, total_rows):
                if float(df['Close'].iloc[j]) < stop_loss:
                    has_stopped_out = True
                    break
            
            # Se o preço atual está abaixo da MMA20 (z_price < 0) ou já estopou
            z_price_current = float(df['z_price'].iloc[-1])
            if has_stopped_out or z_price_current < 0.0 or close_d0 < stop_loss:
                trigger_found = False # Invalida o sinal e força a decisão de HOLD
        
        if trigger_found:
            # Dados correspondentes ao sinal de COMPRA
            idx = trigger_idx
            date_signal = df.index[idx]
            close_signal = float(df['Close'].iloc[idx])
            z_price_signal = float(df['z_price'].iloc[idx])
            vol_ratio_signal = float(df['vol_ratio'].iloc[idx])
            z_volume_signal = float(df['z_volume'].iloc[idx])
            vol_60d_signal = float(df['vol_60d'].iloc[idx])
            
            price_3m_ago = float(df['Close'].iloc[idx-63]) if (idx-63 >= 0) else float(df['Close'].iloc[0])
            momentum_3m = ((close_signal - price_3m_ago) / price_3m_ago) * 100
            score_quant = momentum_3m / vol_60d_signal if vol_60d_signal > 0 else 0
            
            return {
                "ticker": clean_ticker,
                "preco_atual": close_d0,        # Preço de hoje
                "preco_sinal": close_signal,    # Preço do dia do sinal
                "z_price": z_price_signal,
                "vol_ratio": vol_ratio_signal,
                "z_volume": z_volume_signal,
                "vol_60d": vol_60d_signal,
                "momentum_3m": momentum_3m,
                "score_quant": score_quant,
                "data_sinal": date_signal.strftime("%Y-%m-%d"),
                "days_ago": total_rows - 1 - idx,
                "cond_price": True,
                "cond_vol": True,
                "cond_vol_z": True,
                "decisao": "COMPRA",
                "alocacao_sugerida": 0.0  # Calculado posteriormente no agregador
            }
        else:
            # Sem sinal na janela: Retorna HOLD com as métricas do fechamento atual (D0)
            idx = total_rows - 1
            date_d0 = df.index[idx]
            z_price_d0 = float(df['z_price'].iloc[idx])
            z_price_d1 = float(df['z_price'].iloc[idx-1])
            vol_ratio_d0 = float(df['vol_ratio'].iloc[idx])
            z_volume_d0 = float(df['z_volume'].iloc[idx])
            vol_60d_d0 = float(df['vol_60d'].iloc[idx])
            
            price_3m_ago = float(df['Close'].iloc[idx-63]) if (idx-63 >= 0) else float(df['Close'].iloc[0])
            momentum_3m = ((close_d0 - price_3m_ago) / price_3m_ago) * 100
            score_quant = momentum_3m / vol_60d_d0 if vol_60d_d0 > 0 else 0
            
            cond_price = (z_price_d0 > 1.0) or (z_price_d1 > 1.0)
            cond_vol = vol_ratio_d0 > 1.05
            cond_vol_z = z_volume_d0 > 0.8
            
            return {
                "ticker": clean_ticker,
                "preco_atual": close_d0,
                "preco_sinal": 0.0,
                "z_price": z_price_d0,
                "vol_ratio": vol_ratio_d0,
                "z_volume": z_volume_d0,
                "vol_60d": vol_60d_d0,
                "momentum_3m": momentum_3m,
                "score_quant": score_quant,
                "data_sinal": date_d0.strftime("%Y-%m-%d"),
                "days_ago": 0,
                "cond_price": cond_price,
                "cond_vol": cond_vol,
                "cond_vol_z": cond_vol_z,
                "decisao": "HOLD",
                "alocacao_sugerida": 0.0
            }
    except Exception as e:
        return get_fallback_record(ticker, f"Erro: {str(e)}")

def run_scan():
    # Ler parâmetro de lookback (padrão 30 dias úteis)
    lookback_days = 30
    if len(sys.argv) > 1:
        try:
            lookback_days = int(sys.argv[1])
        except:
            pass

    results = []
    
    # Execução paralela dos 99 tickers
    with concurrent.futures.ThreadPoolExecutor(max_workers=10) as executor:
        future_to_ticker = {executor.submit(analyze_ticker, t, lookback_days): t for t in TICKERS}
        for future in concurrent.futures.as_completed(future_to_ticker):
            res = future.result()
            if res is not None:
                results.append(res)
                
    # Calcula a alocação Risk Parity baseada no inverso da volatilidade de 60d
    # Apenas os ativos em COMPRA recebem alocação positiva, proporcional ao risco
    compra_signals = [r for r in results if r["decisao"] == "COMPRA"]
    
    if compra_signals:
        inv_vols = []
        for r in compra_signals:
            vol = r["vol_60d"]
            inv_vol = 1.0 / vol if vol > 0 else 0.0001
            inv_vols.append(inv_vol)
            
        sum_inv_vol = sum(inv_vols)
        for i, r in enumerate(compra_signals):
            weight = (inv_vols[i] / sum_inv_vol) * 100 if sum_inv_vol > 0 else 0.0
            r["alocacao_sugerida"] = weight
            
        # Sincroniza de volta no vetor geral de resultados
        for r in results:
            if r["decisao"] == "COMPRA":
                # Acha o correspondente calculado
                matching = next(c for c in compra_signals if c["ticker"] == r["ticker"])
                r["alocacao_sugerida"] = matching["alocacao_sugerida"]
            else:
                r["alocacao_sugerida"] = 0.0
                
    # Ordenar do maior para o menor "Score Quant"
    results.sort(key=lambda x: x["score_quant"], reverse=True)
    
    # Imprime apenas o resultado JSON final no stdout original
    original_stdout.write(json.dumps(results, indent=4) + "\n")
    original_stdout.flush()

if __name__ == "__main__":
    run_scan()
