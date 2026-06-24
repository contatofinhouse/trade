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

// Helper: executa requisição HTTP REST para o Supabase (PostgREST API)
async function supabaseRequest(method: string, path: string, body?: any, preferHeader?: string): Promise<any> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_KEY || process.env.SUPABASE_ANON_KEY;

  if (!url || !key) return null;

  const baseUrl = url.endsWith("/") ? url.slice(0, -1) : url;
  const requestUrl = `${baseUrl}/rest/v1/${path}`;

  const headers: any = {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json"
  };

  if (preferHeader) {
    headers["Prefer"] = preferHeader;
  }

  const options: any = {
    method: method,
    headers: headers,
    cache: "no-store"
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(requestUrl, options);
  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Supabase REST request failed: ${response.status} ${response.statusText} - ${errText}`);
  }

  if (response.status === 204) {
    return null;
  }

  return await response.json();
}

export async function getHedgeState(): Promise<any> {
  // 1. Tentar Supabase se configurado
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_KEY || process.env.SUPABASE_ANON_KEY;

  if (supabaseUrl && supabaseKey) {
    try {
      const data = await supabaseRequest("GET", "hedge_state?id=eq.1");
      if (data && data.length > 0) {
        return data[0].state;
      }
    } catch (e) {
      console.error("Erro ao ler hedge_state do Supabase:", e);
    }
  }

  // 2. Fallback para Vercel KV
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

  // 3. Fallback para arquivo local
  try {
    if (fs.existsSync(stateFilePath)) {
      return JSON.parse(fs.readFileSync(stateFilePath, "utf-8"));
    }
  } catch (e) {
    console.error("Erro ao ler arquivo local hedge_state.json:", e);
  }

  // 4. Fallback padrão estrutural de emergência
  return {
    hedge_active: true,
    activation_date: "2026-06-18",
    activation_price: 17.80,
    active_put_ticker: "BBDCS164",
    active_put_strike: 16.39,
    active_call_ticker: null,
    active_call_strike: null,
    quantity: 2000,
    put_premium_paid: 0.06,
    call_premium_received: 0.0,
    net_premium_cost: 0.06,
    transactions: []
  };
}

export async function saveHedgeState(state: any): Promise<void> {
  // 1. Tentar Supabase se configurado
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_KEY || process.env.SUPABASE_ANON_KEY;

  if (supabaseUrl && supabaseKey) {
    try {
      await supabaseRequest("POST", "hedge_state", { id: 1, state }, "resolution=merge-duplicates");
      return;
    } catch (e) {
      console.error("Erro ao salvar hedge_state no Supabase:", e);
    }
  }

  // 2. Fallback para Vercel KV
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

  // 3. Gravação local
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
  // 1. Tentar Supabase se configurado
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_KEY || process.env.SUPABASE_ANON_KEY;

  if (supabaseUrl && supabaseKey) {
    try {
      const data = await supabaseRequest("GET", "metrics_history?order=data.asc");
      if (data) {
        return data.map((row: any) => ({
          data: row.data,
          preco_fechamento: String(row.preco_fechamento),
          hv_20d: String(row.hv_20d),
          zscore_vol: String(row.zscore_vol),
          tsmom_1m: String(row.tsmom_1m),
          tsmom_3m: String(row.tsmom_3m),
          tsmom_composite: String(row.tsmom_composite),
          iv_puts: String(row.iv_puts),
          vrp_puts: String(row.vrp_puts),
          hedge_ativo: String(row.hedge_ativo),
          kama: row.kama ? String(row.kama) : undefined,
          regime: row.regime ? String(row.regime) : undefined
        }));
      }
    } catch (e) {
      console.error("Erro ao ler metrics_history do Supabase:", e);
    }
  }

  // 2. Fallback para Vercel KV
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

  // 3. Fallback para arquivo local CSV
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
  // 1. Tentar Supabase se configurado
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_KEY || process.env.SUPABASE_ANON_KEY;

  if (supabaseUrl && supabaseKey) {
    try {
      const payload = history.map((row) => ({
        data: row.data,
        preco_fechamento: parseFloat(row.preco_fechamento) || 0,
        hv_20d: parseFloat(row.hv_20d) || 0,
        zscore_vol: parseFloat(row.zscore_vol) || 0,
        tsmom_1m: parseFloat(row.tsmom_1m) || 0,
        tsmom_3m: parseFloat(row.tsmom_3m) || 0,
        tsmom_composite: parseFloat(row.tsmom_composite) || 0,
        iv_puts: parseFloat(row.iv_puts) || 0,
        vrp_puts: parseFloat(row.vrp_puts) || 0,
        hedge_ativo: parseInt(row.hedge_ativo) || 0,
        kama: parseFloat(row.kama || "0") || 0,
        regime: row.regime || ""
      }));
      await supabaseRequest("POST", "metrics_history", payload, "resolution=merge-duplicates");
      return;
    } catch (e) {
      console.error("Erro ao salvar metrics_history no Supabase:", e);
    }
  }

  // 2. Fallback para Vercel KV
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

  // 3. Gravação local no formato CSV
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
