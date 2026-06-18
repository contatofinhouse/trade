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
  HelpCircle
} from "lucide-react";

interface LongShortWinProps {
  initialState: {
    close_price: number;
    kama: number;
    atr: number;
    high: number;
    low: number;
  };
  livePriceFromClear?: number | null;
}

export default function LongShortWin({ initialState, livePriceFromClear }: LongShortWinProps) {
  const [isMounted, setIsMounted] = useState(false);
  const [capitalBase, setCapitalBase] = useState(10000); // R$ 10.000 padrão
  const [riskPercent, setRiskPercent] = useState(1.0); // 1% de risco padrão
  const [atrMultiplier, setAtrMultiplier] = useState(2.0); // 2x ATR para Stop
  
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
  const atr = roundToWIN(initialState.atr || 1500); // Ex: 1500 pontos ATR

  const distToKama = ((currentPrice - kama) / kama) * 100;

  // Lógica do Crossover KAMA (Sem considerar robô de execução)
  const isBuy = currentPrice > kama;
  const signalText = isBuy ? "COMPRA (LONG)" : "VENDA (SHORT)";
  const signalColorClass = isBuy 
    ? "border-emerald-200 bg-emerald-50/50 text-emerald-950 bg-emerald-600"
    : "border-rose-200 bg-rose-50/50 text-rose-950 bg-rose-600";

  // Alvo e Stop baseados no ATR
  // Compra: Stop = KAMA - (ATR * multiplier), Alvo = Entrada + (ATR * multiplier * 1.5)
  // Venda: Stop = KAMA + (ATR * multiplier), Alvo = Entrada - (ATR * multiplier * 1.5)
  const stopDistance = roundToWIN(atr * atrMultiplier);
  const targetDistance = roundToWIN(atr * atrMultiplier * 1.5); // Relação Risco/Retorno 1:1.5

  const stopLoss = isBuy ? roundToWIN(currentPrice - stopDistance) : roundToWIN(currentPrice + stopDistance);
  const targetProfit = isBuy ? roundToWIN(currentPrice + targetDistance) : roundToWIN(currentPrice - targetDistance);

  // Dimensionamento Dinâmico de Lote (Contratos)
  // Risco Financeiro Máximo (R$)
  const maxRiskCash = (capitalBase * riskPercent) / 100;
  // Risco por contrato do WIN = Distância do Stop em pontos * R$ 0.20
  const riskPerContract = stopDistance * 0.20;
  // Contratos (mínimo 1)
  const contractsSize = Math.max(1, Math.floor(maxRiskCash / riskPerContract));

  // Simulação de Retorno PnL
  const winPointValue = 0.20; // R$ 0,20 por ponto no WIN por contrato
  const simulatedChange = isBuy ? (currentPrice - basePrice) : (basePrice - currentPrice);
  const simulatedPL = simulatedChange * winPointValue * contractsSize;
  const simulatedPercent = (simulatedPL / capitalBase) * 100;

  // Geração de dados do gráfico fictício ao redor da KAMA
  const chartData = [];
  const startPrice = roundToWIN(kama - 3000);
  const endPrice = roundToWIN(kama + 3000);
  for (let p = startPrice; p <= endPrice; p += 100) {
    const formattedPrice = roundToWIN(p);
    const profit = isBuy ? (formattedPrice - currentPrice) * winPointValue * contractsSize : (currentPrice - formattedPrice) * winPointValue * contractsSize;
    chartData.push({
      price: formattedPrice,
      "PnL Estimado (R$)": Math.round(profit),
    });
  }

  if (!isMounted) return null;

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      
      {/* Cards de Métricas Principais */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* Recomendação Operacional */}
        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm relative overflow-hidden flex flex-col justify-between">
          <div className="absolute top-0 left-0 h-1 w-full bg-indigo-600" />
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider flex items-center gap-1.5">
              <Layers className="h-4 w-4 text-indigo-500" /> RECOMENDAÇÃO OPERACIONAL
            </span>
            
            <div className="mt-4 flex items-center justify-between">
              <div>
                <span className="text-xs text-slate-400">Direção Sugerida</span>
                <div className="text-3xl font-extrabold text-slate-900 tracking-tight mt-0.5">
                  {signalText}
                </div>
              </div>
              <span className={`px-3 py-1 rounded-full text-xs font-bold ${isBuy ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"}`}>
                {isBuy ? "Tendência de Alta" : "Tendência de Baixa"}
              </span>
            </div>

            <div className="space-y-3 mt-6">
              <div className="flex justify-between items-center py-2 border-b border-slate-100">
                <span className="text-slate-500 text-sm">Contratos Recomendados</span>
                <span className="font-bold text-slate-900">{contractsSize} contratos</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-slate-100">
                <span className="text-slate-500 text-sm">Entrada Referência</span>
                <span className="font-semibold text-slate-800">{currentPrice.toLocaleString("pt-BR")} pts</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-slate-100">
                <span className="text-rose-600 text-sm font-semibold">Stop Loss</span>
                <span className="font-bold text-rose-600">{stopLoss.toLocaleString("pt-BR")} pts ({stopDistance} pts)</span>
              </div>
              <div className="flex justify-between items-center py-2">
                <span className="text-emerald-600 text-sm font-semibold">Alvo (Take Profit)</span>
                <span className="font-bold text-emerald-600">{targetProfit.toLocaleString("pt-BR")} pts ({targetDistance} pts)</span>
              </div>
            </div>
          </div>
          
          <div className="mt-4 pt-4 border-t border-slate-100 text-[10px] text-slate-400 leading-relaxed">
            ⚠️ <b>Risco Limitado</b>: R$ {maxRiskCash.toFixed(2)} ({riskPercent}% de R$ {capitalBase.toLocaleString("pt-BR")}).
          </div>
        </div>

        {/* Parâmetros Quantitativos (WIN + KAMA) */}
        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm relative overflow-hidden flex flex-col justify-between">
          <div className="absolute top-0 left-0 h-1 w-full bg-emerald-500" />
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider flex items-center gap-1.5">
              <Cpu className="h-4 w-4 text-emerald-500" /> MONITOR ANALÍTICO KAMA
            </span>
            
            <div className="mt-4">
              <span className="text-xs text-slate-400">Preço Atual WIN</span>
              <div className="text-4xl font-black text-slate-900 tracking-tight mt-0.5">
                {currentPrice.toLocaleString("pt-BR")} <span className="text-lg font-medium text-slate-400">pts</span>
              </div>
            </div>

            <div className="space-y-3 mt-6">
              <div className="flex justify-between items-center py-2 border-b border-slate-100">
                <span className="text-slate-500 text-sm">Média Adaptativa KAMA</span>
                <span className="font-semibold text-slate-800">{kama.toLocaleString("pt-BR")} pts</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-slate-100">
                <span className="text-slate-500 text-sm">Afastamento da KAMA</span>
                <span className={`font-semibold ${distToKama >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                  {distToKama >= 0 ? "+" : ""}{distToKama.toFixed(2)}%
                </span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-slate-100">
                <span className="text-slate-500 text-sm">Volatilidade ATR (14d)</span>
                <span className="font-semibold text-slate-800">{atr} pontos</span>
              </div>
              <div className="flex justify-between items-center py-2">
                <span className="text-slate-500 text-sm">Risco Monetário / Contrato</span>
                <span className="font-semibold text-slate-800">R$ {riskPerContract.toFixed(2)}</span>
              </div>
            </div>
          </div>
          
          <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-400 font-mono">
            <span>Tick Mínimo: 5 pontos</span>
            <span>Multiplier: R$ 0,20</span>
          </div>
        </div>

        {/* Configurações de Risco do Usuário */}
        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm relative overflow-hidden flex flex-col justify-between">
          <div className="absolute top-0 left-0 h-1 w-full bg-purple-500" />
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider flex items-center gap-1.5">
              <Activity className="h-4 w-4 text-purple-500" /> PARÂMETROS DE GESTÃO DE RISCO
            </span>

            <div className="space-y-4 mt-6">
              {/* Capital Base */}
              <div>
                <label className="text-xs text-slate-400 block mb-1">Capital Simulador (R$)</label>
                <input 
                  type="number" 
                  value={capitalBase} 
                  onChange={(e) => setCapitalBase(Math.max(1000, parseFloat(e.target.value) || 10000))}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-semibold text-slate-800 focus:outline-none focus:border-indigo-500"
                />
              </div>

              {/* Risco % */}
              <div>
                <label className="text-xs text-slate-400 block mb-1">Limite de Risco por Operação (%)</label>
                <select 
                  value={riskPercent} 
                  onChange={(e) => setRiskPercent(parseFloat(e.target.value))}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-semibold text-slate-800 focus:outline-none focus:border-indigo-500"
                >
                  <option value="0.5">0.5% (Conservador)</option>
                  <option value="1.0">1.0% (Moderado)</option>
                  <option value="2.0">2.0% (Agressivo)</option>
                  <option value="5.0">5.0% (Alavancado)</option>
                </select>
              </div>

              {/* Multiplicador ATR */}
              <div>
                <label className="text-xs text-slate-400 block mb-1">Multiplicador do ATR (Stop)</label>
                <input 
                  type="range" 
                  min="1.0" 
                  max="3.5" 
                  step="0.5"
                  value={atrMultiplier} 
                  onChange={(e) => setAtrMultiplier(parseFloat(e.target.value))}
                  className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-purple-600 focus:outline-none"
                />
                <div className="flex justify-between text-[10px] text-slate-400 font-mono mt-1">
                  <span>1.0x</span>
                  <span className="text-purple-600 font-bold">{atrMultiplier}x ATR</span>
                  <span>3.5x</span>
                </div>
              </div>
            </div>
          </div>
          
          <div className="mt-4 pt-4 border-t border-slate-100 flex justify-between items-center text-xs">
            <span className="text-slate-500">PnL Simulado Posição:</span>
            <span className={`font-bold ${simulatedPL >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
              {simulatedPL >= 0 ? "+" : ""}R$ {simulatedPL.toFixed(2)} ({simulatedPercent >= 0 ? "+" : ""}{simulatedPercent.toFixed(2)}%)
            </span>
          </div>
        </div>

      </div>

      {/* Simulador Interativo */}
      <section className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
        <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2 mb-6">
          <RefreshCw className="h-4 w-4 text-indigo-500" /> SIMULADOR DINÂMICO DE PREÇOS DO MINI ÍNDICE
        </h3>
        
        <div className="space-y-4">
          <div className="flex justify-between items-baseline">
            <span className="text-slate-500 text-sm">Preço Simulado WIN</span>
            <span className="text-3xl font-black text-slate-900 tracking-tight">{simulatedPrice.toLocaleString("pt-BR")} pts</span>
          </div>
          
          <input 
            type="range" 
            min={roundToWIN(kama - 4000)} 
            max={roundToWIN(kama + 4000)} 
            step="5"
            value={simulatedPrice} 
            onChange={(e) => setSimulatedPrice(parseFloat(e.target.value))}
            className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600 focus:outline-none"
          />
          
          <div className="flex justify-between text-xs text-slate-400 font-mono">
            <span>MÍN: {(kama - 4000).toLocaleString("pt-BR")} pts</span>
            <span className="text-indigo-600 font-bold">KAMA: {kama.toLocaleString("pt-BR")} pts</span>
            <span>MÁX: {(kama + 4000).toLocaleString("pt-BR")} pts</span>
          </div>
        </div>
      </section>

      {/* Gráfico da Estratégia */}
      <section className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
        <div className="flex items-center gap-2 mb-6">
          <Cpu className="h-5 w-5 text-indigo-600" />
          <div>
            <h2 className="text-lg font-bold text-slate-900">Curva de PnL Estimada</h2>
            <p className="text-xs text-slate-400">Distribuição teórica de lucro/prejuízo com base no preço do WIN</p>
          </div>
        </div>

        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 10, right: 30, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis dataKey="price" stroke="#94a3b8" fontSize={10} tickLine={false} />
              <YAxis stroke="#94a3b8" fontSize={10} tickLine={false} />
              <Tooltip 
                contentStyle={{ backgroundColor: "#0f172a", borderRadius: "8px", border: "none" }}
                labelStyle={{ color: "#94a3b8", fontSize: "10px" }}
                itemStyle={{ color: "#38bdf8", fontSize: "12px" }}
              />
              <ReferenceLine x={kama} stroke="#6366f1" strokeDasharray="4 4" label={{ value: "KAMA", fill: "#6366f1", fontSize: 10, position: "top" }} />
              <ReferenceLine x={currentPrice} stroke="#10b981" label={{ value: "Preço Simulado", fill: "#10b981", fontSize: 10, position: "top" }} />
              <Line type="monotone" dataKey="PnL Estimado (R$)" stroke="#8b5cf6" strokeWidth={2.5} dot={false} activeDot={{ r: 6 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

    </div>
  );
}
