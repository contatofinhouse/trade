import fs from "fs";
import path from "path";

export interface WinQuantIndicators {
  close_price: number;
  kama: number;
  atr: number;
  high: number;
  low: number;
  bollinger_upper: number;
  bollinger_lower: number;
  connors_rsi: number;
  kalman_price: number;
  kalman_trend: "UP" | "DOWN";
}

// Helper: calcula desvio padrão amostral (ddof=1)
function calculateStdDev(values: number[]): number {
  const n = values.length;
  if (n <= 1) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const variance = values.reduce((accum, val) => accum + Math.pow(val - mean, 2), 0) / (n - 1);
  return Math.sqrt(variance);
}

// Kaufman's Adaptive Moving Average (KAMA)
export function calculateKAMA(prices: number[], n: number = 10, fast: number = 2, slow: number = 30): number[] {
  const kamaSeries: number[] = new Array(prices.length).fill(0);
  if (prices.length < n) return kamaSeries;

  const fastSC = 2.0 / (fast + 1);
  const slowSC = 2.0 / (slow + 1);

  let sum = 0;
  for (let i = 0; i < n; i++) {
    sum += prices[i];
  }
  let prevKama = sum / n;
  kamaSeries[n - 1] = prevKama;

  for (let i = n; i < prices.length; i++) {
    const change = Math.abs(prices[i] - prices[i - n]);
    
    let volatility = 0;
    for (let j = 0; j < n; j++) {
      volatility += Math.abs(prices[i - j] - prices[i - j - 1]);
    }
    
    const er = volatility > 0 ? change / volatility : 0;
    const sc = Math.pow(er * (fastSC - slowSC) + slowSC, 2);
    const currentKama = prevKama + sc * (prices[i] - prevKama);
    
    kamaSeries[i] = currentKama;
    prevKama = currentKama;
  }

  return kamaSeries;
}

// Average True Range (ATR)
export function calculateATR(highs: number[], lows: number[], closes: number[], period: number = 14): number[] {
  const atrSeries: number[] = new Array(closes.length).fill(0);
  if (closes.length < period + 1) return atrSeries;

  const trs: number[] = [highs[0] - lows[0]];

  for (let i = 1; i < closes.length; i++) {
    const tr = Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - closes[i - 1]),
      Math.abs(lows[i] - closes[i - 1])
    );
    trs.push(tr);
  }

  let sumTR = 0;
  for (let i = 0; i < period; i++) {
    sumTR += trs[i];
  }
  let prevAtr = sumTR / period;
  atrSeries[period - 1] = prevAtr;

  for (let i = period; i < trs.length; i++) {
    const currentAtr = (prevAtr * (period - 1) + trs[i]) / period;
    atrSeries[i] = currentAtr;
    prevAtr = currentAtr;
  }

  return atrSeries;
}

// Standard Relative Strength Index (RSI)
export function calculateRSI(prices: number[], period: number = 3): number[] {
  const rsiSeries: number[] = new Array(prices.length).fill(50);
  if (prices.length < period + 1) return rsiSeries;

  let avgGain = 0;
  let avgLoss = 0;

  for (let i = 1; i <= period; i++) {
    const change = prices[i] - prices[i - 1];
    if (change > 0) avgGain += change;
    else avgLoss += Math.abs(change);
  }

  avgGain /= period;
  avgLoss /= period;
  rsiSeries[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);

  for (let i = period + 1; i < prices.length; i++) {
    const change = prices[i] - prices[i - 1];
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? Math.abs(change) : 0;

    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    rsiSeries[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }

  return rsiSeries;
}

// Connors RSI Implementation
export function calculateConnorsRSI(prices: number[]): number[] {
  const n = prices.length;
  const connorsSeries = new Array(n).fill(50);
  if (n < 100) return connorsSeries;

  // 1. RSI(3)
  const rsi3 = calculateRSI(prices, 3);

  // 2. Streak e Streak RSI(2)
  const streak = new Array(n).fill(0);
  for (let i = 1; i < n; i++) {
    if (prices[i] > prices[i - 1]) {
      streak[i] = streak[i - 1] >= 0 ? streak[i - 1] + 1 : 1;
    } else if (prices[i] < prices[i - 1]) {
      streak[i] = streak[i - 1] <= 0 ? streak[i - 1] - 1 : -1;
    } else {
      streak[i] = 0;
    }
  }
  const streakRsi2 = calculateRSI(streak, 2);

  // 3. PercentRank(ROC(1), 100)
  const roc1 = new Array(n).fill(0);
  for (let i = 1; i < n; i++) {
    roc1[i] = prices[i - 1] > 0 ? (prices[i] - prices[i - 1]) / prices[i - 1] : 0;
  }

  const percentRank = new Array(n).fill(50);
  for (let i = 99; i < n; i++) {
    const currentRoc = roc1[i];
    const window = roc1.slice(i - 99, i); // ROCs dos últimos 100 dias (excluindo hoje)
    let count = 0;
    for (const val of window) {
      if (val < currentRoc) {
        count++;
      }
    }
    percentRank[i] = (count / 100) * 100;
  }

  // 4. Média dos 3 componentes
  for (let i = 99; i < n; i++) {
    connorsSeries[i] = (rsi3[i] + streakRsi2[i] + percentRank[i]) / 3;
  }

  return connorsSeries;
}

// 1D Kalman Filter
export function calculateKalmanFilter(prices: number[], Q: number = 0.05, R: number = 1.0): number[] {
  const kalmanSeries = new Array(prices.length).fill(0);
  if (prices.length === 0) return kalmanSeries;

  let x = prices[0];
  let P = 1.0;

  kalmanSeries[0] = x;

  for (let i = 1; i < prices.length; i++) {
    const P_prior = P + Q;
    const K = P_prior / (P_prior + R);
    x = x + K * (prices[i] - x);
    P = (1 - K) * P_prior;
    kalmanSeries[i] = x;
  }

  return kalmanSeries;
}

// Bollinger Bands centradas na KAMA
export function calculateBollingerBandsKAMA(
  prices: number[], 
  kama: number[], 
  period: number = 20, 
  multiplier: number = 2.0
): { upper: number[]; lower: number[] } {
  const upper = new Array(prices.length).fill(0);
  const lower = new Array(prices.length).fill(0);
  if (prices.length < period) return { upper, lower };

  for (let i = period - 1; i < prices.length; i++) {
    const window = prices.slice(i - period + 1, i + 1);
    const std = calculateStdDev(window);
    upper[i] = kama[i] + multiplier * std;
    lower[i] = kama[i] - multiplier * std;
  }

  return { upper, lower };
}

export async function fetchWinHistoryPrices(): Promise<{
  closes: number[];
  highs: number[];
  lows: number[];
}> {
  const url = "https://query1.finance.yahoo.com/v8/finance/chart/%5EBVSP?interval=1d&range=1y";
  const headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
  };

  const response = await fetch(url, { headers, next: { revalidate: 3600 } });
  if (!response.ok) {
    throw new Error(`Yahoo Finance API returned status ${response.status} for ^BVSP`);
  }

  const data = await response.json();
  const result = data?.chart?.result?.[0];
  const quote = result?.indicators?.quote?.[0];
  
  const closes = quote?.close as (number | null)[];
  const highs = quote?.high as (number | null)[];
  const lows = quote?.low as (number | null)[];

  if (!closes || closes.length === 0) {
    throw new Error("No prices found in Yahoo Finance response for ^BVSP");
  }

  const cleanCloses: number[] = [];
  const cleanHighs: number[] = [];
  const cleanLows: number[] = [];

  for (let i = 0; i < closes.length; i++) {
    const c = closes[i];
    let h = highs[i];
    let l = lows[i];

    if (c !== null && c > 0) {
      // Se high ou low forem nulos ou menores/iguais a zero (ex: falhas pontuais no Yahoo), usamos o close como fallback
      if (h === null || h <= 0) h = c;
      if (l === null || l <= 0) l = c;

      cleanCloses.push(c);
      cleanHighs.push(h);
      cleanLows.push(l);
    }
  }

  return {
    closes: cleanCloses,
    highs: cleanHighs,
    lows: cleanLows
  };
}

export async function getWinQuantIndicators(): Promise<WinQuantIndicators> {
  const { closes, highs, lows } = await fetchWinHistoryPrices();
  const n = closes.length;

  if (n < 100) {
    throw new Error("Dados históricos insuficientes para WIN (^BVSP)");
  }

  const kamaSeries = calculateKAMA(closes, 10);
  const atrSeries = calculateATR(highs, lows, closes, 14);
  const { upper, lower } = calculateBollingerBandsKAMA(closes, kamaSeries, 20, 2.0);
  const connorsSeries = calculateConnorsRSI(closes);
  const kalmanSeries = calculateKalmanFilter(closes, 0.05, 1.0);

  const kalmanTrend = kalmanSeries[n - 1] > kalmanSeries[n - 2] ? "UP" as const : "DOWN" as const;

  return {
    close_price: closes[n - 1],
    kama: kamaSeries[n - 1],
    atr: atrSeries[n - 1],
    high: highs[n - 1],
    low: lows[n - 1],
    bollinger_upper: upper[n - 1],
    bollinger_lower: lower[n - 1],
    connors_rsi: connorsSeries[n - 1],
    kalman_price: kalmanSeries[n - 1],
    kalman_trend: kalmanTrend
  };
}

export interface WinIntradayState {
  symbol: string;
  last_price: number;
  last_time: string;
  vwap: number;
  kalman: number;
  rsi2: number;
  zscore: number;
  signal_state: string;
  active_position: {
    entry_price: number;
    stop_loss: number;
    tp1: number;
    tp2: number;
    entry_idx: number;
    has_taken_partial: boolean;
    contracts: number;
  } | null;
  recent_peaks: {
    idx: number;
    time: string;
    price: number;
    volume: number;
    rsi: number;
  }[];
  projection?: {
    expected_direction: string;
    projected_target: number;
    projected_ceiling: number;
    projected_floor: number;
    probability: string;
    description: string;
  } | null;
  chart_data: {
    time: string;
    open: number;
    high: number;
    low: number;
    close: number;
    vwap: number;
    upper_1: number;
    upper_2: number;
    lower_2: number;
    kalman: number;
    zscore: number;
  }[];
}

export function getWinIntradayState(): WinIntradayState | null {
  const filePath = path.join(process.cwd(), "win_intraday_state.json");
  if (!fs.existsSync(filePath)) {
    return null;
  }
  try {
    const stats = fs.statSync(filePath);
    const mtime = stats.mtimeMs;
    const now = Date.now();
    // Se o arquivo foi modificado há menos de 15 minutos, usamos ele (MT5 ativo localmente)
    if (now - mtime < 15 * 60 * 1000) {
      const raw = fs.readFileSync(filePath, "utf-8");
      return JSON.parse(raw) as WinIntradayState;
    }
    console.warn("win_intraday_state.json está obsoleto (>15m). Usando fallback yfinance.");
  } catch (e) {
    console.error("Error reading win_intraday_state.json:", e);
  }
  return null;
}

function calculateRSI_2(prices: number[]): number[] {
  const rsi: number[] = new Array(prices.length).fill(50);
  if (prices.length < 3) return rsi;
  
  let avgGain = 0;
  let avgLoss = 0;
  
  for (let i = 1; i <= 2; i++) {
    const change = prices[i] - prices[i - 1];
    if (change > 0) avgGain += change;
    else avgLoss += Math.abs(change);
  }
  
  avgGain /= 2;
  avgLoss /= 2;
  rsi[2] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  
  for (let i = 3; i < prices.length; i++) {
    const change = prices[i] - prices[i - 1];
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? Math.abs(change) : 0;
    
    avgGain = (avgGain * 1 + gain) / 2;
    avgLoss = (avgLoss * 1 + loss) / 2;
    rsi[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return rsi;
}

export async function getWinIntradayFallback(winLivePrice: number | null): Promise<WinIntradayState | null> {
  try {
    const url = "https://query1.finance.yahoo.com/v8/finance/chart/%5EBVSP?interval=5m&range=5d";
    const response = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" }, next: { revalidate: 30 } });
    if (!response.ok) return null;

    const data = await response.json();
    const result = data?.chart?.result?.[0];
    const timestamp = result?.timestamp as number[];
    const quote = result?.indicators?.quote?.[0];
    const closes = quote?.close as (number | null)[];
    const highs = quote?.high as (number | null)[];
    const lows = quote?.low as (number | null)[];
    const opens = quote?.open as (number | null)[];
    const volumes = quote?.volume as (number | null)[];

    if (!closes || closes.length === 0) return null;

    // Filtra e limpa dados
    const cleanTimes: Date[] = [];
    const cleanCloses: number[] = [];
    const cleanHighs: number[] = [];
    const cleanLows: number[] = [];
    const cleanOpens: number[] = [];
    const cleanVolumes: number[] = [];

    for (let i = 0; i < closes.length; i++) {
      const c = closes[i];
      if (c !== null && c > 0) {
        cleanTimes.push(new Date(timestamp[i] * 1000));
        cleanCloses.push(c);
        cleanHighs.push(highs[i] ?? c);
        cleanLows.push(lows[i] ?? c);
        cleanOpens.push(opens[i] ?? c);
        cleanVolumes.push(volumes[i] ?? 0);
      }
    }

    // Filtra apenas o dia de hoje (ou a última sessão ativa)
    const lastDate = cleanTimes[cleanTimes.length - 1].toDateString();
    const todayTimes: Date[] = [];
    const todayCloses: number[] = [];
    const todayHighs: number[] = [];
    const todayLows: number[] = [];
    const todayOpens: number[] = [];
    const todayVolumes: number[] = [];

    for (let i = 0; i < cleanTimes.length; i++) {
      if (cleanTimes[i].toDateString() === lastDate) {
        todayTimes.push(cleanTimes[i]);
        todayCloses.push(cleanCloses[i]);
        todayHighs.push(cleanHighs[i]);
        todayLows.push(cleanLows[i]);
        todayOpens.push(cleanOpens[i]);
        todayVolumes.push(cleanVolumes[i]);
      }
    }

    const nToday = todayCloses.length;
    if (nToday === 0) return null;

    // Calcular spread
    const lastSpotClose = todayCloses[nToday - 1];
    const spread = winLivePrice ? (winLivePrice - lastSpotClose) : 3060;

    // Aplicar spread para simular WINQ26
    const adjCloses = todayCloses.map(v => v + spread);
    const adjHighs = todayHighs.map(v => v + spread);
    const adjLows = todayLows.map(v => v + spread);
    const adjOpens = todayOpens.map(v => v + spread);

    // Indicadores
    // 1. VWAP (Média Móvel Simples Acumulada no index cash se volume for nulo)
    const vwap: number[] = [];
    let cumPV = 0;
    let cumV = 0;
    const hasVolume = todayVolumes.reduce((a, b) => a + b, 0) > 0;

    for (let i = 0; i < nToday; i++) {
      if (hasVolume) {
        cumPV += adjCloses[i] * todayVolumes[i];
        cumV += todayVolumes[i];
        vwap.push(cumPV / (cumV > 0 ? cumV : 1));
      } else {
        cumPV += adjCloses[i];
        vwap.push(cumPV / (i + 1));
      }
    }

    // 2. Desvio padrão móvel (20 períodos) para bandas de VWAP
    const sd20: number[] = [];
    for (let i = 0; i < nToday; i++) {
      const start = Math.max(0, i - 19);
      const slice = adjCloses.slice(start, i + 1);
      sd20.push(calculateStdDev(slice));
    }

    const upper1 = vwap.map((v, i) => v + sd20[i]);
    const upper2 = vwap.map((v, i) => v + 2.0 * sd20[i]);
    const lower2 = vwap.map((v, i) => v - 2.0 * sd20[i]);
    const zscores = adjCloses.map((v, i) => sd20[i] > 0 ? (v - vwap[i]) / sd20[i] : 0);

    // 3. RSI(2)
    const rsi2 = calculateRSI_2(adjCloses);

    // 4. Kalman Filter
    const kalman = calculateKalmanFilter(adjCloses, 0.05, 1.0);

    // 5. Picos locais (3 maiores do dia)
    const peaks: any[] = [];
    for (let i = 3; i < nToday - 3; i++) {
      const currentHigh = adjHighs[i];
      let isPeak = true;
      for (const offset of [-3, -2, -1, 1, 2, 3]) {
        if (adjHighs[i + offset] > currentHigh) {
          isPeak = false;
          break;
        }
      }
      if (isPeak && currentHigh >= upper2[i] * 0.995) {
        const timeStr = todayTimes[i].toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", hour12: false });
        peaks.push({
          idx: i,
          time: timeStr,
          price: currentHigh,
          volume: todayVolumes[i],
          rsi: rsi2[i]
        });
      }
    }
    const sortedPeaks = [...peaks].sort((a, b) => b.price - a.price).slice(0, 3);

    // 6. Projeção
    const lastZ = zscores[nToday - 1];
    let expectedDir = "CONSOLIDAÇÃO NEUTRA";
    let targetP = vwap[nToday - 1];
    let desc = "Preço travado na média (VWAP). Sem tendência direcional clara no intraday.";
    let prob = "Indefinida";

    if (lastZ >= 1.5) {
      expectedDir = "RETORNO À MÉDIA (QUEDA)";
      desc = "Preço esticado para cima (+1.5+ SD da VWAP). Expectativa estatística de correção de queda até a VWAP.";
      prob = "Alta Reversão (~90%)";
    } else if (lastZ <= -1.5) {
      expectedDir = "RETORNO À MÉDIA (ALTA)";
      desc = "Preço esticado para baixo (-1.5- SD da VWAP). Expectativa estatística de recuperação de alta até a VWAP.";
      prob = "Alta Reversão (~90%)";
    } else {
      const kalmanDiff = adjCloses[nToday - 1] - kalman[nToday - 1];
      if (kalmanDiff > 10) {
        expectedDir = "TENDÊNCIA COMPRADORA (M5)";
        targetP = upper2[nToday - 1];
        desc = "Preço equilibrado em relação à VWAP. Seguindo momentum de alta do Filtro de Kalman rumo à banda superior.";
        prob = "Moderada (~60%)";
      } else if (kalmanDiff < -10) {
        expectedDir = "TENDÊNCIA VENDEDORA (M5)";
        targetP = lower2[nToday - 1];
        desc = "Preço equilibrado em relação à VWAP. Seguindo momentum de queda do Filtro de Kalman rumo à banda inferior.";
        prob = "Moderada (~60%)";
      }
    }

    const chartBars: any[] = [];
    const startIdx = Math.max(0, nToday - 60);
    for (let i = startIdx; i < nToday; i++) {
      const timeStr = todayTimes[i].toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", hour12: false });
      chartBars.push({
        time: timeStr,
        open: adjOpens[i],
        high: adjHighs[i],
        low: adjLows[i],
        close: adjCloses[i],
        vwap: vwap[i],
        upper_1: upper1[i],
        upper_2: upper2[i],
        lower_2: lower2[i],
        kalman: kalman[i],
        zscore: zscores[i]
      });
    }

    const lastTimeStr = todayTimes[nToday - 1].toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", hour12: false });

    return {
      symbol: "WINQ26 (Fallback yfinance)",
      last_price: adjCloses[nToday - 1],
      last_time: lastTimeStr,
      vwap: vwap[nToday - 1],
      kalman: kalman[nToday - 1],
      rsi2: rsi2[nToday - 1],
      zscore: lastZ,
      signal_state: "NEUTRO (YF)",
      active_position: null,
      recent_peaks: sortedPeaks,
      projection: {
        expected_direction: expectedDir,
        projected_target: targetP,
        projected_ceiling: upper2[nToday - 1],
        projected_floor: lower2[nToday - 1],
        probability: prob,
        description: desc
      },
      chart_data: chartBars
    };

  } catch (e) {
    console.error("Error generating yfinance fallback:", e);
    return null;
  }
}

