import { getHedgeState, getMetricsHistory } from "@/lib/db";
import { fetchActiveOptionsQuotes, getClearAccessToken, fetchClearQuote, getActiveWinTicker, fetchClearCustody } from "@/lib/options";
import { getWinQuantIndicators } from "@/lib/quant_win";
import Dashboard from "../components/Dashboard";

// Forçar dynamic rendering no Next.js para carregar dados atualizados do banco no Vercel
export const dynamic = "force-dynamic";

export default async function Home() {
  // Cada chamada isolada — se uma falhar, o dashboard carrega com fallback
  let state: any = null;
  let history: any[] = [];
  let activeQuotes: any = null;
  let winIndicators: any = null;
  let winLivePrice: number | null = null;

  try {
    state = await getHedgeState();
  } catch (e) {
    console.error("[page] Falha ao carregar hedge state:", e);
  }

  try {
    history = await getMetricsHistory();
  } catch (e) {
    console.error("[page] Falha ao carregar metrics history:", e);
  }

  try {
    activeQuotes = await fetchActiveOptionsQuotes(
      state?.active_put_ticker ?? null,
      state?.active_call_ticker ?? "BBDCG194"
    );
  } catch (e) {
    console.error("[page] Falha ao buscar cotações de opções (opcoes.net.br):", e);
    activeQuotes = null; // Dashboard usa fallback interno
  }

  try {
    winIndicators = await getWinQuantIndicators();
  } catch (e) {
    console.error("[page] Falha ao buscar indicadores quantitativos do WIN:", e);
    // Fallback básico para o WIN
    winIndicators = {
      close_price: 120000,
      kama: 119500,
      atr: 1500,
      high: 120500,
      low: 119000
    };
  }

  let initialCustody: any[] | null = null;
  const winTicker = getActiveWinTicker();

  // Busca preço real do WIN e custódia via Clear API
  if (process.env.CLEAR_API_KEY && process.env.CLEAR_CLIENT_SECRET) {
    try {
      const clearToken = await getClearAccessToken(process.env.CLEAR_API_KEY, process.env.CLEAR_CLIENT_SECRET);
      if (clearToken) {
        winLivePrice = await fetchClearQuote(winTicker, clearToken);
        initialCustody = await fetchClearCustody(clearToken);
      }
    } catch (e) {
      console.error("[page] Falha ao carregar cotações/custódia via Clear API:", e);
    }
  }

  // Fallback de estado caso o Supabase também falhe
  const safeState = state ?? {
    hedge_active: true,
    activation_date: "2026-06-18",
    activation_price: 17.80,
    active_put_ticker: "BBDCS2",
    active_put_strike: 17.39,
    active_call_ticker: "BBDCG194",
    active_call_strike: 19.14,
    quantity: 1000,
    put_premium_paid: 0.28,
    call_premium_received: 0.09,
    net_premium_cost: 0.19,
    regime: "B" as const,
  };

  return (
    <Dashboard
      initialState={safeState}
      initialHistory={history}
      activeQuotes={activeQuotes}
      winIndicators={winIndicators}
      winLivePrice={winLivePrice}
      initialCustody={initialCustody}
      initialWinTicker={winTicker}
    />
  );
}

