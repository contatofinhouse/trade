import { NextResponse } from "next/server";
import { getHedgeState, saveHedgeState } from "@/lib/db";
import { fetchActiveOptionsQuotes, getClearAccessToken, fetchClearQuote, getActiveWinTicker, fetchClearCustody, fetchClearOrders } from "@/lib/options";
import { getWinIntradayState, getWinIntradayFallback } from "@/lib/quant_win";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const state = await getHedgeState();
    
    // Sanitização de dados corrompidos de execuções anteriores com bug de matching
    if (state) {
      let stateChanged = false;
      if (state.active_call_ticker === "BBDCG194" && (state.call_premium_received > 2.0 || state.call_premium_received === 0)) {
        state.call_premium_received = 0.09;
        stateChanged = true;
      }
      if (state.active_put_ticker === "BBDCS2" && (state.put_premium_paid > 2.0 || state.put_premium_paid === 0)) {
        state.put_premium_paid = 0.28;
        stateChanged = true;
      }
      // Apenas sanitiza premiums das opções

      if (stateChanged) {
        state.net_premium_cost = (state.put_premium_paid || 0) - (state.call_premium_received || 0);
        await saveHedgeState(state);
      }
    }

    // Busca cotações ativas
    const activeQuotes = await fetchActiveOptionsQuotes(
      state?.active_put_ticker ?? null,
      state?.active_call_ticker ?? "BBDCG194"
    );

    let winLivePrice: number | null = null;
    const winTicker = getActiveWinTicker();
    let clearCustody: any[] | null = null;
    let clearOrders: any[] | null = null;

    if (process.env.CLEAR_API_KEY && process.env.CLEAR_CLIENT_SECRET) {
      try {
        const clearToken = await getClearAccessToken(process.env.CLEAR_API_KEY, process.env.CLEAR_CLIENT_SECRET);
        if (clearToken) {
          winLivePrice = await fetchClearQuote(winTicker, clearToken);
          clearCustody = await fetchClearCustody(clearToken);
          clearOrders = await fetchClearOrders(clearToken);
        }
      } catch (e) {
        console.error(`Falha ao carregar cotações/custódia/ordens via Clear API na rota /api/quotes:`, e);
      }
    }

    // Sincroniza o estado do banco com a custódia da Clear
    let stateChanged = false;
    const todayStr = new Date().toISOString().split("T")[0];

    if (state) {
      const initialLength = state.transactions?.length || 0;
      // Garante que só existam transações com status 'open' e limpa legado
      state.transactions = (state.transactions || []).filter((t: any) => t.status === "open");
      if (state.transactions.length !== initialLength) {
        stateChanged = true;
      }
    }

    const getOptionType = (ticker: string) => {
      if (!ticker.startsWith("BBDC") || ticker.length <= 4) return null;
      const letter = ticker[4].toUpperCase();
      if (["M", "N", "O", "P", "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z"].includes(letter)) return "PUT";
      if (["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"].includes(letter)) return "CALL";
      return null;
    };

    if (clearCustody && clearCustody.length > 0 && state) {
      // 1. Ações BBDC4
      const custodyBbdc4 = clearCustody.find((item: any) => item.ticker === "BBDC4");
      if (custodyBbdc4 && custodyBbdc4.availableQuantity > 0) {
        if (state.quantity !== custodyBbdc4.availableQuantity) {
          state.quantity = custodyBbdc4.availableQuantity;
          stateChanged = true;
        }
        if (custodyBbdc4.averageCost && state.activation_price !== custodyBbdc4.averageCost) {
          state.activation_price = custodyBbdc4.averageCost;
          stateChanged = true;
        }
      }

      // 2. Opções da Custódia
      const optionCustodyItems = clearCustody.filter(item => {
        const type = getOptionType(item.ticker);
        return type !== null && (Math.abs(item.availableQuantity || 0) > 0 || Math.abs(item.collateralBlockedQuantity || 0) > 0);
      });

      // Atualiza ou insere transações em aberto vindas da Clear
      for (const item of optionCustodyItems) {
        const type = getOptionType(item.ticker)!;
        const qtyOption = Math.abs((item.availableQuantity || 0) + (item.collateralBlockedQuantity || 0));
        const avgCost = item.averageCost || 0.0;

        let tx = state.transactions.find((t: any) => t.ticker === item.ticker && t.status === "open");
        if (!tx) {
          tx = {
            ticker: item.ticker,
            type: type,
            action: type === "PUT" ? "COMPRA" : "VENDA",
            qty: qtyOption,
            entryPrice: avgCost,
            closePrice: null,
            status: "open",
            entryDate: todayStr,
            closeDate: null
          };
          state.transactions.push(tx);
          stateChanged = true;
        } else {
          if (tx.qty !== qtyOption || tx.entryPrice !== avgCost) {
            tx.qty = qtyOption;
            tx.entryPrice = avgCost;
            stateChanged = true;
          }
        }
      }

      // Remove posições encerradas (que estavam no state mas não vieram na Clear)
      const openTickersInCustody = optionCustodyItems.map(item => item.ticker);
      const preFilterLength = state.transactions.length;
      state.transactions = state.transactions.filter((tx: any) => {
        return openTickersInCustody.includes(tx.ticker);
      });
      if (state.transactions.length !== preFilterLength) {
        stateChanged = true;
      }

      // 3. Atualiza campos legados ativos para compatibilidade com outras partes do sistema
      const openPuts = state.transactions.filter((t: any) => t.type === "PUT" && t.status === "open");
      const openCalls = state.transactions.filter((t: any) => t.type === "CALL" && t.status === "open");

      if (openPuts.length > 0) {
        const firstPut = openPuts[0];
        const putStrikeVal = activeQuotes?.optionsLookup?.[firstPut.ticker]?.strike || state.active_put_strike || 17.39;
        if (state.active_put_ticker !== firstPut.ticker || state.active_put_strike !== putStrikeVal || state.put_premium_paid !== firstPut.entryPrice || !state.hedge_active) {
          state.active_put_ticker = firstPut.ticker;
          state.active_put_strike = putStrikeVal;
          state.put_premium_paid = firstPut.entryPrice;
          state.hedge_active = true;
          stateChanged = true;
        }
      } else {
        if (state.active_put_ticker !== null || state.hedge_active !== false) {
          state.active_put_ticker = null;
          state.active_put_strike = null;
          state.put_premium_paid = 0.0;
          state.hedge_active = false;
          stateChanged = true;
        }
      }

      if (openCalls.length > 0) {
        const firstCall = openCalls[0];
        const callStrikeVal = activeQuotes?.optionsLookup?.[firstCall.ticker]?.strike || state.active_call_strike || 19.14;
        if (state.active_call_ticker !== firstCall.ticker || state.active_call_strike !== callStrikeVal || state.call_premium_received !== firstCall.entryPrice) {
          state.active_call_ticker = firstCall.ticker;
          state.active_call_strike = callStrikeVal;
          state.call_premium_received = firstCall.entryPrice;
          stateChanged = true;
        }
      } else {
        if (state.active_call_ticker !== null) {
          state.active_call_ticker = null;
          state.active_call_strike = null;
          state.call_premium_received = 0.0;
          stateChanged = true;
        }
      }

      if (stateChanged) {
        state.net_premium_cost = (state.put_premium_paid || 0) - (state.call_premium_received || 0);
        await saveHedgeState(state);
      }
    }

    let winIntradayState = getWinIntradayState();
    if (!winIntradayState) {
      try {
        winIntradayState = await getWinIntradayFallback(winLivePrice);
      } catch (fallbackError) {
        console.error("Erro ao obter fallback do yfinance:", fallbackError);
      }
    }

    return NextResponse.json({
      activeQuotes,
      winLivePrice,
      winTicker,
      clearCustody,
      state,
      winIntradayState
    });
  } catch (error: any) {
    console.error("Erro na API /api/quotes:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
