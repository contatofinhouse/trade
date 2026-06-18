export interface QuantIndicators {
  close_price: number;
  hv_20: number;
  vol_zscore: number;
  ret_1m: number;
  ret_3m: number;
  tsmom_1m: number;
  tsmom_3m: number;
  tsmom_composite: number;
  kama: number;
}

// Helper: calcula desvio padrão amostral (ddof=1, dividindo por n-1)
function calculateStdDev(values: number[]): number {
  const n = values.length;
  if (n <= 1) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const variance = values.reduce((accum, val) => accum + Math.pow(val - mean, 2), 0) / (n - 1);
  return Math.sqrt(variance);
}

// Helper: calcula média simples
function calculateMean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

// Kaufman's Adaptive Moving Average (KAMA) implementation
export function calculateKAMA(prices: number[], n: number = 10, fast: number = 2, slow: number = 30): number[] {
  const kamaSeries: number[] = new Array(prices.length).fill(0);
  if (prices.length < n) return kamaSeries;

  const fastSC = 2.0 / (fast + 1);
  const slowSC = 2.0 / (slow + 1);

  // Initialize first KAMA as SMA of the first n days
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

export async function fetchBBDC4Prices(): Promise<number[]> {
  const url = "https://query1.finance.yahoo.com/v8/finance/chart/BBDC4.SA?interval=1d&range=2y";
  const headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
  };

  const response = await fetch(url, { headers, next: { revalidate: 3600 } });
  if (!response.ok) {
    throw new Error(`Yahoo Finance API returned status ${response.status}`);
  }

  const data = await response.json();
  const result = data?.chart?.result?.[0];
  const closePrices = result?.indicators?.quote?.[0]?.close as (number | null)[];

  if (!closePrices || closePrices.length === 0) {
    throw new Error("No closing prices found in Yahoo Finance response");
  }

  // Filtra valores nulos (dias sem negociação, feriados, etc.)
  return closePrices.filter((price): price is number => price !== null && price !== undefined);
}

export function computeQuantIndicators(closePrices: number[]): QuantIndicators {
  const n = closePrices.length;
  
  // Precisamos de dados suficientes para calcular rolling Z-Score de 252 dias e HV de 20 dias
  // Janela total mínima = 252 (zscore) + 20 (hv) + 1 (log returns) = ~273 dias
  if (n < 280) {
    throw new Error(`Dados históricos insuficientes. São necessários pelo menos 280 dias de preços (recebidos ${n}).`);
  }

  // 1. Calcula retornos logarítmicos diários
  const logReturns: number[] = [];
  for (let i = 1; i < n; i++) {
    logReturns.push(Math.log(closePrices[i] / closePrices[i - 1]));
  }

  // 2. Calcula volatilidade realizada anualizada (HV 20 dias) para cada janela disponível
  // Como logReturns tem tamanho n-1, a primeira volatilidade de 20 dias será calculada no índice 19 de logReturns (dia 20 do preço)
  const hvSeries: number[] = [];
  for (let i = 19; i < logReturns.length; i++) {
    const window = logReturns.slice(i - 19, i + 1); // 20 dias
    const dailyStd = calculateStdDev(window);
    const annualizedVol = dailyStd * Math.sqrt(252);
    hvSeries.push(annualizedVol);
  }

  // O tamanho de hvSeries será (n - 1) - 19 = n - 20
  const totalHVCount = hvSeries.length;
  if (totalHVCount < 252) {
    throw new Error(`Série de Volatilidade Histórica insuficiente para Z-Score. Requer 252 dias (calculado ${totalHVCount}).`);
  }

  // 3. Calcula Z-Score da volatilidade do último dia usando janela de 252 dias móveis
  const lastHVIdx = totalHVCount - 1;
  const hvWindow252 = hvSeries.slice(lastHVIdx - 251, lastHVIdx + 1); // Últimos 252 dias de HV
  const hvMean252 = calculateMean(hvWindow252);
  const hvStd252 = calculateStdDev(hvWindow252);
  
  const currentHV = hvSeries[lastHVIdx];
  const volZScore = hvStd252 > 0 ? (currentHV - hvMean252) / hvStd252 : 0;

  // 4. Calcula TSMOM
  // ret_1m: comparado com 21 dias úteis atrás (index -22 em relação ao último)
  // ret_3m: comparado com 63 dias úteis atrás (index -64 em relação ao último)
  const currentPrice = closePrices[n - 1];
  const price21DaysAgo = closePrices[n - 22];
  const price63DaysAgo = closePrices[n - 64];

  if (!price21DaysAgo || !price63DaysAgo) {
    throw new Error("Não foi possível obter preços históricos para o cálculo do TSMOM");
  }

  const ret1m = (currentPrice - price21DaysAgo) / price21DaysAgo;
  const ret3m = (currentPrice - price63DaysAgo) / price63DaysAgo;

  const tsmom1m = currentHV > 0 ? ret1m / currentHV : 0;
  const tsmom3m = currentHV > 0 ? ret3m / currentHV : 0;
  
  const tsmomComposite = (0.5 * tsmom1m) + (0.5 * tsmom3m);

  // Calcula KAMA
  const kamaSeries = calculateKAMA(closePrices);
  const currentKama = kamaSeries[kamaSeries.length - 1];

  return {
    close_price: currentPrice,
    hv_20: currentHV,
    vol_zscore: volZScore,
    ret_1m: ret1m,
    ret_3m: ret3m,
    tsmom_1m: tsmom1m,
    tsmom_3m: tsmom3m,
    tsmom_composite: tsmomComposite,
    kama: currentKama
  };
}

export async function getQuantIndicators(): Promise<QuantIndicators> {
  const prices = await fetchBBDC4Prices();
  return computeQuantIndicators(prices);
}
