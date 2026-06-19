import { NextResponse } from "next/server";
import { getHedgeState } from "@/lib/db";
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
