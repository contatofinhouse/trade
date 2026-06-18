import fs from "fs";
import path from "path";

// Chaves utilizadas no Redis / Vercel KV
const STATE_KEY = "bbdc4_hedge_state";
const HISTORY_KEY = "bbdc4_metrics_history";

// Caminho dos arquivos locais no computador
const stateFilePath = path.join(process.cwd(), "..", "hedge_state.json");
const historyFilePath = path.join(process.cwd(), "..", "metrics_history.csv");

// Helper: executa comando via Upstash REST protocol (Vercel KV) usando fetch
async function kvRequest(command: string[]): Promise<any> {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;

  if (!url || !token) return null;

  const baseUrl = url.startsWith("http") ? url : `https://${url}`;

  const response = await fetch(baseUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(command),
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`KV REST request failed: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  return data.result;
}

export async function getHedgeState(): Promise<any> {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;

  if (url && token) {
    try {
      const result = await kvRequest(["GET", STATE_KEY]);
      if (result) {
        return JSON.parse(result);
      }
    } catch (e) {
      console.error("Erro ao ler hedge_state do Vercel KV:", e);
    }
  }

  // Fallback para arquivo local
  try {
    if (fs.existsSync(stateFilePath)) {
      return JSON.parse(fs.readFileSync(stateFilePath, "utf-8"));
    }
  } catch (e) {
    console.error("Erro ao ler arquivo local hedge_state.json:", e);
  }

  // Fallback padrão estrutural de emergência
  return {
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
    net_premium_cost: 0.19
  };
}

export async function saveHedgeState(state: any): Promise<void> {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;

  if (url && token) {
    try {
      await kvRequest(["SET", STATE_KEY, JSON.stringify(state)]);
      return;
    } catch (e) {
      console.error("Erro ao salvar hedge_state no Vercel KV:", e);
    }
  }

  // Gravação local
  try {
    fs.writeFileSync(stateFilePath, JSON.stringify(state, null, 4), "utf-8");
  } catch (e) {
    console.error("Erro ao gravar arquivo local hedge_state.json:", e);
  }
}

export interface MetricRow {
  data: string;
  preco_fechamento: string;
  hv_20d: string;
  zscore_vol: string;
  tsmom_1m: string;
  tsmom_3m: string;
  tsmom_composite: string;
  iv_puts: string;
  vrp_puts: string;
  hedge_ativo: string;
  kama?: string;
  regime?: string;
}

export async function getMetricsHistory(): Promise<MetricRow[]> {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;

  if (url && token) {
    try {
      const result = await kvRequest(["GET", HISTORY_KEY]);
      if (result) {
        return JSON.parse(result);
      }
    } catch (e) {
      console.error("Erro ao ler metrics_history do Vercel KV:", e);
    }
  }

  // Fallback para arquivo local CSV
  const fallbackHistory: MetricRow[] = [
    {
      data: "2026-06-18",
      preco_fechamento: "17.66",
      hv_20d: "0.2125",
      zscore_vol: "-0.71",
      tsmom_1m: "0.0731",
      tsmom_3m: "-0.2971",
      tsmom_composite: "-0.1120",
      iv_puts: "0.2490",
      vrp_puts: "0.0341",
      hedge_ativo: "1",
      kama: "17.60",
      regime: "B"
    }
  ];

  try {
    if (fs.existsSync(historyFilePath)) {
      const rawCsv = fs.readFileSync(historyFilePath, "utf-8");
      const lines = rawCsv.split("\n").filter(Boolean);
      if (lines.length > 1) {
        const headers = lines[0].split(",");
        return lines.slice(1).map((line) => {
          const values = line.split(",");
          const obj: any = {};
          headers.forEach((header, index) => {
            obj[header.trim()] = values[index] ? values[index].trim() : "";
          });
          return obj as MetricRow;
        });
      }
    }
  } catch (e) {
    console.error("Erro ao ler arquivo local metrics_history.csv:", e);
  }

  return fallbackHistory;
}

export async function saveMetricsHistory(history: MetricRow[]): Promise<void> {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;

  if (url && token) {
    try {
      await kvRequest(["SET", HISTORY_KEY, JSON.stringify(history)]);
      return;
    } catch (e) {
      console.error("Erro ao salvar metrics_history no Vercel KV:", e);
    }
  }

  // Gravação local no formato CSV
  try {
    const headers = [
      "data", "preco_fechamento", "hv_20d", "zscore_vol", 
      "tsmom_1m", "tsmom_3m", "tsmom_composite", 
      "iv_puts", "vrp_puts", "hedge_ativo", "kama", "regime"
    ];
    let csvContent = headers.join(",") + "\n";
    history.forEach((row) => {
      csvContent += [
        row.data,
        row.preco_fechamento,
        row.hv_20d,
        row.zscore_vol,
        row.tsmom_1m,
        row.tsmom_3m,
        row.tsmom_composite,
        row.iv_puts,
        row.vrp_puts,
        row.hedge_ativo,
        row.kama || "",
        row.regime || ""
      ].join(",") + "\n";
    });
    fs.writeFileSync(historyFilePath, csvContent, "utf-8");
  } catch (e) {
    console.error("Erro ao gravar arquivo local metrics_history.csv:", e);
  }
}
