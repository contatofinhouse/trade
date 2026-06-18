import { NextResponse } from "next/server";
import { getQuantIndicators } from "@/lib/quant";
import { fetchSelectedCollarOptions, fetchActiveOptionsQuotes } from "@/lib/options";
import { getHedgeState, saveHedgeState, getMetricsHistory, saveMetricsHistory, MetricRow } from "@/lib/db";

// Força o Next.js a ignorar cache e executar dinamicamente a rota da API
export const dynamic = "force-dynamic";

async function sendTelegramMessage(text: string): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    console.warn("Telegram BOT Token ou Chat ID não configurados.");
    return false;
  }

  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: text,
        parse_mode: "HTML"
      })
    });
    return res.ok;
  } catch (e) {
    console.error("Erro ao enviar mensagem ao Telegram:", e);
    return false;
  }
}

function formatTelegramReport(indicators: any, collar: any, state: any): string {
  const regimeStr = state.regime === "A" 
    ? "📈 <b>REGIME A (TENDÊNCIA DE ALTA)</b>" 
    : "📉 <b>REGIME B (PRESERVAÇÃO DE CAPITAL)</b>";
  
  let msg = `📊 <b>Relatório Diário de Hedge - BBDC4</b>\n`;
  msg += `Data de Cálculo: ${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}\n`;
  msg += `Regime KAMA: ${regimeStr}\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `💵 Preço de Fechamento: R$ ${indicators.close_price.toFixed(2)}\n`;
  msg += `📊 Média Adaptativa KAMA: R$ ${indicators.kama.toFixed(2)} (${indicators.close_price > indicators.kama ? "Preço > KAMA" : "Preço < KAMA"})\n`;
  msg += `📈 TSMOM Composto (Mom.): ${indicators.tsmom_composite.toFixed(4)} (1M: ${indicators.tsmom_1m.toFixed(2)} | 3M: ${indicators.tsmom_3m.toFixed(2)})\n`;
  msg += `📉 Vol. Histórica (HV 20d): ${(indicators.hv_20 * 100).toFixed(1)}%\n`;
  msg += `📊 Z-Score de Vol. (HV): ${indicators.vol_zscore.toFixed(2)}\n`;
  
  const ivP = collar.underlying_asset.iv_p;
  const vrp = ivP - indicators.hv_20;
  msg += `🔮 Vol. Implícita (IV Puts): ${(ivP * 100).toFixed(1)}%\n`;
  msg += `🛡️ Vol. Risk Premium (VRP): ${vrp >= 0 ? "+" : ""}${(vrp * 100).toFixed(1)}% (IV - HV)\n`;
  msg += `📊 Percentil IV Puts 12M: ${(collar.underlying_asset.ivp_p_12m * 100).toFixed(1)}%\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  
  if (state.active_put_ticker || state.active_call_ticker) {
    msg += `📌 <b>Hedge Ativo na Carteira:</b>\n`;
    msg += ` • Montado em: ${state.activation_date}\n`;
    msg += ` • Preço de Entrada: R$ ${state.activation_price.toFixed(2)}\n`;
    if (state.active_put_ticker) {
      msg += ` • Put Comprada: ${state.active_put_ticker} (K: R$ ${state.active_put_strike.toFixed(2)})\n`;
    } else {
      msg += ` • Put Comprada: DESMONTADA (Regime A)\n`;
    }
    if (state.active_call_ticker) {
      msg += ` • Call Vendida: ${state.active_call_ticker} (K: R$ ${state.active_call_strike.toFixed(2)})\n`;
    }
    msg += `━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  }
  
  return msg;
}

function formatTelegramAlert(
  alertType: "KAMA_CROSS_ABOVE" | "KAMA_CROSS_BELOW" | "ACTIVATE" | "DEACTIVATE",
  reason: string,
  collar: any,
  state: any,
  extra?: any
): string {
  let msg = "";
  
  if (alertType === "KAMA_CROSS_ABOVE") {
    msg += `📈 <b>ALERTA KAMA: TENDÊNCIA DE ALTA (REGIME A)</b> 📈\n\n`;
    msg += `O preço de BBDC4 (R$ ${extra.price.toFixed(2)}) cruzou para <b>CIMA</b> da média adaptativa KAMA (R$ ${extra.kama.toFixed(2)}).\n\n`;
    msg += `<b>Ações Operacionais de Execução (Maximizar Alfa):</b>\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    if (state.active_put_ticker) {
      msg += `🔴 <b>DESMONTAR PUT (Venda):</b>\n`;
      msg += `   Zerar Put ativa <code>${state.active_put_ticker}</code> (Strike R$ ${state.active_put_strike.toFixed(2)})\n\n`;
    } else {
      msg += `🔴 <b>DESMONTAR PUT:</b> Nenhuma Put ativa para zerar.\n\n`;
    }
    msg += `🔄 <b>ROLAR CALL PARA CIMA (OTM):</b>\n`;
    if (state.active_call_ticker) {
      msg += `   • Recomprar Call ativa: <code>${state.active_call_ticker}</code>\n`;
    }
    msg += `   • Vender Call Delta ~0.06: <code>${extra.target_call.ticker}</code> (Strike R$ ${extra.target_call.strike.toFixed(2)} | Delta: ${extra.target_call.delta.toFixed(3)})\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `⚠️ <i>Execute manualmente via Home Broker. Esta operação eleva o Delta Líquido para ~0.94 para capturar alta.</i>`;
    
  } else if (alertType === "KAMA_CROSS_BELOW") {
    msg += `📉 <b>ALERTA KAMA: PROTEÇÃO TOTAL / CAIXA (REGIME B)</b> 📉\n\n`;
    msg += `O preço de BBDC4 (R$ ${extra.price.toFixed(2)}) cruzou para <b>BAIXO</b> da média adaptativa KAMA (R$ ${extra.kama.toFixed(2)}).\n\n`;
    msg += `<b>Ações Operacionais de Execução (Preservar Capital):</b>\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `🟢 <b>COMPRAR PUT ATM (Delta ~-0.50):</b>\n`;
    msg += `   Código: <code>${extra.target_put.ticker}</code> (Strike R$ ${extra.target_put.strike.toFixed(2)} | Delta: ${extra.target_put.delta.toFixed(3)})\n\n`;
    msg += `🔴 <b>VENDER CALL ATM (Delta ~0.50):</b>\n`;
    if (state.active_call_ticker) {
      msg += `   • Recomprar Call ativa: <code>${state.active_call_ticker}</code>\n`;
    }
    msg += `   • Vender Call Delta ~0.50: <code>${extra.target_call.ticker}</code> (Strike R$ ${extra.target_call.strike.toFixed(2)} | Delta: ${extra.target_call.delta.toFixed(3)})\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `⚠️ <i>Execute manualmente via Home Broker. Esta operação trava a carteira em Synthetic Cash (Delta Líquido ~0.00).</i>`;
  }
  
  return msg;
}

function calculateIVZScore(history: any[], currentIV: number): number {
  const windowSize = 20;
  const ivs = history.map(h => parseFloat(h.iv_puts)).filter(v => !isNaN(v));
  if (ivs.length === 0) return 0.0;
  
  ivs.push(currentIV);
  const slice = ivs.slice(-windowSize);
  if (slice.length < 5) return 0.0;
  
  const mean = slice.reduce((a, b) => a + b, 0) / slice.length;
  const variance = slice.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / slice.length;
  const stdDev = Math.sqrt(variance);
  
  if (stdDev === 0) return 0.0;
  return (currentIV - mean) / stdDev;
}

export async function GET(request: Request) {
  try {
    // 1. Verificação de Segurança (CRON_SECRET)
    const authHeader = request.headers.get("authorization");
    const urlObj = new URL(request.url);
    const bypassKey = urlObj.searchParams.get("key");
    const cronSecret = process.env.CRON_SECRET;

    if (cronSecret && authHeader !== `Bearer ${cronSecret}` && bypassKey !== cronSecret) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    // 2. Extrai Indicadores do Yahoo Finance
    const indicators = await getQuantIndicators();

    // 3. Carrega o Estado do Hedge e Histórico
    const state = await getHedgeState();
    const history = await getMetricsHistory();

    // 4. Extrai Grade de Opções e cotações ativas do opcoes.net.br
    const collar = await fetchSelectedCollarOptions();
    const activeQuotes = await fetchActiveOptionsQuotes(
      state.active_put_ticker,
      state.active_call_ticker
    );

    // 5. Parâmetros de Entrada da Árvore de Decisão
    const currentPrice = indicators.close_price;
    const volZScore = indicators.vol_zscore;
    const tsmom = indicators.tsmom_composite;
    const hv20d = indicators.hv_20;

    const ivP = collar.underlying_asset.iv_p;
    const ivpPercentile = collar.underlying_asset.ivp_p_12m;
    
    // VRP (Volatility Risk Premium) da Put Selecionada
    const putIV = collar.best_put ? collar.best_put.iv : ivP;
    const vrpPut = putIV - hv20d;

    // Gatilhos Lógicos de Entrada (Risk-Off)
    const riskOffVolBreakout = volZScore > 1.5;
    const riskOffCheapAsymmetry = tsmom < 0 && vrpPut < 0;

    const monetizeTimeDecay = collar.expiration_info.du <= 7;
    const monetizeMomentumReversal = tsmom > 0;

    let alertTriggered = false;
    const todayStr = new Date().toISOString().split("T")[0];

    // Z-Score da IV (20d)
    const currentPutIV = state.active_put_ticker && activeQuotes.put ? activeQuotes.put.iv : ivP;
    const ivZScore = calculateIVZScore(history, currentPutIV);

    // Delta Líquido
    const putDelta = state.active_put_ticker && activeQuotes.put ? activeQuotes.put.delta : 0.0;
    const callDelta = state.active_call_ticker && activeQuotes.call ? activeQuotes.call.delta : 0.0;
    const deltaNet = 1.0 + putDelta - callDelta;

    // Skew da Superfície (com fallback se nulo)
    const currentSkew = activeQuotes.skew || (collar.best_put && collar.best_call ? (collar.best_put.iv - collar.best_call.iv) * 100 : 3.40);

    // 6. Inicializa o Regime KAMA se não estiver definido
    if (!state.regime) {
      state.regime = currentPrice > indicators.kama ? "A" : "B";
      await saveHedgeState(state);
    }
    const currentRegime = state.regime;

    // 7. Lógica de Crossover KAMA e Transição de Regimes
    if (currentRegime === "B" && currentPrice > indicators.kama) {
      const reason = `Preço cruzou para CIMA da média KAMA (Preço: R$ ${currentPrice.toFixed(2)} > KAMA: R$ ${indicators.kama.toFixed(2)}).`;
      const targetCall = activeQuotes.call_06 || { ticker: "BBDCG200", strike: 20.00, price: 0.02, delta: 0.065 };
      const extraData = {
        price: currentPrice,
        kama: indicators.kama,
        target_call: targetCall
      };
      
      const alertText = formatTelegramAlert("KAMA_CROSS_ABOVE", reason, collar, state, extraData);
      const alertSuccess = await sendTelegramMessage(alertText);
      
      if (alertSuccess) {
        state.regime = "A";
        state.activation_date = todayStr;
        state.activation_price = currentPrice;
        
        // Desmonta Put
        state.active_put_ticker = null;
        state.active_put_strike = null;
        state.put_premium_paid = 0.0;
        
        // Rola Call para cima (OTM)
        state.active_call_ticker = targetCall.ticker;
        state.active_call_strike = targetCall.strike;
        state.call_premium_received = targetCall.price;
        
        state.net_premium_cost = -targetCall.price;
        state.hedge_active = true;
        
        await saveHedgeState(state);
        alertTriggered = true;
      }
    } else if (currentRegime === "A" && currentPrice < indicators.kama) {
      const reason = `Preço cruzou para BAIXO da média KAMA (Preço: R$ ${currentPrice.toFixed(2)} < KAMA: R$ ${indicators.kama.toFixed(2)}).`;
      const targetPut = activeQuotes.put_50 || { ticker: "BBDCS175", strike: 17.50, price: 0.45, delta: -0.50 };
      const targetCall = activeQuotes.call_50 || { ticker: "BBDCG175", strike: 17.50, price: 0.45, delta: 0.50 };
      const extraData = {
        price: currentPrice,
        kama: indicators.kama,
        target_put: targetPut,
        target_call: targetCall
      };
      
      const alertText = formatTelegramAlert("KAMA_CROSS_BELOW", reason, collar, state, extraData);
      const alertSuccess = await sendTelegramMessage(alertText);
      
      if (alertSuccess) {
        state.regime = "B";
        state.activation_date = todayStr;
        state.activation_price = currentPrice;
        
        // Monta pernas ATM
        state.active_put_ticker = targetPut.ticker;
        state.active_put_strike = targetPut.strike;
        state.put_premium_paid = targetPut.price;
        
        state.active_call_ticker = targetCall.ticker;
        state.active_call_strike = targetCall.strike;
        state.call_premium_received = targetCall.price;
        
        state.net_premium_cost = targetPut.price - targetCall.price;
        state.hedge_active = true;
        
        await saveHedgeState(state);
        alertTriggered = true;
      }
    }

    // 8. Envia Relatório Diário se nenhum Alerta Crítico foi acionado
    if (!alertTriggered) {
      const reportText = formatTelegramReport(indicators, collar, state);
      await sendTelegramMessage(reportText);
    }

    // 9. Atualiza Histórico de Métricas
    const newMetricRow: MetricRow = {
      data: todayStr,
      preco_fechamento: currentPrice.toFixed(2),
      hv_20d: hv20d.toFixed(4),
      zscore_vol: volZScore.toFixed(2),
      tsmom_1m: indicators.ret_1m.toFixed(4), 
      tsmom_3m: indicators.ret_3m.toFixed(4),
      tsmom_composite: tsmom.toFixed(4),
      iv_puts: currentPutIV.toFixed(4),
      vrp_puts: vrpPut.toFixed(4),
      hedge_ativo: state.hedge_active ? "1" : "0",
      kama: indicators.kama.toFixed(4),
      regime: state.regime
    };

    const cleanHistory = history.filter((row) => row.data !== todayStr);
    cleanHistory.push(newMetricRow);

    if (cleanHistory.length > 250) {
      cleanHistory.shift();
    }

    await saveMetricsHistory(cleanHistory);

    return NextResponse.json({
      success: true,
      message: alertTriggered ? "Alerta de cruzamento KAMA enviado ao Telegram" : "Relatório diário enviado ao Telegram",
      indicators: {
        price: currentPrice,
        tsmom: tsmom,
        vol_zscore: volZScore,
        hv_20d: hv20d,
        vrp_put: vrpPut,
        iv_zscore: ivZScore,
        delta_net: deltaNet,
        skew: currentSkew,
        kama: indicators.kama,
        regime: state.regime
      },
      hedge_active: state.hedge_active
    });

  } catch (e: any) {
    console.error("Erro no cron handler do hedge:", e);
    await sendTelegramMessage(`⚠️ <b>Hedge Monitor Error:</b> Falha crítica na execução serverless do cron job: <code>${e.message}</code>`);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
