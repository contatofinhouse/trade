"use client";

import React, { useState, useEffect } from "react";
import { 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  Layers, 
  Activity,
  Sliders,
  ShieldAlert
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
  winTicker?: string;
}

export default function LongShortWin({ initialState, livePriceFromClear, winTicker = "WINQ26" }: LongShortWinProps) {
  const [isMounted, setIsMounted] = useState(false);
  
  // Parâmetros de risco (compactos e ajustáveis)
  const [capitalBase, setCapitalBase] = useState(100000);
  const [maxRiskCash, setMaxRiskCash] = useState(1000);
  const [atrMultiplier, setAtrMultiplier] = useState(1.0);
  
  // Preço do WIN atual
  const basePrice = livePriceFromClear || initialState.close_price || 120000;
  const [simulatedPrice, setSimulatedPrice] = useState(basePrice);

  useEffect(() => {
    setIsMounted(true);
    if (livePriceFromClear) {
      setSimulatedPrice(livePriceFromClear);
    }
  }, [livePriceFromClear]);

  const roundToWIN = (val: number) => Math.round(val / 5) * 5;

  const currentPrice = roundToWIN(simulatedPrice);
  const kama = roundToWIN(initialState.kama || basePrice);
  const atr = roundToWIN(initialState.atr || 1500);
  
  const bollingerUpper = roundToWIN(initialState.bollinger_upper || kama + 3000);
  const bollingerLower = roundToWIN(initialState.bollinger_lower || kama - 3000);
  const connorsRsi = Math.round(initialState.connors_rsi || 50);
  const kalmanTrend = initialState.kalman_trend || "UP";

  // Scoring
  const isBuy = currentPrice > kama;
  const scoreKama = isBuy ? 1 : -1;
  const scoreRsi = connorsRsi > 50 ? 1 : -1;
  const scoreKalman = kalmanTrend === "UP" ? 1 : -1;
  const totalScore = scoreKama + scoreRsi + scoreKalman;

  const isOverbought = currentPrice >= bollingerUpper;
  const isOversold = currentPrice <= bollingerLower;

  let decision: "COMPRA" | "VENDA" | "CAIXA" = "CAIXA";
  let blockReason = "";

  if (totalScore >= 2) {
    if (isOverbought) {
      decision = "CAIXA";
      blockReason = "Preço esticado acima da banda superior.";
    } else {
      decision = "COMPRA";
    }
  } else if (totalScore <= -2) {
    if (isOversold) {
      decision = "CAIXA";
      blockReason = "Preço esticado abaixo da banda inferior.";
    } else {
      decision = "VENDA";
    }
  } else {
    blockReason = `Score insuficiente (${totalScore > 0 ? "+" : ""}${totalScore}). Aguardando sinal claro.`;
  }

  const stopDistance = roundToWIN(atr * atrMultiplier);
  const targetDistance = roundToWIN(atr * atrMultiplier * 1.5);

  const stopLoss = decision === "COMPRA" ? roundToWIN(currentPrice - stopDistance) : roundToWIN(currentPrice + stopDistance);
  const targetProfit = decision === "COMPRA" ? roundToWIN(currentPrice + targetDistance) : roundToWIN(currentPrice - targetDistance);

  const riskPerContract = stopDistance * 0.20;
  const contractsSize = Math.max(1, Math.floor(maxRiskCash / riskPerContract));

  const winPointValue = 0.20;
  const simulatedChange = decision === "COMPRA" ? (currentPrice - basePrice) : (basePrice - currentPrice);
  const simulatedPL = decision !== "CAIXA" ? simulatedChange * winPointValue * contractsSize : 0.0;
  const simulatedPercent = (simulatedPL / capitalBase) * 100;

  if (!isMounted) return null;

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      
      {/* Três Cards Principais */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* Card 1: Resultado PnL */}
        <div className="bg-white border border-zinc-200 rounded-lg p-6 shadow-xs flex flex-col justify-between">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-2 mb-3 font-mono">
              <DollarSign className="h-4 w-4 text-zinc-500" /> RESULTADO DA OPERAÇÃO
            </h3>
            <span className="text-zinc-500 text-xs font-medium">PnL Estimado da Posição</span>
            <div className={`text-3xl font-black tracking-tight mt-1 flex items-baseline gap-2 font-mono ${simulatedPL >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
              {simulatedPL >= 0 ? "+" : ""}R$ {simulatedPL.toLocaleString("pt-BR", {minimumFractionDigits: 2})}
              <span className="text-xs font-bold">({simulatedPercent >= 0 ? "+" : ""}{simulatedPercent.toFixed(2)}%)</span>
            </div>
          </div>
          <p className="text-[10px] text-zinc-400 mt-4 border-t border-zinc-150 pt-3 font-mono">
            WIN {currentPrice.toLocaleString("pt-BR")} pts vs Ref {basePrice.toLocaleString("pt-BR")} pts
          </p>
        </div>

        {/* Card 2: Recomendação e Score */}
        <div className="bg-white border border-zinc-200 rounded-lg p-6 shadow-xs flex flex-col justify-between">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-2 mb-3 font-mono">
              <Activity className="h-4 w-4 text-zinc-500" /> SINAL DO MODELO QUANT
            </h3>
            <span className="text-zinc-500 text-xs font-medium">Recomendação Operacional</span>
            <div className={`text-3xl font-black tracking-tight mt-1 flex items-baseline gap-2 font-mono ${
              decision === "COMPRA" ? "text-emerald-600" : decision === "VENDA" ? "text-rose-600" : "text-zinc-500"
            }`}>
              {decision === "COMPRA" ? "COMPRA" : decision === "VENDA" ? "VENDA" : "AGUARDAR"}
              <span className="text-xs font-bold text-zinc-400 font-sans">({totalScore > 0 ? "+" : ""}{totalScore} pts)</span>
            </div>
          </div>
          <p className="text-[10px] text-zinc-400 mt-4 border-t border-zinc-150 pt-3 font-mono">
            {decision !== "CAIXA" ? `Lote Recomendado: ${contractsSize} contratos` : blockReason}
          </p>
        </div>

        {/* Card 3: Parâmetros Rápidos de Risco */}
        <div className="bg-white border border-zinc-200 rounded-lg p-6 shadow-xs flex flex-col justify-between">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-2 mb-3 font-mono">
              <Sliders className="h-4 w-4 text-zinc-500" /> AJUSTES DE RISCO
            </h3>
            <div className="space-y-3 mt-2">
              <div className="flex justify-between items-center text-xs font-mono">
                <span className="text-zinc-500">Perda Máxima:</span>
                <input 
                  type="number" 
                  value={maxRiskCash} 
                  onChange={(e) => setMaxRiskCash(Math.max(100, parseFloat(e.target.value) || 1000))}
                  className="w-24 px-1.5 py-0.5 border border-zinc-200 rounded text-right font-bold text-zinc-800 focus:outline-none"
                />
              </div>
              <div className="flex justify-between items-center text-xs font-mono">
                <span className="text-zinc-500">Stop Multiplier:</span>
                <div className="flex items-center gap-2">
                  <input 
                    type="range" 
                    min="0.3" 
                    max="2.5" 
                    step="0.1"
                    value={atrMultiplier} 
                    onChange={(e) => setAtrMultiplier(parseFloat(e.target.value))}
                    className="w-16 accent-zinc-800"
                  />
                  <span className="font-bold text-zinc-800">{atrMultiplier.toFixed(1)}x</span>
                </div>
              </div>
            </div>
          </div>
          <div className="text-[10px] text-zinc-500 mt-3 border-t border-zinc-150 pt-2 flex justify-between font-mono">
            <span>ATR: {atr} pts</span>
            <span>Stop: {stopDistance} pts</span>
          </div>
        </div>

      </div>

      {/* Tabela de Posicionamento Unificada */}
      <section className="bg-white border border-zinc-200 rounded-lg p-6 shadow-xs">
        <div className="mb-6 pb-3 border-b border-zinc-150 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-zinc-900 uppercase tracking-wider font-mono">Posicionamento Detalhado do Mini Índice (WIN)</h2>
            <p className="text-xs text-zinc-400">Detalhamento dos alvos, stops e cotações correntes do modelo</p>
          </div>
          <span className="px-2 py-0.5 rounded text-[10px] font-bold font-mono bg-zinc-100 text-zinc-650 border border-zinc-200">
            SINAIS QUANTITATIVOS
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left text-zinc-500">
            <thead className="text-[10px] uppercase tracking-wider text-zinc-400 bg-zinc-50 border-b border-zinc-250 font-mono">
              <tr>
                <th scope="col" className="px-6 py-4 font-bold text-zinc-900">Ativo / Contrato</th>
                <th scope="col" className="px-6 py-4 font-bold">Direção</th>
                <th scope="col" className="px-6 py-4 font-bold text-right">Lote (Qtd)</th>
                <th scope="col" className="px-6 py-4 font-bold text-right">Entrada</th>
                <th scope="col" className="px-6 py-4 font-bold text-right text-zinc-900">Cotação Atual</th>
                <th scope="col" className="px-6 py-4 font-bold text-right text-rose-600">Stop Loss</th>
                <th scope="col" className="px-6 py-4 font-bold text-right text-emerald-600">Take Profit</th>
                <th scope="col" className="px-6 py-4 font-bold text-right text-zinc-900">PnL Estimado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-150">
              {decision !== "CAIXA" ? (
                <tr className="hover:bg-zinc-50/50 transition-all font-mono">
                  <td className="px-6 py-4 font-bold text-zinc-950">{winTicker}</td>
                  <td className={`px-6 py-4 text-xs font-bold font-sans ${decision === "COMPRA" ? "text-emerald-600" : "text-rose-600"}`}>
                    {decision === "COMPRA" ? "COMPRADO (LONG)" : "VENDIDO (SHORT)"}
                  </td>
                  <td className="px-6 py-4 text-right font-bold text-zinc-800">{contractsSize} Contratos</td>
                  <td className="px-6 py-4 text-right">{basePrice.toLocaleString("pt-BR")} pts</td>
                  <td className="px-6 py-4 text-right font-bold text-zinc-900 bg-zinc-50/70">{currentPrice.toLocaleString("pt-BR")} pts</td>
                  <td className="px-6 py-4 text-right text-rose-600 font-bold">{stopLoss.toLocaleString("pt-BR")} pts</td>
                  <td className="px-6 py-4 text-right text-emerald-600 font-bold">{targetProfit.toLocaleString("pt-BR")} pts</td>
                  <td className={`px-6 py-4 text-right font-bold ${simulatedPL >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                    {simulatedPL >= 0 ? "+" : ""}R$ {simulatedPL.toLocaleString("pt-BR", {minimumFractionDigits: 2, maximumFractionDigits: 2})} ({simulatedPercent >= 0 ? "+" : ""}{simulatedPercent.toFixed(2)}%)
                  </td>
                </tr>
              ) : (
                <tr>
                  <td colSpan={8} className="px-6 py-8 text-center text-zinc-400 font-mono text-xs">
                    Nenhuma operação recomendada ativa no momento. Aguardando alinhamento dos sinais quantitativos (Regime Neutro).
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

    </div>
  );
}
