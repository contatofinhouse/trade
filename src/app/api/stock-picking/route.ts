import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const TICKERS = [
  "ALOS3.SA", "ABEV3.SA", "ANIM3.SA", "ASAI3.SA", "AURE3.SA", "AXIA3.SA", "AZZA3.SA", "B3SA3.SA",
  "BBSE3.SA", "BBDC3.SA", "BBDC4.SA", "BRAP4.SA", "SAUD3.SA", "BBAS3.SA", "BRKM5.SA", "BRAV3.SA",
  "BPAC11.SA", "CXSE3.SA", "CBAV3.SA", "CEAB3.SA", "CMIG4.SA", "COGN3.SA", "CSMG3.SA", "CPLE3.SA",
  "CSAN3.SA", "CPFE3.SA", "CMIN3.SA", "CURY3.SA", "CVCB3.SA", "CYRE3.SA", "DIRR3.SA", "ECOR3.SA",
  "EMBJ3.SA", "ENGI11.SA", "ENEV3.SA", "EGIE3.SA", "EQTL3.SA", "EZTC3.SA", "FLRY3.SA", "GGBR4.SA",
  "GOAU4.SA", "GGPS3.SA", "GMAT3.SA", "HAPV3.SA", "HYPE3.SA", "IGTI11.SA", "INTB3.SA", "IRBR3.SA",
  "ISAE4.SA", "ITSA4.SA", "ITUB3.SA", "ITUB4.SA", "JHSF3.SA", "KLBN11.SA", "RENT3.SA", "LREN3.SA",
  "MGLU3.SA", "POMO4.SA", "MBRF3.SA", "BEEF3.SA", "MOTV3.SA", "MDNE3.SA", "MOVI3.SA", "MRVE3.SA",
  "MULT3.SA", "NATU3.SA", "ORVR3.SA", "PETR3.SA", "PETR4.SA", "RECV3.SA", "AUAU3.SA", "PSSA3.SA",
  "PRIO3.SA", "RADL3.SA", "RAPT4.SA", "RDOR3.SA", "RAIL3.SA", "SBSP3.SA", "SAPR11.SA", "SANB11.SA",
  "SMTO3.SA", "CSNA3.SA", "SIMH3.SA", "SLCE3.SA", "SMFT3.SA", "SUZB3.SA", "TAEE11.SA", "VIVT3.SA",
  "TEND3.SA", "TIMS3.SA", "TOTS3.SA", "UGPA3.SA", "USIM5.SA", "VALE3.SA", "VAMO3.SA", "VBBR3.SA",
  "VIVA3.SA", "WEGE3.SA", "YDUQ3.SA"
];

interface ScanResult {
  ticker: string;
  preco_atual: number;
  preco_sinal: number;
  z_price: number;
  vol_ratio: number;
  z_volume: number;
  vol_60d: number;
  momentum_3m: number;
  score_quant: number;
  alocacao_sugerida: number;
  data_sinal: string;
  days_ago: number;
  cond_price: boolean;
  cond_vol: boolean;
  cond_vol_z: boolean;
  decisao: "COMPRA" | "HOLD";
  error?: string | null;
}

function getFallbackRecord(ticker: string, errorMsg = "Erro"): ScanResult {
  const cleanTicker = ticker.replace(".SA", "");
  const todayStr = new Date().toISOString().split("T")[0];
  return {
    ticker: cleanTicker,
    preco_atual: 0.0,
    preco_sinal: 0.0,
    z_price: 0.0,
    vol_ratio: 0.0,
    z_volume: 0.0,
    vol_60d: 0.001,
    momentum_3m: 0.0,
    score_quant: -9999.0,
    data_sinal: todayStr,
    days_ago: 0,
    cond_price: false,
    cond_vol: false,
    cond_vol_z: false,
    decisao: "HOLD",
    alocacao_sugerida: 0.0,
    error: errorMsg
  };
}

async function analyzeTicker(ticker: string, lookback: number): Promise<ScanResult> {
  const cleanTicker = ticker.replace(".SA", "");
  try {
    const res = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?range=1y&interval=1d`, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
      },
      next: { revalidate: 60 }
    });
    if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
    const json = await res.json();
    const result = json.chart?.result?.[0];
    if (!result) throw new Error("Invalid response structure from Yahoo Finance");

    const timestamps = result.timestamp || [];
    const quotes = result.indicators?.quote?.[0];
    const closes = quotes?.close || [];
    const volumes = quotes?.volume || [];

    const validData: { dateStr: string; close: number; volume: number }[] = [];
    for (let i = 0; i < timestamps.length; i++) {
      if (closes[i] !== null && closes[i] !== undefined && closes[i] > 0 &&
          volumes[i] !== null && volumes[i] !== undefined && volumes[i] > 0) {
        const d = new Date(timestamps[i] * 1000);
        validData.push({
          dateStr: d.toISOString().split("T")[0],
          close: closes[i],
          volume: volumes[i]
        });
      }
    }

    if (validData.length < 65) throw new Error(`Insufficient data points: ${validData.length}`);

    const N = validData.length;
    const zPrices = new Array(N).fill(0);
    const vol5ds = new Array(N).fill(0);
    const vol20ds = new Array(N).fill(0);
    const vol60ds = new Array(N).fill(0);
    const volRatios = new Array(N).fill(0);
    const zVolumes = new Array(N).fill(0);

    const mean = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;
    const std = (arr: number[], m: number) => {
      const v = arr.reduce((a, b) => a + Math.pow(b - m, 2), 0) / arr.length;
      return Math.sqrt(v);
    };
    const sampleStd = (arr: number[], m: number) => {
      if (arr.length <= 1) return 0;
      const v = arr.reduce((a, b) => a + Math.pow(b - m, 2), 0) / (arr.length - 1);
      return Math.sqrt(v);
    };

    const logReturns = new Array(N).fill(0);
    for (let i = 1; i < N; i++) {
      logReturns[i] = Math.log(validData[i].close / validData[i-1].close);
    }

    for (let i = 19; i < N; i++) {
      const closeSlice = validData.slice(i - 19, i + 1).map(d => d.close);
      const m20 = mean(closeSlice);
      const s20 = std(closeSlice, m20);
      zPrices[i] = s20 > 0 ? (validData[i].close - m20) / s20 : 0;

      if (i >= 5) {
        const logSlice5 = logReturns.slice(i - 4, i + 1);
        const mLog5 = mean(logSlice5);
        const sLog5 = sampleStd(logSlice5, mLog5);
        vol5ds[i] = sLog5 * Math.sqrt(252);
      }
      if (i >= 20) {
        const logSlice20 = logReturns.slice(i - 19, i + 1);
        const mLog20 = mean(logSlice20);
        const sLog20 = sampleStd(logSlice20, mLog20);
        vol20ds[i] = sLog20 * Math.sqrt(252);
        volRatios[i] = vol20ds[i] > 0 ? vol5ds[i] / vol20ds[i] : 0;
      }
      if (i >= 60) {
        const logSlice60 = logReturns.slice(i - 59, i + 1);
        const mLog60 = mean(logSlice60);
        const sLog60 = sampleStd(logSlice60, mLog60);
        vol60ds[i] = sLog60 * Math.sqrt(252);
      } else {
        vol60ds[i] = vol20ds[i];
      }

      const volSlice = validData.slice(i - 19, i + 1).map(d => d.volume);
      const mVol20 = mean(volSlice);
      const sVol20 = std(volSlice, mVol20);
      zVolumes[i] = sVol20 > 0 ? (validData[i].volume - mVol20) / sVol20 : 0;
    }

    const closeD0 = validData[N-1].close;
    const zPriceCurrent = zPrices[N-1];

    const startIdx = Math.max(50, N - lookback);
    let triggerFound = false;
    let triggerIdx = -1;

    for (let i = N - 1; i >= startIdx; i--) {
      const zPriceT0 = zPrices[i];
      const zPriceT1 = zPrices[i-1];
      const volRatio = volRatios[i];
      const zVol = zVolumes[i];

      const cPrice = zPriceT0 > 1.0 || zPriceT1 > 1.0;
      const cVol = volRatio > 1.05;
      const cVolume = zVol > 0.8;

      if (cPrice && cVol && cVolume) {
        triggerFound = true;
        triggerIdx = i;
        break;
      }
    }

    if (triggerFound) {
      const idx = triggerIdx;
      const closeSignal = validData[idx].close;
      const vol60dSignal = vol60ds[idx];

      const volDiaria = vol60dSignal / 15.87;
      const riskPercent = Math.max(0.025, Math.min(0.075, 2.0 * volDiaria));
      const stopLoss = closeSignal * (1.0 - riskPercent);

      let hasStoppedOut = false;
      for (let j = idx; j < N; j++) {
        if (validData[j].close < stopLoss) {
          hasStoppedOut = true;
          break;
        }
      }

      if (hasStoppedOut || zPriceCurrent < 0.0 || closeD0 < stopLoss) {
        triggerFound = false;
      }
    }

    if (triggerFound) {
      const idx = triggerIdx;
      const closeSignal = validData[idx].close;
      const vol60dSignal = vol60ds[idx];
      const price3mAgo = idx - 63 >= 0 ? validData[idx-63].close : validData[0].close;
      const momentum3M = ((closeSignal - price3mAgo) / price3mAgo) * 100;
      const scoreQuant = vol60dSignal > 0 ? momentum3M / vol60dSignal : 0;

      return {
        ticker: cleanTicker,
        preco_atual: closeD0,
        preco_sinal: closeSignal,
        z_price: zPrices[idx],
        vol_ratio: volRatios[idx],
        z_volume: zVolumes[idx],
        vol_60d: vol60dSignal,
        momentum_3m: momentum3M,
        score_quant: scoreQuant,
        data_sinal: validData[idx].dateStr,
        days_ago: N - 1 - idx,
        cond_price: true,
        cond_vol: true,
        cond_vol_z: true,
        decisao: "COMPRA",
        alocacao_sugerida: 0.0,
        error: null
      };
    } else {
      const idx = N - 1;
      const vol60dD0 = vol60ds[idx];
      const price3mAgo = idx - 63 >= 0 ? validData[idx-63].close : validData[0].close;
      const momentum3M = ((closeD0 - price3mAgo) / price3mAgo) * 100;
      const scoreQuant = vol60dD0 > 0 ? momentum3M / vol60dD0 : 0;

      const zPriceD0 = zPrices[idx];
      const zPriceD1 = zPrices[idx-1] || 0;
      const volRatioD0 = volRatios[idx];
      const zVolumeD0 = zVolumes[idx];

      const condPrice = zPriceD0 > 1.0 || zPriceD1 > 1.0;
      const condVol = volRatioD0 > 1.05;
      const condVolZ = zVolumeD0 > 0.8;

      return {
        ticker: cleanTicker,
        preco_atual: closeD0,
        preco_sinal: 0.0,
        z_price: zPriceD0,
        vol_ratio: volRatioD0,
        z_volume: zVolumeD0,
        vol_60d: vol60dD0,
        momentum_3m: momentum3M,
        score_quant: scoreQuant,
        data_sinal: validData[idx].dateStr,
        days_ago: 0,
        cond_price: condPrice,
        cond_vol: condVol,
        cond_vol_z: condVolZ,
        decisao: "HOLD",
        alocacao_sugerida: 0.0,
        error: null
      };
    }
  } catch (err: any) {
    return getFallbackRecord(ticker, err.message || "Unknown error");
  }
}

async function limitConcurrency<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
  limit: number
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let index = 0;
  const execute = async () => {
    while (index < items.length) {
      const currentIdx = index++;
      results[currentIdx] = await fn(items[currentIdx]);
    }
  };
  const workers = Array.from({ length: Math.min(limit, items.length) }, execute);
  await Promise.all(workers);
  return results;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const lookback = searchParams.get("lookback") || "5";
    const lookbackVal = parseInt(lookback, 10);

    if (isNaN(lookbackVal) || lookbackVal <= 0 || lookbackVal > 250) {
      return NextResponse.json(
        { error: "Parâmetro lookback inválido. Deve ser um número entre 1 e 250." },
        { status: 400 }
      );
    }

    const results = await limitConcurrency(TICKERS, (t) => analyzeTicker(t, lookbackVal), 15);

    const compraSignals = results.filter(r => r.decisao === "COMPRA" && r.preco_atual > 0);
    if (compraSignals.length > 0) {
      const invVols = compraSignals.map(r => {
        const vol = r.vol_60d;
        return vol > 0 ? 1.0 / vol : 0.0001;
      });
      const sumInvVol = invVols.reduce((a, b) => a + b, 0);
      
      for (const r of results) {
        if (r.decisao === "COMPRA" && r.preco_atual > 0) {
          const vol = r.vol_60d;
          const invVol = vol > 0 ? 1.0 / vol : 0.0001;
          r.alocacao_sugerida = sumInvVol > 0 ? (invVol / sumInvVol) * 100 : 0.0;
        } else {
          r.alocacao_sugerida = 0.0;
        }
      }
    }

    results.sort((a, b) => b.score_quant - a.score_quant);

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      lookback: lookbackVal,
      count: results.length,
      data: results
    });
  } catch (error: any) {
    console.error("Erro interno na rota /api/stock-picking:", error);
    return NextResponse.json(
      { error: "Erro interno no servidor.", details: error.message },
      { status: 500 }
    );
  }
}
