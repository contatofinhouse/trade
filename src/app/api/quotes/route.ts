import { NextResponse } from "next/server";
import { getHedgeState, saveHedgeState } from "@/lib/db";
import { fetchActiveOptionsQuotes, getClearAccessToken, fetchClearQuote, getActiveWinTicker, fetchClearCustody } from "@/lib/options";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const state = await getHedgeState();
    
    // Busca cotações ativas
    const activeQuotes = await fetchActiveOptionsQuotes(
      state?.active_put_ticker ?? null,
      state?.active_call_ticker ?? "BBDCG194"
    );

    // Busca preço real do WIN via Clear API usando a série ativa do futuro (ex: WINQ26)
    let winLivePrice: number | null = null;
    const winTicker = getActiveWinTicker();
    let clearCustody: any[] | null = null;

    if (process.env.CLEAR_API_KEY && process.env.CLEAR_CLIENT_SECRET) {
      try {
        const clearToken = await getClearAccessToken(process.env.CLEAR_API_KEY, process.env.CLEAR_CLIENT_SECRET);
        if (clearToken) {
          winLivePrice = await fetchClearQuote(winTicker, clearToken);
          clearCustody = await fetchClearCustody(clearToken);
        }
      } catch (e) {
        console.error(`Falha ao carregar cotações/custódia via Clear API na rota /api/quotes:`, e);
      }
    }

    // Sincroniza o estado do banco com a custódia da Clear
    let stateChanged = false;
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

      // 2. Put
      let custodyPut = clearCustody.find((item: any) => 
        item.ticker.startsWith("BBDC") && 
        (item.ticker.includes("S") || item.ticker.includes("T") || item.ticker.includes("U") || item.ticker.includes("V") || item.ticker.includes("W") || item.ticker.includes("X") || item.ticker.includes("Y")) &&
        (Math.abs(item.availableQuantity || 0) > 0 || Math.abs(item.collateralBlockedQuantity || 0) > 0)
      );
      if (!custodyPut) {
        custodyPut = clearCustody.find((item: any) => 
          item.ticker.startsWith("BBDC") && 
          (item.ticker.includes("S") || item.ticker.includes("T") || item.ticker.includes("U") || item.ticker.includes("V") || item.ticker.includes("W") || item.ticker.includes("X") || item.ticker.includes("Y"))
        );
      }

      if (custodyPut) {
        const qtyPut = (custodyPut.availableQuantity || 0) + (custodyPut.collateralBlockedQuantity || 0);
        if (state.active_put_ticker !== custodyPut.ticker) {
          state.active_put_ticker = custodyPut.ticker;
          state.active_put_strike = activeQuotes?.put?.strike || state.active_put_strike || 17.39;
          if (qtyPut > 0 && custodyPut.averageCost) {
            state.put_premium_paid = custodyPut.averageCost;
          }
          state.hedge_active = qtyPut > 0;
          stateChanged = true;
        } else {
          const shouldBeActive = qtyPut > 0;
          if (state.hedge_active !== shouldBeActive) {
            state.hedge_active = shouldBeActive;
            stateChanged = true;
          }
        }
      } else {
        if (state.active_put_ticker !== null) {
          state.active_put_ticker = null;
          state.active_put_strike = null;
          state.put_premium_paid = 0.0;
          state.hedge_active = false;
          stateChanged = true;
        }
      }

      // 3. Call
      let custodyCall = clearCustody.find((item: any) => 
        item.ticker.startsWith("BBDC") && 
        (item.ticker.includes("G") || item.ticker.includes("H") || item.ticker.includes("I") || item.ticker.includes("J") || item.ticker.includes("K") || item.ticker.includes("L") || item.ticker.includes("A") || item.ticker.includes("B") || item.ticker.includes("C") || item.ticker.includes("D") || item.ticker.includes("E") || item.ticker.includes("F")) &&
        (Math.abs(item.availableQuantity || 0) > 0 || Math.abs(item.collateralBlockedQuantity || 0) > 0)
      );
      if (!custodyCall) {
        custodyCall = clearCustody.find((item: any) => 
          item.ticker.startsWith("BBDC") && 
          (item.ticker.includes("G") || item.ticker.includes("H") || item.ticker.includes("I") || item.ticker.includes("J") || item.ticker.includes("K") || item.ticker.includes("L") || item.ticker.includes("A") || item.ticker.includes("B") || item.ticker.includes("C") || item.ticker.includes("D") || item.ticker.includes("E") || item.ticker.includes("F"))
        );
      }

      if (custodyCall) {
        const qtyCall = (custodyCall.availableQuantity || 0) + (custodyCall.collateralBlockedQuantity || 0);
        if (state.active_call_ticker !== custodyCall.ticker) {
          state.active_call_ticker = custodyCall.ticker;
          state.active_call_strike = activeQuotes?.call?.strike || state.active_call_strike || 19.14;
          if (qtyCall > 0 && custodyCall.averageCost) {
            state.call_premium_received = custodyCall.averageCost;
          }
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

    return NextResponse.json({
      activeQuotes,
      winLivePrice,
      winTicker,
      clearCustody,
      state
    });
  } catch (error: any) {
    console.error("Erro na API /api/quotes:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
