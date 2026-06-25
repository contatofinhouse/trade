import os
import json
import time
from datetime import datetime
import numpy as np
import pandas as pd
import MetaTrader5 as mt5
from dotenv import load_dotenv
from notifier import send_telegram_message

# Carrega as variáveis de ambiente
load_dotenv()

# Configurações do Symbol e Parâmetros
SYMBOL = os.getenv("WIN_SYMBOL", "WINQ26")
STATE_FILE = "win_intraday_state.json"

# Módulo do Filtro de Kalman 1D
def calculate_kalman_filter(prices, Q=0.05, R=1.0):
    kalman_series = []
    if len(prices) == 0:
        return kalman_series
    x = prices[0]
    P = 1.0
    kalman_series.append(x)
    for i in range(1, len(prices)):
        P_prior = P + Q
        K = P_prior / (P_prior + R)
        x = x + K * (prices[i] - x)
        P = (1.0 - K) * P_prior
        kalman_series.append(x)
    return kalman_series

# Módulo de RSI(2)
def calculate_rsi(prices, period=2):
    deltas = np.diff(prices)
    if len(prices) <= period:
        return np.full_like(prices, 50.0)
    
    seed = deltas[:period+1]
    up = seed[seed >= 0].sum() / period
    down = -seed[seed < 0].sum() / period
    rs = up / down if down > 0 else 0
    rsi = np.zeros_like(prices)
    rsi[:period] = 100. - 100. / (1. + rs)
    
    for i in range(period, len(prices)):
        delta = deltas[i-1]
        if delta > 0:
            up_val = delta
            down_val = 0.
        else:
            up_val = 0.
            down_val = -delta
        up = (up * (period - 1) + up_val) / period
        down = (down * (period - 1) + down_val) / period
        rs = up / down if down > 0 else 0
        rsi[i] = 100. - 100. / (1. + rs)
    return rsi

# Carrega estado persistido
def load_state() -> dict:
    default_state = {
        "signal_state": "NEUTRO",
        "active_position": None,  # None ou dict com dados da posicao
        "last_trade_pnl": 0.0,
        "recent_peaks": []
    }
    if os.path.exists(STATE_FILE):
        try:
            with open(STATE_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
                # Garante chaves fundamentais
                for k in default_state:
                    if k not in data:
                        data[k] = default_state[k]
                return data
        except Exception as e:
            print(f"Erro ao ler estado do day trade: {e}. Resetando.")
    return default_state

# Grava estado persistido
def save_state(state: dict):
    try:
        with open(STATE_FILE, "w", encoding="utf-8") as f:
            json.dump(state, f, indent=4, ensure_ascii=False)
    except Exception as e:
        print(f"Erro ao salvar estado: {e}")

# Formata mensagem para o Telegram
def send_telegram_alert(title, text):
    msg = f"⚡ <b>[WINQ26 DAY TRADE]</b> ⚡\n\n"
    msg += f"🚨 <b>{title}</b>\n"
    msg += f"━━━━━━━━━━━━━━━━━━━━\n"
    msg += text
    send_telegram_message(msg)

def run_intraday_monitor():
    print(f"Iniciando conexao com o MetaTrader 5 para buscar {SYMBOL}...")
    if not mt5.initialize():
        print(f"Erro ao inicializar o MT5: {mt5.last_error()}")
        return
        
    try:
        # 1. Puxa as últimas 300 barras de M5 do WINQ26
        # Aumentamos para 300 para garantir barras do dia e do dia anterior
        rates = mt5.copy_rates_from_pos(SYMBOL, mt5.TIMEFRAME_M5, 0, 300)
        if rates is None or len(rates) == 0:
            print(f"Nao foi possível obter dados para {SYMBOL} no MT5. Erro: {mt5.last_error()}")
            return
            
        df = pd.DataFrame(rates)
        df['time'] = pd.to_datetime(df['time'], unit='s')
        
        # Filtra apenas a sessão do dia atual (B3)
        today_date = df['time'].dt.date.iloc[-1]
        df_today = df[df['time'].dt.date == today_date].copy()
        
        if len(df_today) < 10:
            print(f"Sessao de hoje ({today_date}) possui poucos dados ({len(df_today)} bars). Aguardando...")
            return
            
        closes = df_today['close'].values
        highs = df_today['high'].values
        lows = df_today['low'].values
        
        # O volume do minicontrato futuro no MT5 é o 'real_volume'
        volume_col = 'real_volume' if df_today['real_volume'].sum() > 0 else 'tick_volume'
        volumes = df_today[volume_col].values
        times = df_today['time']
        
        # 2. Calcular Indicadores Intraday
        cum_pv = (closes * volumes).cumsum()
        cum_vol = volumes.cumsum()
        vwap = cum_pv / np.where(cum_vol > 0, cum_vol, 1)
        
        # Bandas de desvio padrão em torno da VWAP
        sd_20 = df_today['close'].rolling(20, min_periods=1).std().values
        vwap_upper_1 = vwap + 1.0 * sd_20
        vwap_upper_2 = vwap + 2.0 * sd_20
        vwap_lower_2 = vwap - 2.0 * sd_20
        vwap_zscore = (closes - vwap) / np.where(sd_20 > 0, sd_20, 1)
        
        rsi2 = calculate_rsi(closes, period=2)
        kalman = calculate_kalman_filter(closes, Q=0.05, R=1.0)
        
        # 3. Detectar picos (Highs locais com tolerância)
        peaks = []
        for i in range(3, len(df_today) - 3):
            current_high = highs[i]
            is_peak = True
            for offset in [-3, -2, -1, 1, 2, 3]:
                if highs[i + offset] > current_high:
                    is_peak = False
                    break
            if is_peak and current_high >= vwap_upper_2[i] * 0.995:
                peaks.append({
                    'idx': int(i),
                    'time': times.iloc[i].strftime('%H:%M'),
                    'price': float(current_high),
                    'volume': float(volumes[i]),
                    'rsi': float(rsi2[i])
                })
                
        # 4. Processar estado da Posição Dinâmica
        state = load_state()
        active_pos = state.get("active_position")
        signal_state = state.get("signal_state", "NEUTRO")
        
        current_idx = len(df_today) - 1
        current_price = float(closes[-1])
        current_high = float(highs[-1])
        current_low = float(lows[-1])
        current_time_str = times.iloc[-1].strftime('%H:%M')
        
        win_point_value = 0.20
        
        if active_pos is not None:
            # Temos uma operação ativa!
            entry_price = active_pos["entry_price"]
            stop_loss = active_pos["stop_loss"]
            tp1 = active_pos["tp1"]
            tp2 = active_pos["tp2"]
            entry_idx = active_pos["entry_idx"]
            has_taken_partial = active_pos.get("has_taken_partial", False)
            contracts = active_pos.get("contracts", 10)
            
            # A. Verificar Time-Stop (8 barras de 5m = 40 minutos)
            if current_idx - entry_idx >= 8:
                pnl_pts = entry_price - current_price
                current_contracts = contracts // 2 if has_taken_partial else contracts
                pnl_fin = pnl_pts * win_point_value * current_contracts
                
                text = f"Encerramento por <b>TIME-STOP (40 min)</b>\n"
                text += f" • Preco de Saída: <b>{current_price:.0f} pts</b>\n"
                text += f" • Pontos: <b>{pnl_pts:+.0f} pts</b>\n"
                text += f" • PnL Financeiro: <b>R$ {pnl_fin:+.2f}</b>"
                send_telegram_alert("POSIÇÃO ENCERRADA (TIME-STOP)", text)
                
                state["active_position"] = None
                state["signal_state"] = "NEUTRO (TIME-STOP)"
                state["last_trade_pnl"] = pnl_fin
                save_state(state)
                
            # B. Verificar Stop Loss
            elif current_high >= stop_loss:
                pnl_pts = entry_price - stop_loss
                current_contracts = contracts // 2 if has_taken_partial else contracts
                pnl_fin = pnl_pts * win_point_value * current_contracts
                
                text = f"Encerramento por <b>STOP LOSS</b>\n"
                text += f" • Preco de Saída: <b>{stop_loss:.0f} pts</b>\n"
                text += f" • Pontos: <b>{pnl_pts:+.0f} pts</b>\n"
                text += f" • PnL Financeiro: <b>R$ {pnl_fin:+.2f}</b>"
                send_telegram_alert("POSIÇÃO ESTOPADA", text)
                
                state["active_position"] = None
                state["signal_state"] = "NEUTRO (ESTOPADO)"
                state["last_trade_pnl"] = pnl_fin
                save_state(state)
                
            # C. Verificar Alvo Parcial (TP1)
            elif not has_taken_partial and current_low <= tp1:
                pnl_pts = entry_price - tp1
                pnl_fin = pnl_pts * win_point_value * (contracts // 2)
                
                active_pos["has_taken_partial"] = True
                # Move stop loss para o Break-Even (Preço de Entrada)
                active_pos["stop_loss"] = entry_price
                state["active_position"] = active_pos
                
                text = f"<b>ALVO PARCIAL (TP1) ATINGIDO! 🚀</b>\n"
                text += f" • Realizado: <b>50% do Lote ({contracts // 2} contratos)</b>\n"
                text += f" • Preco de Saída: <b>{tp1:.0f} pts</b>\n"
                text += f" • PnL Parcial: <b>R$ {pnl_fin:+.2f}</b> (+{pnl_pts:.0f} pts)\n"
                text += f" • <b>Acao de Risco:</b> Stop Loss movido para o Break-Even (<b>{entry_price:.0f} pts</b>). Risco Zero ativo!"
                send_telegram_alert("REALIZAÇÃO PARCIAL (TP1)", text)
                
                save_state(state)
                
            # D. Verificar Alvo Final (TP2)
            elif has_taken_partial and current_low <= tp2:
                pnl_pts = entry_price - tp2
                pnl_fin = pnl_pts * win_point_value * (contracts // 2)
                
                text = f"<b>ALVO FINAL (TP2) ATINGIDO! 🎯</b>\n"
                text += f" • Realizado: <b>50% Restante ({contracts // 2} contratos)</b>\n"
                text += f" • Preco de Saída: <b>{tp2:.0f} pts</b>\n"
                text += f" • PnL Final: <b>R$ {pnl_fin:+.2f}</b> (+{pnl_pts:.0f} pts)"
                send_telegram_alert("ALVO FINAL ATINGIDO", text)
                
                state["active_position"] = None
                state["signal_state"] = "NEUTRO (ALVO CONCLUÍDO)"
                state["last_trade_pnl"] = pnl_fin
                save_state(state)
                
        else:
            # Não temos posição ativa: checar novos sinais
            if len(peaks) >= 2:
                p1, p2 = peaks[-2], peaks[-1]
                price_diff_percent = abs(p1['price'] - p2['price']) / p1['price'] * 100
                time_dist_ok = (p2['idx'] - p1['idx']) >= 4
                
                # Se o pico ocorreu nos últimos 20 minutos (4 barras)
                recent_peak = (current_idx - p2['idx']) <= 4
                
                volume_exhaustion = True
                if p1['volume'] > 0 and p2['volume'] > 0:
                    volume_exhaustion = (p2['volume'] / p1['volume']) <= 0.85
                    
                zscore_ok = vwap_zscore[p2['idx']] >= 1.5
                
                # Reversão: Preço cruzou para baixo da linha de Kalman
                reversal_trigger = current_price < kalman[-1] and closes[-2] >= kalman[-2]
                
                if price_diff_percent <= 0.12 and time_dist_ok and recent_peak and volume_exhaustion and zscore_ok and reversal_trigger:
                    # GATILHO DE SHORT CONFIRMADO!
                    entry_price = current_price
                    stop_loss = max(p1['price'], p2['price']) * 1.0008
                    current_sd = sd_20[-1]
                    tp1 = entry_price - current_sd
                    tp2 = vwap[-1]
                    
                    new_pos = {
                        "entry_price": entry_price,
                        "stop_loss": stop_loss,
                        "tp1": tp1,
                        "tp2": tp2,
                        "entry_idx": int(current_idx),
                        "has_taken_partial": False,
                        "contracts": 10
                    }
                    
                    state["active_position"] = new_pos
                    state["signal_state"] = "SHORT"
                    
                    text = f"<b>Sinal de Venda (SHORT) Identificado! 🔴</b>\n"
                    text += f" • Ticker: <b>{SYMBOL}</b>\n"
                    text += f" • Preco de Entrada: <b>{entry_price:.0f} pts</b>\n"
                    text += f" • Topo 1: <b>{p1['price']:.0f} pts</b> ({p1['time']})\n"
                    text += f" • Topo 2: <b>{p2['price']:.0f} pts</b> ({p2['time']})\n"
                    text += f" • Stop Loss: <b>{stop_loss:.0f} pts</b>\n"
                    text += f" • Realizacao Parcial (TP1): <b>{tp1:.0f} pts</b>\n"
                    text += f" • Realizacao Final (TP2): <b>{tp2:.0f} pts</b>\n"
                    text += f" • Lote Recomendado: <b>10 contratos</b>"
                    send_telegram_alert("ENTRADA SHORT ACIONADA", text)
                    
                    save_state(state)
                    
        # 5. Salvar histórico de candles de 5m para plotar gráfico no frontend
        # Para economizar espaço, salvamos apenas as últimas 50 barras
        chart_bars = []
        start_idx = max(0, len(df_today) - 60)
        for i in range(start_idx, len(df_today)):
            chart_bars.append({
                "time": times.iloc[i].strftime('%H:%M'),
                "open": float(df_today['open'].iloc[i]),
                "high": float(df_today['high'].iloc[i]),
                "low": float(df_today['low'].iloc[i]),
                "close": float(df_today['close'].iloc[i]),
                "vwap": float(vwap[i]),
                "upper_1": float(vwap_upper_1[i]),
                "upper_2": float(vwap_upper_2[i]),
                "lower_2": float(vwap_lower_2[i]),
                "kalman": float(kalman[i]),
                "zscore": float(vwap_zscore[i])
            })
            
        # Projeção Estatística de Preço (Hedge Fund Price Target Forecast)
        zscore_val = float(vwap_zscore[-1])
        if zscore_val >= 1.5:
            expected_dir = "RETORNO À MÉDIA (QUEDA)"
            target_p = float(vwap[-1])
            desc = "Preço esticado para cima (+1.5+ SD da VWAP). Expectativa estatística de correção de queda até a VWAP."
            prob = "Alta Reversão (~90%)"
        elif zscore_val <= -1.5:
            expected_dir = "RETORNO À MÉDIA (ALTA)"
            target_p = float(vwap[-1])
            desc = "Preço esticado para baixo (-1.5- SD da VWAP). Expectativa estatística de recuperação de alta até a VWAP."
            prob = "Alta Reversão (~90%)"
        else:
            # Se o preço está perto da VWAP, ele tende a seguir o Kalman Filter intraday
            kalman_diff = current_price - kalman[-1]
            if kalman_diff > 10:
                expected_dir = "TENDÊNCIA COMPRADORA (M5)"
                target_p = float(vwap_upper_2[-1])
                desc = "Preço equilibrado em relação à VWAP. Seguindo momentum de alta do Filtro de Kalman rumo à banda superior."
                prob = "Moderada (~60%)"
            elif kalman_diff < -10:
                expected_dir = "TENDÊNCIA VENDEDORA (M5)"
                target_p = float(vwap_lower_2[-1])
                desc = "Preço equilibrado em relação à VWAP. Seguindo momentum de queda do Filtro de Kalman rumo à banda inferior."
                prob = "Moderada (~60%)"
            else:
                expected_dir = "CONSOLIDAÇÃO NEUTRA"
                target_p = float(vwap[-1])
                desc = "Preço travado na média (VWAP). Sem tendência direcional clara no intraday."
                prob = "Indefinida"

        projection = {
            "expected_direction": expected_dir,
            "projected_target": target_p,
            "projected_ceiling": float(vwap_upper_2[-1]),
            "projected_floor": float(vwap_lower_2[-1]),
            "probability": prob,
            "description": desc
        }

        # Junta todas as estatísticas no arquivo de estado
        output_data = {
            "symbol": SYMBOL,
            "last_price": current_price,
            "last_time": current_time_str,
            "vwap": float(vwap[-1]),
            "kalman": float(kalman[-1]),
            "rsi2": float(rsi2[-1]),
            "zscore": float(vwap_zscore[-1]),
            "signal_state": state["signal_state"],
            "active_position": state["active_position"],
            "recent_peaks": sorted(peaks, key=lambda x: x['price'], reverse=True)[:3],  # 3 maiores resistências do dia
            "projection": projection,
            "chart_data": chart_bars
        }
        
        with open(STATE_FILE, "w", encoding="utf-8") as f:
            json.dump(output_data, f, indent=4)
            
        print(f"Estado de tempo real do WINQ26 atualizado com sucesso. Preco: {current_price} | Sinal: {state['signal_state']}")
        
    finally:
        mt5.shutdown()

if __name__ == "__main__":
    # Roda uma vez se executado como script principal para teste rápido
    run_intraday_monitor()
