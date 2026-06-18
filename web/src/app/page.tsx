import { getHedgeState, getMetricsHistory } from "@/lib/db";
import { fetchActiveOptionsQuotes } from "@/lib/options";
import Dashboard from "@/components/Dashboard";

// Forçar dynamic rendering no Next.js para carregar dados atualizados do banco no Vercel
export const dynamic = "force-dynamic";

export default async function Home() {
  const state = await getHedgeState();
  const history = await getMetricsHistory();
  const activeQuotes = await fetchActiveOptionsQuotes(
    state.active_put_ticker,
    state.active_call_ticker
  );

  return (
    <Dashboard 
      initialState={state} 
      initialHistory={history} 
      activeQuotes={activeQuotes} 
    />
  );
}
