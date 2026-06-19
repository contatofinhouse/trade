import { NextResponse } from "next/server";
import { getHedgeState, saveHedgeState } from "@/lib/db";
import { fetchActiveOptionsQuotes, getClearAccessToken, fetchClearQuote, getActiveWinTicker, fetchClearCustody } from "@/lib/options";

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
      if (state.activation_price !== 17.80) {
        state.activation_price = 17.80;
        stateChanged = true;
      }
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
        // Apenas a quantidade é sincronizada da custódia, o preço de entrada é fixo em R$ 17,80
      }

      const getOptionType = (ticker: string) => {
        if (!ticker.startsWith("BBDC") || ticker.length <= 4) return null;
        const letter = ticker[4].toUpperCase();
        if (["M", "N", "O", "P", "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z"].includes(letter)) return "PUT";
        if (["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"].includes(letter)) return "CALL";
        return null;
      };

      // 2. Put
      let custodyPut = clearCustody.find((item: any) => 
        getOptionType(item.ticker) === "PUT" &&
        (Math.abs(item.availableQuantity || 0) > 0 || Math.abs(item.collateralBlockedQuantity || 0) > 0)
      );
      if (!custodyPut) {
        custodyPut = clearCustody.find((item: any) => 
          getOptionType(item.ticker) === "PUT"
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
        getOptionType(item.ticker) === "CALL" &&
        (Math.abs(item.availableQuantity || 0) > 0 || Math.abs(item.collateralBlockedQuantity || 0) > 0)
      );
      if (!custodyCall) {
        custodyCall = clearCustody.find((item: any) => 
          getOptionType(item.ticker) === "CALL"
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
