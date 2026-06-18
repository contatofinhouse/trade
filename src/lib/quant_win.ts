export interface WinQuantIndicators {
  close_price: number;
  kama: number;
  atr: number;
  high: number;
  low: number;
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

// Average True Range (ATR) calculation
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

  // First ATR is the SMA of the first TRs
  let sumTR = 0;
  for (let i = 0; i < period; i++) {
    sumTR += trs[i];
  }
  let prevAtr = sumTR / period;
  atrSeries[period - 1] = prevAtr;

  // Wilders smoothing for subsequent ATRs
  for (let i = period; i < trs.length; i++) {
    const currentAtr = (prevAtr * (period - 1) + trs[i]) / period;
    atrSeries[i] = currentAtr;
    prevAtr = currentAtr;
  }

  return atrSeries;
}

export async function fetchWinHistoryPrices(): Promise<{
  closes: number[];
  highs: number[];
  lows: number[];
}> {
  // Usando ^BVSP (Ibovespa) como proxy perfeito de pontos para o WIN
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

  // Filtra dias com valores nulos
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

  if (n < 50) {
    throw new Error("Dados históricos insuficientes para WIN (^BVSP)");
  }

  const kamaSeries = calculateKAMA(closes, 10);
  const atrSeries = calculateATR(highs, lows, closes, 14);

  return {
    close_price: closes[n - 1],
    kama: kamaSeries[n - 1],
    atr: atrSeries[n - 1],
    high: highs[n - 1],
    low: lows[n - 1]
  };
}
