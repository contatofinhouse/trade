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
    if (closes[i] !== null && highs[i] !== null && lows[i] !== null) {
      cleanCloses.push(closes[i]!);
      cleanHighs.push(highs[i]!);
      cleanLows.push(lows[i]!);
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
