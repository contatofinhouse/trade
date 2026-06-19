"use client";

import React, { useState, useEffect } from "react";
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ReferenceLine, 
  ResponsiveContainer
} from "recharts";
import { 
  TrendingUp, 
  TrendingDown, 
  ShieldAlert, 
  DollarSign, 
  Layers, 
  RefreshCw,
  Cpu,
  Activity,
  ArrowRightLeft,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Zap,
  Sliders,
  Scale
} from "lucide-react";

interface LongShortWinProps {
  initialState: {
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
  };
  livePriceFromClear?: number | null;
}

export default function LongShortWin({ initialState, livePriceFromClear }: LongShortWinProps) {
  const [isMounted, setIsMounted] = useState(false);
  
  // Parâmetros Fixo de Risco de Hedge Fund
  const [capitalBase, setCapitalBase] = useState(100000); // Capital padrão de R$ 100.000
  const [maxRiskCash, setMaxRiskCash] = useState(1000); // Risco máximo de R$ 1.000 por trade
  const [atrMultiplier, setAtrMultiplier] = useState(1.0); // Multiplicador padrão de 1.0x ATR para stops mais justos
  
  // Preço do WIN atual
  const basePrice = livePriceFromClear || initialState.close_price || 120000;
  const [simulatedPrice, setSimulatedPrice] = useState(basePrice);

  useEffect(() => {
    setIsMounted(true);
    if (livePriceFromClear) {
      setSimulatedPrice(livePriceFromClear);
    }
  }, [livePriceFromClear]);

  // Arredonda preço para ticks de 5 pontos do WIN
  const roundToWIN = (val: number) => Math.round(val / 5) * 5;

  const currentPrice = roundToWIN(simulatedPrice);
  const kama = roundToWIN(initialState.kama || basePrice);
  const atr = roundToWIN(initialState.atr || 1500);
  
  // Bandas Bollinger-KAMA e Filtros
  const bollingerUpper = roundToWIN(initialState.bollinger_upper || kama + 3000);
  const bollingerLower = roundToWIN(initialState.bollinger_lower || kama - 3000);
  const connorsRsi = Math.round(initialState.connors_rsi || 50);
  const kalmanPrice = roundToWIN(initialState.kalman_price || basePrice);
  const kalmanTrend = initialState.kalman_trend || "UP";

  // ----------------------------------------------------
  // Algoritmo de Scoring Quantitativo (Hedge Fund Style)
  // ----------------------------------------------------
  
  // 1. Sinal KAMA
  const isBuy = currentPrice > kama;
  const scoreKama = isBuy ? 1 : -1;
  // 2. Filtro RSI
  const scoreRsi = connorsRsi > 50 ? 1 : -1;
  // 3. Filtro Kalman
  const scoreKalman = kalmanTrend === "UP" ? 1 : -1;

  // Pontuação Total (Scoring de -3 a +3)
  const totalScore = scoreKama + scoreRsi + scoreKalman;

  // Filtros de Exaustão (Bollinger-KAMA)
  const isOverbought = currentPrice >= bollingerUpper; // Esticado na alta
  const isOversold = currentPrice <= bollingerLower; // Esticado na baixa

  // Tomada de Decisão Final baseada em Scoring + Exaustão
  let decision: "COMPRA" | "VENDA" | "CAIXA" = "CAIXA";
  let blockReason = "";

  if (totalScore >= 2) {
    if (isOverbought) {
      decision = "CAIXA";
      blockReason = "Compra bloqueada: Preço acima da Banda Superior (Exaustão/Sobrecomprado).";
    } else {
      decision = "COMPRA";
    }
  } else if (totalScore <= -2) {
    if (isOversold) {
      decision = "CAIXA";
      blockReason = "Venda bloqueada: Preço abaixo da Banda Inferior (Exaustão/Sobrevendido).";
    } else {
      decision = "VENDA";
    }
  } else {
    blockReason = `Filtro de Scoring: Pontuação insuficiente (${totalScore > 0 ? "+" : ""}${totalScore}). Aguardando alinhamento de fatores.`;
  }

  // Alvo e Stop baseados no ATR (2.0x ATR para Stop, 3.0x ATR para Alvo)
  const stopDistance = roundToWIN(atr * atrMultiplier);
  const targetDistance = roundToWIN(atr * atrMultiplier * 1.5); // Relação Risco/Retorno 1:1.5

  const stopLoss = decision === "COMPRA" ? roundToWIN(currentPrice - stopDistance) : roundToWIN(currentPrice + stopDistance);
  const targetProfit = decision === "COMPRA" ? roundToWIN(currentPrice + targetDistance) : roundToWIN(currentPrice - targetDistance);

  // Dimensionamento Dinâmico de Lote (Contratos)
  // Risco por contrato do WIN = Distância do Stop em pontos * R$ 0.20
  const riskPerContract = stopDistance * 0.20;
  // Contratos = Risco Máximo Financeiro / Risco por contrato
  const contractsSize = Math.max(1, Math.floor(maxRiskCash / riskPerContract));

  // Simulação de Retorno PnL
  const winPointValue = 0.20;
  const simulatedChange = decision === "COMPRA" ? (currentPrice - basePrice) : (basePrice - currentPrice);
  const simulatedPL = decision !== "CAIXA" ? simulatedChange * winPointValue * contractsSize : 0.0;
  const simulatedPercent = (simulatedPL / capitalBase) * 100;

  // Geração de dados do gráfico adaptativo
  const chartData = [];
  const startPrice = roundToWIN(kama - 4000);
  const endPrice = roundToWIN(kama + 4000);
  for (let p = startPrice; p <= endPrice; p += 150) {
    const formattedPrice = roundToWIN(p);
    const profit = decision === "COMPRA" 
      ? (formattedPrice - currentPrice) * winPointValue * contractsSize 
      : (decision === "VENDA" 
        ? (currentPrice - formattedPrice) * winPointValue * contractsSize 
        : 0.0);
    chartData.push({
      price: formattedPrice,
      "PnL Estimado (R$)": Math.round(profit),
    });
  }

  if (!isMounted) return null;

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      
      {/* Cards Principais */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* Recomendação Operacional */}
        <div className="bg-white border border-zinc-200 rounded-lg p-6 shadow-xs relative overflow-hidden flex flex-col justify-between">
          <div>
            <span className="text-[10px] uppercase font-bold text-zinc-400 tracking-wider flex items-center gap-1.5 font-mono">
              <Layers className="h-4 w-4 text-zinc-500" /> RECOMENDAÇÃO OPERACIONAL
            </span>
            
            <div className="mt-4 flex items-center justify-between">
              <div>
                <span className="text-xs text-zinc-400">Decisão do Modelo</span>
                <div className={`text-3xl font-extrabold tracking-tight mt-0.5 font-mono ${
                  decision === "COMPRA" ? "text-emerald-600" : decision === "VENDA" ? "text-rose-600" : "text-zinc-500"
                }`}>
                  {decision === "COMPRA" ? "COMPRA" : decision === "VENDA" ? "VENDA" : "AGUARDAR (CAIXA)"}
                </div>
              </div>
              <span className={`px-2.5 py-0.5 rounded text-xs font-bold font-mono ${
                decision === "COMPRA" ? "bg-emerald-50 text-emerald-800 border border-emerald-100" : decision === "VENDA" ? "bg-rose-50 text-rose-800 border border-rose-100" : "bg-zinc-50 text-zinc-600 border border-zinc-200"
              }`}>
                Score: {totalScore > 0 ? "+" : ""}{totalScore}
              </span>
            </div>

            {decision !== "CAIXA" ? (
              <div className="space-y-3 mt-6">
                <div className="flex justify-between items-center py-2 border-b border-zinc-100 font-mono text-sm">
                  <span className="text-zinc-500">Contratos Recomendados</span>
                  <span className="font-bold text-zinc-900">{contractsSize} contratos</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-zinc-100 font-mono text-sm">
                  <span className="text-zinc-500">Preço de Entrada</span>
                  <span className="font-semibold text-zinc-800">{currentPrice.toLocaleString("pt-BR")} pts</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-zinc-100 font-mono text-sm">
                  <span className="text-rose-600 font-semibold">Stop Loss</span>
                  <span className="font-bold text-rose-600">{stopLoss.toLocaleString("pt-BR")} pts ({stopDistance} pts)</span>
                </div>
                <div className="flex justify-between items-center py-2 font-mono text-sm">
                  <span className="text-emerald-600 font-semibold">Alvo (Take Profit)</span>
                  <span className="font-bold text-emerald-600">{targetProfit.toLocaleString("pt-BR")} pts ({targetDistance} pts)</span>
                </div>
              </div>
            ) : (
              <div className="mt-8 p-4 rounded-lg bg-zinc-50 border border-zinc-200 text-zinc-650 text-xs flex items-start gap-2 leading-relaxed font-mono">
                <ShieldAlert className="h-4 w-4 text-zinc-500 flex-shrink-0 mt-0.5" />
                <span>{blockReason}</span>
              </div>
            )}
          </div>
          
          <div className="mt-4 pt-4 border-t border-zinc-100 text-[10px] text-zinc-400 leading-relaxed font-mono">
            <b>Regra Operacional</b>: Entrada liberada se Score ≥ +2 (Compras) ou ≤ -2 (Vendas), filtrado pelas Bandas de exaustão.
          </div>
        </div>

        {/* Monitor Analítico Avançado */}
        <div className="bg-white border border-zinc-200 rounded-lg p-6 shadow-xs relative overflow-hidden flex flex-col justify-between">
          <div>
            <span className="text-[10px] uppercase font-bold text-zinc-400 tracking-wider flex items-center gap-1.5 font-mono">
              <Cpu className="h-4 w-4 text-zinc-500" /> MONITOR DE SINAIS E FILTROS
            </span>
            
            <div className="space-y-3.5 mt-5">
              <div className="flex justify-between items-center py-1.5 border-b border-zinc-100 font-mono">
                <span className="text-xs text-zinc-500 font-medium font-sans">Média KAMA</span>
                <span className="text-xs font-bold text-zinc-800">{kama.toLocaleString("pt-BR")} pts</span>
              </div>
              <div className="flex justify-between items-center py-1.5 border-b border-zinc-100 font-mono">
                <span className="text-xs text-zinc-500 font-medium font-sans">Banda KAMA Superior</span>
                <span className="text-xs font-semibold text-zinc-600">{bollingerUpper.toLocaleString("pt-BR")} pts</span>
              </div>
              <div className="flex justify-between items-center py-1.5 border-b border-zinc-100 font-mono">
                <span className="text-xs text-zinc-500 font-medium font-sans">Banda KAMA Inferior</span>
                <span className="text-xs font-semibold text-zinc-600">{bollingerLower.toLocaleString("pt-BR")} pts</span>
              </div>
              <div className="flex justify-between items-center py-1.5 border-b border-zinc-100 font-mono">
                <span className="text-xs text-zinc-500 font-medium font-sans">Connors RSI (3,2,100)</span>
                <span className={`text-xs font-bold ${
                  connorsRsi > 70 ? "text-rose-600" : connorsRsi < 30 ? "text-emerald-600" : "text-zinc-700"
                }`}>
                  {connorsRsi} ({connorsRsi > 70 ? "Sobrecomprado" : connorsRsi < 30 ? "Sobrevendido" : "Neutro"})
                </span>
              </div>
              <div className="flex justify-between items-center py-1.5 border-b border-zinc-100 font-mono">
                <span className="text-xs text-zinc-500 font-medium font-sans">Filtro de Kalman</span>
                <span className="text-xs font-bold text-zinc-800">{kalmanPrice.toLocaleString("pt-BR")} pts</span>
              </div>
              <div className="flex justify-between items-center py-1.5 font-mono">
                <span className="text-xs text-zinc-500 font-medium font-sans">Tendência Kalman</span>
                <span className={`text-xs font-bold flex items-center gap-1 ${
                  kalmanTrend === "UP" ? "text-emerald-600" : "text-rose-600"
                }`}>
                  {kalmanTrend === "UP" ? "ALTA" : "BAIXA"}
                </span>
              </div>
            </div>
          </div>
          
          <div className="mt-4 pt-4 border-t border-zinc-100 flex items-center justify-between text-[10px] text-zinc-400 font-mono">
            <span>ATR (14d): {atr} pts</span>
            <span>Risco por Contrato: R$ {riskPerContract.toFixed(0)}</span>
          </div>
        </div>

        {/* Gestão de Risco FAPI */}
        <div className="bg-white border border-zinc-200 rounded-lg p-6 shadow-xs relative overflow-hidden flex flex-col justify-between">
          <div>
            <span className="text-[10px] uppercase font-bold text-zinc-400 tracking-wider flex items-center gap-1.5 font-mono">
              <Sliders className="h-4 w-4 text-zinc-500" /> PARÂMETROS DE CONTROLE DE RISCO
            </span>

            <div className="space-y-4 mt-6">
              {/* Capital Base */}
              <div>
                <label className="text-xs text-zinc-400 block mb-1 font-mono">Capital Simulador (R$)</label>
                <input 
                  type="number" 
                  value={capitalBase} 
                  onChange={(e) => setCapitalBase(Math.max(1000, parseFloat(e.target.value) || 100000))}
                  className="w-full px-3 py-2 border border-zinc-200 rounded-lg text-sm font-semibold text-zinc-800 font-mono focus:outline-none focus:border-zinc-500"
                />
              </div>

              {/* Risco Financeiro Máximo */}
              <div>
                <label className="text-xs text-zinc-400 block mb-1 font-mono">Perda Máxima por Trade (R$)</label>
                <input 
                  type="number" 
                  value={maxRiskCash} 
                  onChange={(e) => setMaxRiskCash(Math.max(100, parseFloat(e.target.value) || 1000))}
                  className="w-full px-3 py-2 border border-zinc-200 rounded-lg text-sm font-semibold text-zinc-800 font-mono focus:outline-none focus:border-zinc-500"
                />
              </div>

              {/* Multiplicador ATR */}
              <div>
                <label className="text-xs text-zinc-400 block mb-1 font-mono">Multiplicador do ATR (Stop)</label>
                <input 
                  type="range" 
                  min="0.3" 
                  max="2.5" 
                  step="0.1"
                  value={atrMultiplier} 
                  onChange={(e) => setAtrMultiplier(parseFloat(e.target.value))}
                  className="w-full h-1.5 bg-zinc-200 rounded-lg appearance-none cursor-pointer accent-zinc-800 focus:outline-none"
                />
                <div className="flex justify-between text-[10px] text-zinc-400 font-mono mt-1">
                  <span>0.3x (Curto)</span>
                  <span className="text-zinc-650 font-bold">{atrMultiplier.toFixed(1)}x ATR</span>
                  <span>2.5x (Largo)</span>
                </div>
              </div>
            </div>
          </div>
          
          <div className="mt-4 pt-4 border-t border-zinc-100 flex justify-between items-center text-xs font-mono">
            <span className="text-zinc-500">PnL Simulado Posição:</span>
            <span className={`font-bold ${simulatedPL >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
              {simulatedPL >= 0 ? "+" : ""}R$ {simulatedPL.toFixed(2)} ({simulatedPercent >= 0 ? "+" : ""}{simulatedPercent.toFixed(2)}%)
            </span>
          </div>
        </div>

      </div>

      {/* Detalhamento do Scoring Quantitativo */}
      <section className="bg-white border border-zinc-200 rounded-lg p-6 shadow-xs relative overflow-hidden">
        <h3 className="text-sm font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-2 mb-6 font-mono">
          <Activity className="h-4 w-4 text-zinc-500" /> Detalhamento do Scoring Quantitativo (Hedge Fund Engine)
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          
          {/* Fator 1: KAMA */}
          <div className="p-4 rounded-lg bg-zinc-50 border border-zinc-200 flex flex-col justify-between font-mono">
            <div>
              <span className="text-[10px] uppercase font-bold text-zinc-400">1. Sinal KAMA</span>
              <div className="text-sm font-bold text-zinc-800 mt-1 font-sans">Preço vs KAMA</div>
              <p className="text-[10px] text-zinc-400 mt-1">WIN {currentPrice.toLocaleString()} vs KAMA {kama.toLocaleString()}</p>
            </div>
            <div className="mt-4 flex items-center justify-between">
              <span className={`text-xs font-bold ${isBuy ? "text-emerald-600" : "text-rose-600"}`}>
                {isBuy ? "Acima (+1)" : "Abaixo (-1)"}
              </span>
              <span className={`px-2 py-0.5 rounded text-xs font-bold ${isBuy ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>
                {isBuy ? "+1" : "-1"}
              </span>
            </div>
          </div>

          {/* Fator 2: Connors RSI */}
          <div className="p-4 rounded-lg bg-zinc-50 border border-zinc-200 flex flex-col justify-between font-mono">
            <div>
              <span className="text-[10px] uppercase font-bold text-zinc-400">2. Momento RSI</span>
              <div className="text-sm font-bold text-zinc-800 mt-1 font-sans">Connors RSI &gt; 50</div>
              <p className="text-[10px] text-zinc-400 mt-1">Valor Atual: {connorsRsi}</p>
            </div>
            <div className="mt-4 flex items-center justify-between">
              <span className={`text-xs font-bold ${connorsRsi > 50 ? "text-emerald-600" : "text-rose-600"}`}>
                {connorsRsi > 50 ? "Alta (+1)" : "Baixa (-1)"}
              </span>
              <span className={`px-2 py-0.5 rounded text-xs font-bold ${connorsRsi > 50 ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>
                {connorsRsi > 50 ? "+1" : "-1"}
              </span>
            </div>
          </div>

          {/* Fator 3: Kalman Filter */}
          <div className="p-4 rounded-lg bg-zinc-50 border border-zinc-200 flex flex-col justify-between font-mono">
            <div>
              <span className="text-[10px] uppercase font-bold text-zinc-400">3. Filtro de Kalman</span>
              <div className="text-sm font-bold text-zinc-800 mt-1 font-sans">Tendência Kalman</div>
              <p className="text-[10px] text-zinc-400 mt-1">Kalman: {kalmanPrice.toLocaleString()} pts</p>
            </div>
            <div className="mt-4 flex items-center justify-between">
              <span className={`text-xs font-bold ${kalmanTrend === "UP" ? "text-emerald-600" : "text-rose-600"}`}>
                {kalmanTrend === "UP" ? "Alta (+1)" : "Baixa (-1)"}
              </span>
              <span className={`px-2 py-0.5 rounded text-xs font-bold ${kalmanTrend === "UP" ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>
                {kalmanTrend === "UP" ? "+1" : "-1"}
              </span>
            </div>
          </div>

          {/* Filtro de Exaustão (Bollinger-KAMA) */}
          <div className="p-4 rounded-lg bg-zinc-50 border border-zinc-200 flex flex-col justify-between font-mono">
            <div>
              <span className="text-[10px] uppercase font-bold text-zinc-400">4. Filtro de Exaustão</span>
              <div className="text-sm font-bold text-zinc-800 mt-1 font-sans">Bandas de Bollinger</div>
              <p className="text-[10px] text-zinc-400 mt-1">Sup: {bollingerUpper.toLocaleString()} | Inf: {bollingerLower.toLocaleString()}</p>
            </div>
            <div className="mt-4 flex items-center justify-between">
              <span className={`text-xs font-bold ${isOverbought || isOversold ? "text-amber-600" : "text-emerald-600"}`}>
                {isOverbought ? "Exaustão Alta" : isOversold ? "Exaustão Baixa" : "Normal"}
              </span>
              <span className={`px-2 py-0.5 rounded text-xs font-bold ${isOverbought || isOversold ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"}`}>
                {isOverbought || isOversold ? "Bloqueado" : "Livre"}
              </span>
            </div>
          </div>

          {/* Consolidado */}
          <div className="p-4 rounded-lg bg-zinc-50 border border-zinc-200 text-zinc-900 flex flex-col justify-between font-mono">
            <div>
              <span className="text-[10px] uppercase font-bold text-zinc-400">Sinal Consolidado</span>
              <div className="text-sm font-bold text-zinc-900 mt-1 font-sans">Decisão Final</div>
              <p className="text-[10px] text-zinc-400 mt-1">Score Total: {totalScore > 0 ? "+" : ""}{totalScore} pts</p>
            </div>
            <div className="mt-4 flex items-center justify-between">
              <span className={`text-xs font-bold ${
                decision === "COMPRA" ? "text-emerald-600" : decision === "VENDA" ? "text-rose-600" : "text-zinc-500"
              }`}>
                {decision}
              </span>
              <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                decision === "COMPRA" ? "bg-emerald-50 text-emerald-750 border border-emerald-100" : decision === "VENDA" ? "bg-rose-50 text-rose-750 border border-rose-100" : "bg-zinc-100 text-zinc-650 border border-zinc-200"
              }`}>
                {decision !== "CAIXA" ? "Operar" : "Aguardar"}
              </span>
            </div>
          </div>

        </div>
      </section>

      {/* Simulador Interativo */}
      <section className="bg-white border border-zinc-200 rounded-lg p-6 shadow-xs">
        <h3 className="text-sm font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-2 mb-6 font-mono">
          <RefreshCw className="h-4 w-4 text-zinc-500" /> SIMULADOR DINÂMICO DE PREÇOS DO MINI ÍNDICE
        </h3>
        
        <div className="space-y-4">
          <div className="flex justify-between items-baseline">
            <span className="text-zinc-500 text-sm">Preço Simulado WIN</span>
            <span className="text-3xl font-black text-zinc-900 tracking-tight font-mono">{simulatedPrice.toLocaleString("pt-BR")} pts</span>
          </div>
          
          <input 
            type="range" 
            min={roundToWIN(kama - 4000)} 
            max={roundToWIN(kama + 4000)} 
            step="5"
            value={simulatedPrice} 
            onChange={(e) => setSimulatedPrice(parseFloat(e.target.value))}
            className="w-full h-1.5 bg-zinc-200 rounded-lg appearance-none cursor-pointer accent-zinc-800 focus:outline-none"
          />
          
          <div className="flex justify-between text-xs text-zinc-400 font-mono">
            <span>Banda Inferior: {bollingerLower.toLocaleString("pt-BR")} pts</span>
            <span className="text-zinc-650 font-bold">KAMA: {kama.toLocaleString("pt-BR")} pts</span>
            <span>Banda Superior: {bollingerUpper.toLocaleString("pt-BR")} pts</span>
          </div>
        </div>
      </section>

      {/* Gráfico da Estratégia */}
      <section className="bg-white border border-zinc-200 rounded-lg p-6 shadow-xs">
        <div className="flex items-center gap-2 mb-6">
          <Cpu className="h-5 w-5 text-zinc-500" />
          <div>
            <h2 className="text-sm font-bold text-zinc-900 uppercase tracking-wider font-mono">Curva de PnL Estimada</h2>
            <p className="text-xs text-zinc-400">Distribuição teórica de lucro/prejuízo com base no preço do WIN</p>
          </div>
        </div>

        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 10, right: 30, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis dataKey="price" stroke="#94a3b8" fontSize={10} tickLine={false} />
              <YAxis stroke="#94a3b8" fontSize={10} tickLine={false} />
              <Tooltip 
                contentStyle={{ backgroundColor: "#ffffff", borderRadius: "8px", border: "1px solid #e4e4e7" }}
                labelStyle={{ color: "#71717a", fontSize: "10px" }}
                itemStyle={{ color: "#18181b", fontSize: "12px" }}
              />
              <ReferenceLine x={kama} stroke="#71717a" strokeDasharray="4 4" label={{ value: "KAMA", fill: "#71717a", fontSize: 10, position: "top" }} />
              <ReferenceLine x={currentPrice} stroke="#10b981" label={{ value: "Preço Simulado", fill: "#10b981", fontSize: 10, position: "top" }} />
              <ReferenceLine x={bollingerUpper} stroke="#d4d4d8" strokeDasharray="2 2" label={{ value: "Bollinger Upper", fill: "#71717a", fontSize: 8, position: "insideTopRight" }} />
              <ReferenceLine x={bollingerLower} stroke="#d4d4d8" strokeDasharray="2 2" label={{ value: "Bollinger Lower", fill: "#71717a", fontSize: 8, position: "insideTopLeft" }} />
              <Line type="monotone" dataKey="PnL Estimado (R$)" stroke="#18181b" strokeWidth={2.5} dot={false} activeDot={{ r: 6 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

    </div>
  );
}
