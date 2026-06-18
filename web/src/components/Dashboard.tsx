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
  ShieldCheck, 
  AlertTriangle, 
  ArrowRightLeft, 
  DollarSign, 
  Layers, 
  RefreshCw,
  Cpu,
  Activity,
  Radio,
  TrendingDown,
  TrendingUp,
  CheckCircle2,
  XCircle,
  Scale
} from "lucide-react";

interface DashboardProps {
  initialState: {
    hedge_active: boolean;
    activation_date: string;
    activation_price: number;
    active_put_ticker: string | null;
    active_put_strike: number | null;
    active_call_ticker: string;
    active_call_strike: number;
    quantity: number;
    put_premium_paid: number;
    call_premium_received: number;
    net_premium_cost: number;
    regime?: "A" | "B";
  };
  initialHistory: any[];
  activeQuotes?: {
    put: { ticker: string; strike: number; price: number; iv: number; delta: number } | null;
    call: { ticker: string; strike: number; price: number; iv: number; delta: number } | null;
    underlyingPrice: number | null;
    skew: number | null;
    put_375: { ticker: string; strike: number; price: number; iv: number; delta: number } | null;
    call_131: { ticker: string; strike: number; price: number; iv: number; delta: number } | null;
    put_20: { ticker: string; strike: number; price: number; iv: number; delta: number } | null;
    put_275: { ticker: string; strike: number; price: number; iv: number; delta: number } | null;
    call_275: { ticker: string; strike: number; price: number; iv: number; delta: number } | null;
    put_50?: { ticker: string; strike: number; price: number; iv: number; delta: number } | null;
    call_50?: { ticker: string; strike: number; price: number; iv: number; delta: number } | null;
    call_06?: { ticker: string; strike: number; price: number; iv: number; delta: number } | null;
    du: number | null;
  } | null;
}

export default function Dashboard({ initialState, initialHistory, activeQuotes }: DashboardProps) {
  const [isMounted, setIsMounted] = useState(false);
  const [simulatedPrice, setSimulatedPrice] = useState(17.66); // Default current price
  
  const state = initialState || {
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
    net_premium_cost: 0.19,
    regime: "B"
  };

  useEffect(() => {
    setIsMounted(true);
    if (activeQuotes?.underlyingPrice) {
      setSimulatedPrice(activeQuotes.underlyingPrice);
    } else if (initialHistory && initialHistory.length > 0) {
      const latestPrice = parseFloat(initialHistory[initialHistory.length - 1].preco_fechamento);
      if (!isNaN(latestPrice)) {
        setSimulatedPrice(latestPrice);
      }
    }
  }, [initialHistory, activeQuotes]);

  const qty = state.quantity;
  const entryPrice = state.activation_price;
  const putStrike = state.active_put_strike;
  const callStrike = state.active_call_strike;
  const putCost = state.active_put_ticker ? state.put_premium_paid : 0.0;
  const callIncome = state.call_premium_received;
  const netCost = state.net_premium_cost;

  // Carrega última linha do histórico de métricas para o Monitor Quantitativo
  const latestMetric = initialHistory && initialHistory.length > 0 
    ? initialHistory[initialHistory.length - 1] 
    : {
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
      };

  const currentClose = parseFloat(latestMetric.preco_fechamento) || 17.66;
  const currentHV = parseFloat(latestMetric.hv_20d) || 0.2125;
  const currentZScore = parseFloat(latestMetric.zscore_vol) || -0.71;
  const currentTSMOM = parseFloat(latestMetric.tsmom_composite) || -0.1120;
  const currentIV = parseFloat(latestMetric.iv_puts) || 0.2490;
  const currentVRP = parseFloat(latestMetric.vrp_puts) || 0.0341;
  const currentKAMA = parseFloat(latestMetric.kama) || 17.60;
  const currentRegime = state.regime || latestMetric.regime || "B";

  // Cotações e Gregas Ativas (Real-Time)
  const putQuote = state.active_put_ticker 
    ? (activeQuotes?.put || {
        ticker: state.active_put_ticker,
        strike: state.active_put_strike || 17.39,
        price: 0.28,
        iv: 0.247,
        delta: -0.275
      }) 
    : null;

  const callQuote = activeQuotes?.call || {
    ticker: state.active_call_ticker || "BBDCG194",
    strike: state.active_call_strike || 19.14,
    price: 0.09,
    iv: 0.213,
    delta: 0.252
  };

  // Cálculo de Deltas e Exposição
  const stockDelta = 1.0;
  const putDelta = putQuote ? putQuote.delta : 0.0; // Delta negativo ou 0 se desmontado
  const callDelta = callQuote.delta; // Delta positivo
  
  // Delta líquido do Collar por ação
  const netDeltaPerShare = state.hedge_active 
    ? (stockDelta + putDelta - callDelta) 
    : 1.0;
    
  const totalNetDelta = netDeltaPerShare * qty;
  const hedgeRatio = (1 - netDeltaPerShare) * 100; // Porcentagem do risco mitigada pelo hedge

  // Preço corrente real (não simulado)
  const livePrice = activeQuotes?.underlyingPrice || currentClose;
  const distToKama = ((livePrice - currentKAMA) / currentKAMA) * 100;

  // Cálculo de Skew do Smile (Put IV - Call IV)
  const smileSkew = ((putQuote?.iv || 0.247) - callQuote.iv) * 100;

  // Cálculo do PnL Real-Time Atual (preços marcados a mercado)
  const currentPutVal = putQuote ? (putQuote.price * qty) : 0.0;
  const currentCallVal = callQuote.price * qty;
  
  const initialPutVal = state.active_put_ticker ? (state.put_premium_paid * qty) : 0.0;
  const initialCallVal = state.call_premium_received * qty;

  const currentPutPL = (state.hedge_active && state.active_put_ticker) ? (currentPutVal - initialPutVal) : 0;
  const currentCallPL = state.hedge_active ? (initialCallVal - currentCallVal) : 0; // Venda de call: ganha se o preço cai
  
  const currentStockPL = (simulatedPrice - state.activation_price) * qty;

  const currentTotalPL = currentStockPL + currentPutPL + currentCallPL;
  const currentReturnPercent = (currentTotalPL / (state.activation_price * qty)) * 100;

  // Preços e Resultados Real-Time baseados no preço atual real (não simulado)
  const liveStockPL = (livePrice - state.activation_price) * qty;
  const liveTotalPL = liveStockPL + currentPutPL + currentCallPL;

  // Z-Score da Volatilidade Implícita das Puts (Z-Score de IV 20d)
  const calculateIVZScore = (hist: any[], currentIV: number) => {
    const windowSize = 20;
    const ivs = hist.map(h => parseFloat(h.iv_puts)).filter(v => !isNaN(v));
    if (ivs.length === 0) return 0.0;
    ivs.push(currentIV);
    const slice = ivs.slice(-windowSize);
    if (slice.length < 5) return 0.0;
    const mean = slice.reduce((a, b) => a + b, 0) / slice.length;
    const variance = slice.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / slice.length;
    const stdDev = Math.sqrt(variance);
    return stdDev > 0 ? (currentIV - mean) / stdDev : 0.0;
  };

  const currentPutIV = state.hedge_active && putQuote ? putQuote.iv : (parseFloat(latestMetric.iv_puts) || 0.249);
  const ivZScore = calculateIVZScore(initialHistory || [], currentPutIV);

  // Skew da Superfície Matemático (Put Delta -0.375 IV vs Call Delta 0.131 IV)
  const skewSuperficie = activeQuotes?.skew !== undefined && activeQuotes?.skew !== null
    ? activeQuotes.skew
    : (activeQuotes?.put_375 && activeQuotes?.call_131
      ? (activeQuotes.put_375.iv - activeQuotes.call_131.iv) * 100
      : smileSkew);

  // ────────────────────────────────────────────────
  // Lógica de Sinais Operacionais — Ordens de Home Broker
  // ────────────────────────────────────────────────
  interface OrderLeg {
    action: "COMPRA" | "VENDA";
    ticker: string;
    qty: number;
    strike: number;
    nature: string; // ex: "Desmontar Put" / "Rolar Call OTM"
    color: "green" | "red" | "blue" | "amber";
  }

  let signalTitle = "MANTER CARREGAMENTO";
  let signalColorClass = "border-emerald-200 bg-emerald-50/50 text-emerald-950 bg-emerald-600";
  let signalAction = "Manter Estrutura Atual";
  let orderLegs: OrderLeg[] = [];
  let signalNote = "";

  // Verifica se há cruzamento pendente no preço live vs KAMA
  const isCrossoverAbove = currentRegime === "B" && livePrice > currentKAMA;
  const isCrossoverBelow = currentRegime === "A" && livePrice < currentKAMA;

  if (isCrossoverAbove) {
    signalTitle = "TRANSIÇÃO: ALTA (REGIME A)";
    signalColorClass = "border-indigo-200 bg-indigo-50/50 text-indigo-950 bg-indigo-600";
    signalAction = "Desmontar Put + Rolar Call para OTM";
    signalNote = `⚠️ Cruzamento UP — Preço R$ ${livePrice.toFixed(2)} ultrapassou KAMA R$ ${currentKAMA.toFixed(2)}`;

    const targetCallTicker = activeQuotes?.call_06?.ticker || "BBDCG200";
    const targetCallStrike = activeQuotes?.call_06?.strike || 20.00;

    if (state.active_put_ticker && state.active_put_strike) {
      orderLegs.push({
        action: "VENDA",
        ticker: state.active_put_ticker,
        qty: qty,
        strike: state.active_put_strike,
        nature: "Desmontar Put (Zerar Proteção)",
        color: "red"
      });
    }
    if (state.active_call_ticker) {
      orderLegs.push({
        action: "COMPRA",
        ticker: state.active_call_ticker,
        qty: qty,
        strike: state.active_call_strike,
        nature: "Recomprar Call Atual (Encerrar)",
        color: "green"
      });
    }
    orderLegs.push({
      action: "VENDA",
      ticker: targetCallTicker,
      qty: qty,
      strike: targetCallStrike,
      nature: "Vender Call OTM nova (Δ ≈ 0.06)",
      color: "red"
    });

  } else if (isCrossoverBelow) {
    signalTitle = "TRANSIÇÃO: PROTEÇÃO (REGIME B)";
    signalColorClass = "border-rose-200 bg-rose-50/50 text-rose-950 bg-rose-600";
    signalAction = "Montar Put ATM + Rolar Call para ATM";
    signalNote = `⚠️ Cruzamento DOWN — Preço R$ ${livePrice.toFixed(2)} caiu abaixo da KAMA R$ ${currentKAMA.toFixed(2)}`;

    const targetPutTicker = activeQuotes?.put_50?.ticker || "BBDCS175";
    const targetPutStrike = activeQuotes?.put_50?.strike || parseFloat(livePrice.toFixed(0)) + 0.00;
    const targetCallTicker = activeQuotes?.call_50?.ticker || "BBDCG175";
    const targetCallStrike = activeQuotes?.call_50?.strike || parseFloat(livePrice.toFixed(0)) + 0.00;

    orderLegs.push({
      action: "COMPRA",
      ticker: targetPutTicker,
      qty: qty,
      strike: targetPutStrike,
      nature: "Comprar Put ATM nova (Δ ≈ -0.50)",
      color: "green"
    });
    if (state.active_call_ticker) {
      orderLegs.push({
        action: "COMPRA",
        ticker: state.active_call_ticker,
        qty: qty,
        strike: state.active_call_strike,
        nature: "Recomprar Call Atual (Encerrar)",
        color: "green"
      });
    }
    orderLegs.push({
      action: "VENDA",
      ticker: targetCallTicker,
      qty: qty,
      strike: targetCallStrike,
      nature: "Vender Call ATM nova (Δ ≈ 0.50)",
      color: "red"
    });

  } else {
    if (currentRegime === "A") {
      signalTitle = "REGIME A — ALTA ATIVA";
      signalColorClass = "border-emerald-200 bg-emerald-50/50 text-emerald-950 bg-emerald-600";
      signalAction = "Nenhuma Ordem Necessária";
      signalNote = `✔ Preço (R$ ${livePrice.toFixed(2)}) acima da KAMA (R$ ${currentKAMA.toFixed(2)}). Exposição direcional máxima.`;
    } else {
      signalTitle = "REGIME B — HEDGE ATIVO";
      signalColorClass = "border-blue-200 bg-blue-50/50 text-blue-950 bg-blue-600";
      signalAction = "Nenhuma Ordem Necessária";
      signalNote = `✔ Preço (R$ ${livePrice.toFixed(2)}) abaixo da KAMA (R$ ${currentKAMA.toFixed(2)}). Caixa sintético preservado.`;
    }
  }

  // Calculadora de Cenários
  const calculateScenario = (price: number) => {
    const stockPL = (price - entryPrice) * qty;
    const putPL = state.active_put_ticker 
      ? (Math.max(0, (state.active_put_strike || 0) - price) - putCost) * qty
      : 0.0;
    const callPL = (callIncome - Math.max(0, price - callStrike)) * qty;
    const optionsPL = putPL + callPL;
    const totalPL = stockPL + optionsPL;
    
    const stockVal = price * qty;
    const optionsVal = ((state.active_put_ticker ? Math.max(0, (state.active_put_strike || 0) - price) : 0.0) 
      - Math.max(0, price - callStrike)) * qty;
    const totalVal = stockVal + optionsVal;
    
    const netReturnPercent = (totalPL / (entryPrice * qty)) * 100;
    const unhedgedReturnPercent = (stockPL / (entryPrice * qty)) * 100;

    return {
      stockPL,
      putPL,
      callPL,
      optionsPL,
      totalPL,
      stockVal,
      totalVal,
      netReturnPercent,
      unhedgedReturnPercent
    };
  };

  const currentMetrics = calculateScenario(simulatedPrice);

  // Geração de Dados do Gráfico
  const chartData = [];
  for (let p = 14.5; p <= 21.5; p += 0.1) {
    const formattedPrice = Math.round(p * 100) / 100;
    const scenario = calculateScenario(formattedPrice);
    chartData.push({
      price: formattedPrice,
      "Retorno com Hedge (Collar)": Math.round(scenario.totalPL),
      "Retorno sem Hedge (Long)": Math.round(scenario.stockPL),
    });
  }

  // Tabela de Cenários Dinâmica
  const fixedScenarios = Array.from(new Set([
    14.50,
    15.50,
    16.50,
    17.00,
    ...(state.active_put_strike ? [state.active_put_strike] : []),
    livePrice,
    entryPrice,
    18.50,
    callStrike,
    20.00,
    21.00
  ])).sort((a, b) => a - b);

  const getStatusBadge = () => {
    if (state.active_put_strike && simulatedPrice <= state.active_put_strike) {
      return (
        <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
          <ShieldCheck className="h-3 w-3 mr-1.5" /> Proteção Ativada (Loss Limitado)
        </span>
      );
    } else if (simulatedPrice >= callStrike) {
      return (
        <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
          <AlertTriangle className="h-3 w-3 mr-1.5" /> Lucro Máximo Atingido (Cap)
        </span>
      );
    } else {
      return (
        <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
          <ArrowRightLeft className="h-3 w-3 mr-1.5" /> {state.active_put_ticker ? "Flutuação Livre (Zona Collar)" : "Exposição Direcional (Sem Put)"}
        </span>
      );
    }
  };

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-800 font-sans antialiased selection:bg-indigo-100">
      
      {/* Container Principal */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        
        {/* Header */}
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8 pb-6 border-b border-slate-200">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider bg-slate-100 text-slate-600 border border-slate-200">
                Quantitative Portfolio
              </span>
              {getStatusBadge()}
            </div>
            <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">
              Monitor de Hedge: <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-emerald-600">BBDC4 Collar</span>
            </h1>
          </div>
          
          <div className="flex flex-col md:text-right">
            <span className="text-xs text-slate-400">Operação Iniciada em</span>
            <span className="text-sm font-semibold text-slate-700">
              {new Date(state.activation_date).toLocaleDateString("pt-BR")}
            </span>
          </div>
        </header>

        {/* Dashboard Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          
          {/* Card: Detalhes da Operação */}
          <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm relative overflow-hidden">
            <div className="absolute top-0 left-0 h-1 w-full bg-indigo-600" />
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2 mb-4">
              <Layers className="h-4 w-4 text-indigo-500" /> Detalhes da Estrutura
            </h3>
            
            <div className="space-y-4">
              <div className="flex justify-between items-center py-2 border-b border-slate-100">
                <span className="text-slate-500 text-sm">Ações BBDC4</span>
                <span className="font-semibold text-slate-900">{qty.toLocaleString("pt-BR")} Qtd @ R$ {entryPrice.toFixed(2)}</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-slate-100">
                <span className="text-slate-500 text-sm">Put Long (Proteção)</span>
                <span className="font-semibold text-emerald-600">
                  {state.active_put_ticker 
                    ? `${state.active_put_ticker} (K: R$ ${state.active_put_strike?.toFixed(2)})` 
                    : "DESMONTADA (Regime A)"}
                </span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-slate-100">
                <span className="text-slate-500 text-sm">Call Short (Financ.)</span>
                <span className="font-semibold text-amber-600">{state.active_call_ticker} (K: R$ {callStrike.toFixed(2)})</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-slate-100">
                <span className="text-slate-500 text-sm">Prêmio da Put Pago</span>
                <span className="font-semibold text-slate-700">
                  {state.active_put_ticker 
                    ? `R$ ${putCost.toFixed(2)} (- R$ ${Math.round(putCost * qty)})` 
                    : "R$ 0,00"}
                </span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-slate-100">
                <span className="text-slate-500 text-sm">Prêmio da Call Recebido</span>
                <span className="font-semibold text-slate-700">R$ {callIncome.toFixed(2)} (+ R$ {Math.round(callIncome * qty)})</span>
              </div>
              <div className="flex justify-between items-center pt-2">
                <span className="text-slate-500 text-sm">Custo Líquido do Hedge</span>
                <span className="font-semibold text-slate-900">R$ {netCost.toFixed(2)} (- R$ {Math.round(netCost * qty)})</span>
              </div>
            </div>
          </div>

          {/* Card: Simulador Interativo */}
          <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm relative overflow-hidden">
            <div className="absolute top-0 left-0 h-1 w-full bg-emerald-500" />
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2 mb-4">
              <RefreshCw className="h-4 w-4 text-emerald-500" /> Simulador de Cenários
            </h3>
            
            <div className="flex flex-col h-full justify-between pb-2">
              <div className="space-y-4">
                <div className="flex justify-between items-baseline">
                  <span className="text-slate-500 text-sm">Preço Simulado de BBDC4</span>
                  <span className="text-2xl font-black text-slate-900 tracking-tight">R$ {simulatedPrice.toFixed(2)}</span>
                </div>
                
                {/* Input Slider */}
                <input 
                  type="range" 
                  min="14.50" 
                  max="21.50" 
                  step="0.05"
                  value={simulatedPrice} 
                  onChange={(e) => setSimulatedPrice(parseFloat(e.target.value))}
                  className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600 focus:outline-none"
                />
                
                <div className="flex justify-between text-[10px] text-slate-400 font-mono">
                  <span>MÍN: R$ 14,50</span>
                  <span className="text-indigo-600 font-bold">ENTRADA: R$ 17,80</span>
                  <span>MÁX: R$ 21,50</span>
                </div>
              </div>

              <div className="mt-6 p-4 rounded-lg bg-slate-50 border border-slate-100 space-y-3">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-500 font-medium">Valor Total da Carteira</span>
                  <span className="font-bold text-slate-700">R$ {currentMetrics.totalVal.toLocaleString("pt-BR", {minimumFractionDigits: 2})}</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-400 font-medium">Valor das Ações Puras</span>
                  <span className="font-semibold text-slate-500">R$ {currentMetrics.stockVal.toLocaleString("pt-BR", {minimumFractionDigits: 2})}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Card: PnL Consolidado */}
          <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm relative overflow-hidden">
            <div className="absolute top-0 left-0 h-1 w-full bg-purple-500" />
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2 mb-4">
              <DollarSign className="h-4 w-4 text-purple-500" /> Lucro / Prejuízo Estimado
            </h3>
            
            <div className="space-y-6">
              <div>
                <span className="text-slate-500 text-sm">Resultado Líquido do Collar</span>
                <div className={`text-4xl font-black tracking-tight mt-1 flex items-baseline gap-2 ${currentMetrics.totalPL >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                  {currentMetrics.totalPL >= 0 ? "+" : ""}R$ {currentMetrics.totalPL.toLocaleString("pt-BR", {maximumFractionDigits: 0})}
                  <span className="text-sm font-semibold">({currentMetrics.netReturnPercent >= 0 ? "+" : ""}{currentMetrics.netReturnPercent.toFixed(2)}%)</span>
                </div>
              </div>

              <div className="p-4 rounded-lg bg-slate-50 border border-slate-100 space-y-3">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-500 font-medium">Resultado Sem Hedge (Long)</span>
                  <span className={`font-semibold ${currentMetrics.stockPL >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                    {currentMetrics.stockPL >= 0 ? "+" : ""}R$ {currentMetrics.stockPL.toLocaleString("pt-BR", {maximumFractionDigits: 0})} ({currentMetrics.unhedgedReturnPercent >= 0 ? "+" : ""}{currentMetrics.unhedgedReturnPercent.toFixed(2)}%)
                  </span>
                </div>
                
                <div className="flex justify-between items-center text-xs pt-2 border-t border-slate-200">
                  <span className="text-slate-500 font-medium">Assimetria Gerada pelo Collar</span>
                  <span className={`font-bold ${currentMetrics.totalPL - currentMetrics.stockPL >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                    {currentMetrics.totalPL - currentMetrics.stockPL >= 0 ? "+" : ""}R$ {Math.round(currentMetrics.totalPL - currentMetrics.stockPL).toLocaleString("pt-BR")}
                  </span>
                </div>
              </div>
            </div>
          </div>

        </div>

        {/* Monitor Quantitativo de Sinais */}
        <section className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm mb-8">
          <div className="flex items-center gap-2 mb-6 pb-4 border-b border-slate-100">
            <Cpu className="h-5 w-5 text-indigo-600" />
            <div>
              <h2 className="text-lg font-bold text-slate-900">Quant Decision Engine (Monitor KAMA & Fatores)</h2>
              <p className="text-xs text-slate-400">Algoritmo de tomada de decisão para regimes de travas de hedge e crossovers adaptativos</p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* Coluna 1: Stance do Modelo */}
            <div className="flex flex-col justify-between p-5 rounded-xl border border-slate-200 bg-slate-50 relative overflow-hidden">
              <div className="absolute top-0 left-0 h-full w-1.5 bg-indigo-600" />
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Diretriz do Modelo</span>
                <div className="text-2xl font-black text-slate-900 mt-2 mb-3 tracking-tight flex items-center gap-2">
                  <Radio className={`h-5 w-5 animate-pulse ${currentRegime === "A" ? "text-emerald-600" : "text-rose-600"}`} />
                  {currentRegime === "A" ? "REGIME A: ALTA / ALFA" : "REGIME B: PROTEÇÃO / CAIXA"}
                </div>
                <p className="text-xs text-slate-500 leading-relaxed">
                  {currentRegime === "A" 
                    ? `Preço de BBDC4 (R$ ${livePrice.toFixed(2)}) acima da KAMA (R$ ${currentKAMA.toFixed(2)}). O robô está em modo de maximização de alfa. Put desmontada (Proteção zerada) e Call curta rolada OTM para permitir participação na alta.`
                    : `Preço de BBDC4 (R$ ${livePrice.toFixed(2)}) abaixo da KAMA (R$ ${currentKAMA.toFixed(2)}). O robô está em modo de preservação de capital. Put ATM ativa (Delta ~-0.50) e Call vendida ATM para travar a carteira em Cash Sintético.`
                  }
                </p>
              </div>
              <div className="mt-4 pt-4 border-t border-slate-200 flex justify-between items-center text-[10px] text-slate-400 font-mono">
                <span>Cálculo: Diário (Pós-Fechamento)</span>
                <span>Data: {latestMetric.data}</span>
              </div>
            </div>

            {/* Coluna 2: Fatores de Risco */}
            <div className="space-y-4 p-5 rounded-xl border border-slate-100 bg-white">
              <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider flex items-center gap-1.5">
                <Activity className="h-3.5 w-3.5 text-slate-400" /> Fatores Quantitativos (KAMA + AQR Style)
              </span>
              
              <div className="space-y-3 mt-2">
                <div className="flex justify-between items-center py-1.5 border-b border-slate-50">
                  <span className="text-xs text-slate-500">Média Adaptativa KAMA</span>
                  <span className="font-mono text-xs font-bold text-slate-700">
                    R$ {currentKAMA.toFixed(2)}
                  </span>
                </div>

                <div className="flex justify-between items-center py-1.5 border-b border-slate-50">
                  <span className="text-xs text-slate-500">Afastamento da KAMA</span>
                  <span className={`font-mono text-xs font-bold ${distToKama > 0 ? "text-emerald-600" : "text-rose-600"}`}>
                    {distToKama > 0 ? "+" : ""}{distToKama.toFixed(2)}%
                  </span>
                </div>

                <div className="flex justify-between items-center py-1.5 border-b border-slate-50">
                  <div className="flex items-center gap-1.5 text-xs text-slate-500">
                    {currentTSMOM < 0 ? <TrendingDown className="h-3.5 w-3.5 text-rose-500" /> : <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />}
                    Momentum Composto (TSMOM)
                  </div>
                  <span className={`font-mono text-xs font-bold ${currentTSMOM < 0 ? "text-rose-600" : "text-emerald-600"}`}>
                    {currentTSMOM.toFixed(4)}
                  </span>
                </div>

                <div className="flex justify-between items-center py-1.5 border-b border-slate-50">
                  <span className="text-xs text-slate-500">Volatilidade Histórica (HV 20d)</span>
                  <span className="font-mono text-xs font-bold text-slate-700">
                    {(currentHV * 100).toFixed(2)}%
                  </span>
                </div>

                <div className="flex justify-between items-center py-1.5 border-b border-slate-50">
                  <span className="text-xs text-slate-500">Z-Score de Vol. (Regime)</span>
                  <span className={`font-mono text-xs font-bold ${currentZScore > 0 ? "text-amber-600" : "text-slate-500"}`}>
                    {currentZScore > 0 ? "+" : ""}{currentZScore.toFixed(2)}
                  </span>
                </div>

                <div className="flex justify-between items-center py-1.5">
                  <span className="text-xs text-slate-500">Vol. Risk Premium (VRP Puts)</span>
                  <span className={`font-mono text-xs font-bold ${currentVRP < 0 ? "text-emerald-600" : "text-rose-600"}`}>
                    {currentVRP > 0 ? "+" : ""}{(currentVRP * 100).toFixed(2)}%
                  </span>
                </div>
              </div>
            </div>

            {/* Coluna 3: Gatilhos e Status */}
            <div className="p-5 rounded-xl border border-slate-100 bg-white space-y-4">
              <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                Status dos Gatilhos Operacionais
              </span>

              <div className="space-y-3.5 mt-2">
                <div>
                  <span className="text-[10px] text-slate-400 font-semibold block mb-1">GATILHOS KAMA</span>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-500">Tendência de Alta (Preço &gt; KAMA)</span>
                      <span className={`flex items-center gap-1 font-semibold ${livePrice > currentKAMA ? "text-emerald-600" : "text-slate-400"}`}>
                        {livePrice > currentKAMA ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> : <XCircle className="h-3.5 w-3.5 text-slate-300" />}
                        {livePrice > currentKAMA ? "Ativo (Regime A)" : "Inativo"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-500">Tendência de Baixa (Preço &lt; KAMA)</span>
                      <span className={`flex items-center gap-1 font-semibold ${livePrice < currentKAMA ? "text-rose-600" : "text-slate-400"}`}>
                        {livePrice < currentKAMA ? <CheckCircle2 className="h-3.5 w-3.5 text-rose-500" /> : <XCircle className="h-3.5 w-3.5 text-slate-300" />}
                        {livePrice < currentKAMA ? "Ativo (Regime B)" : "Inativo"}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-100">
                  <span className="text-[10px] text-slate-400 font-semibold block mb-1">FATORES ADICIONAIS</span>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-500">Reversão de Momentum (TSMOM &gt; 0)</span>
                      <span className={`flex items-center gap-1 font-semibold ${currentTSMOM > 0 ? "text-emerald-600" : "text-slate-400"}`}>
                        {currentTSMOM > 0 ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> : <XCircle className="h-3.5 w-3.5 text-slate-300" />}
                        {currentTSMOM > 0 ? "Ativo" : "Inativo"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-500">Vol Crush (IV Percentil &gt; 95%)</span>
                      <span className="flex items-center gap-1 font-semibold text-slate-400">
                        <XCircle className="h-3.5 w-3.5 text-slate-300" /> Inativo
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

          </div>
        </section>

        {/* Monitor Real-Time de Volatilidade, Skew & Gregas */}
        <section className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm mb-8">
          <div className="flex items-center gap-2 mb-6 pb-4 border-b border-slate-100">
            <Scale className="h-5 w-5 text-indigo-600" />
            <div>
              <h2 className="text-lg font-bold text-slate-900">Monitor Analítico & Sinais de Ajuste Collar (Cotação B3)</h2>
              <p className="text-xs text-slate-400">Acompanhamento atômico dos limites operacionais de Skew da Superfície, Z-Score de IV e Delta Líquido com recomendações de compra/venda</p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* Tabela de Parâmetros Operacionais (ocupa 2 colunas) */}
            <div className="lg:col-span-2 border border-slate-200 rounded-xl overflow-hidden bg-white shadow-sm flex flex-col justify-between">
              <div className="p-4 bg-slate-50 border-b border-slate-200">
                <span className="text-xs uppercase font-bold text-slate-500">Parâmetros Quantitativos de Cobertura</span>
              </div>
              <div className="overflow-x-auto flex-1">
                <table className="w-full text-sm text-left text-slate-500">
                  <thead className="text-[10px] uppercase tracking-wider text-slate-400 bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th scope="col" className="px-5 py-3 font-bold">Indicador</th>
                      <th scope="col" className="px-5 py-3 font-bold">Valor Atual</th>
                      <th scope="col" className="px-5 py-3 font-bold">Alerta de Ajuste</th>
                      <th scope="col" className="px-5 py-3 font-bold">Ação Esperada</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-sans">
                    
                    {/* Linha KAMA */}
                    <tr className="hover:bg-slate-50">
                      <td className="px-5 py-4">
                        <div className="font-semibold text-slate-900">Média Adaptativa KAMA</div>
                        <div className="text-[10px] text-slate-400">Média adaptativa de Kaufman (n=10) como rastreador de tendência</div>
                      </td>
                      <td className="px-5 py-4 font-mono font-bold text-slate-950">
                        <span className={`px-2 py-0.5 rounded text-xs ${currentRegime === "A" ? "bg-emerald-100 text-emerald-700 font-extrabold" : "bg-rose-100 text-rose-700 font-extrabold"}`}>
                          R$ {currentKAMA.toFixed(2)} ({distToKama > 0 ? "+" : ""}{distToKama.toFixed(2)}%)
                        </span>
                      </td>
                      <td className="px-5 py-4 font-semibold text-slate-700 font-mono text-xs">
                        Cruzamento Preço vs KAMA
                      </td>
                      <td className="px-5 py-4 text-xs text-slate-600">
                        Alterna regimes de travas de proteção (Alfa vs Capital)
                      </td>
                    </tr>

                    {/* Linha Skew */}
                    <tr className="hover:bg-slate-50">
                      <td className="px-5 py-4">
                        <div className="font-semibold text-slate-900">Skew da Superfície</div>
                        <div className="text-[10px] text-slate-400">Diferença de IV entre Delta -0.375 e 0.131</div>
                      </td>
                      <td className="px-5 py-4 font-mono font-bold text-slate-950">
                        <span className={`px-2 py-0.5 rounded text-xs ${skewSuperficie > 5.0 ? "bg-indigo-100 text-indigo-700" : "bg-slate-100 text-slate-700"}`}>
                          {skewSuperficie.toFixed(2)}%
                        </span>
                      </td>
                      <td className="px-5 py-4 font-semibold text-slate-700 font-mono text-xs">
                        &gt; +5.0%
                      </td>
                      <td className="px-5 py-4 text-xs text-slate-600">
                        Rolling Down da Put (Ganha crédito no pânico)
                      </td>
                    </tr>

                    {/* Linha Z-Score IV */}
                    <tr className="hover:bg-slate-50">
                      <td className="px-5 py-4">
                        <div className="font-semibold text-slate-900">Z-Score de IV (20d)</div>
                        <div className="text-[10px] text-slate-400">Afastamento da Vol. Implícita das puts da média histórica</div>
                      </td>
                      <td className="px-5 py-4 font-mono font-bold text-slate-950">
                        <span className={`px-2 py-0.5 rounded text-xs ${ivZScore < -1.0 ? "bg-rose-100 text-rose-700 font-extrabold animate-pulse" : "bg-slate-100 text-slate-700"}`}>
                          {ivZScore.toFixed(2)}
                        </span>
                      </td>
                      <td className="px-5 py-4 font-semibold text-slate-700 font-mono text-xs">
                        &lt; -1.0
                      </td>
                      <td className="px-5 py-4 text-xs text-slate-600">
                        Desmontar Put (Evita perda por Vol Crush)
                      </td>
                    </tr>

                    {/* Linha Delta Líquido */}
                    <tr className="hover:bg-slate-50">
                      <td className="px-5 py-4">
                        <div className="font-semibold text-slate-900">Delta Líquido (&Delta;<sub>net</sub>)</div>
                        <div className="text-[10px] text-slate-400">Risco direcional consolidado da carteira collar</div>
                      </td>
                      <td className="px-5 py-4 font-mono font-bold text-slate-950">
                        <span className={`px-2 py-0.5 rounded text-xs ${(netDeltaPerShare < 0.35 || netDeltaPerShare > 0.65) ? "bg-amber-100 text-amber-700 font-extrabold" : "bg-slate-100 text-slate-700"}`}>
                          {netDeltaPerShare.toFixed(3)}
                        </span>
                      </td>
                      <td className="px-5 py-4 font-semibold text-slate-700 font-mono text-xs">
                        &lt; 0.35 ou &gt; 0.65
                      </td>
                      <td className="px-5 py-4 text-xs text-slate-600">
                        Ajustar Strikes (Rebalanceamento do Hedge Direcional)
                      </td>
                    </tr>

                  </tbody>
                </table>
              </div>
              <div className="p-3 bg-slate-50 border-t border-slate-100 text-[10px] text-slate-400 leading-relaxed text-center">
                Métricas atualizadas automaticamente. Preço corrente de BBDC4: R$ {livePrice.toFixed(2)}.
              </div>
            </div>

            {/* Painel do Sinal Operacional (ocupa 1 coluna) */}
            <div className={`border rounded-xl overflow-hidden shadow-sm flex flex-col justify-between ${signalColorClass.split(" ")[0]} ${signalColorClass.split(" ")[1]}`}>
              <div className={`p-4 border-b border-slate-200 text-white font-black text-xs tracking-wider flex justify-between items-center ${signalColorClass.split(" ")[3]}`}>
                <span>RECOMENDAÇÃO OPERACIONAL</span>
                <span className="w-2.5 h-2.5 bg-white rounded-full animate-ping" />
              </div>
              
              <div className="p-5 flex-1 flex flex-col gap-4">
                {/* Status + Ação */}
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">Status do Algoritmo</span>
                  <span className="text-base font-black tracking-tight text-slate-900 block mt-0.5">
                    {signalTitle}
                  </span>
                  <span className="text-xs font-semibold text-indigo-700 mt-1 block">{signalAction}</span>
                </div>

                {/* Nota de contexto */}
                {signalNote && (
                  <div className="px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-[11px] font-semibold text-amber-800 leading-snug">
                    {signalNote}
                  </div>
                )}

                {/* Order Ticket */}
                <div className="rounded-xl border border-slate-200 overflow-hidden bg-white shadow-inner">
                  <div className="px-4 py-2 bg-slate-800 flex items-center justify-between">
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-300">📋 Ordens Home Broker — BBDC4 Collar</span>
                    <span className="text-[10px] font-mono text-slate-400">Qtd base: {qty.toLocaleString("pt-BR")}</span>
                  </div>

                  {orderLegs.length === 0 ? (
                    <div className="px-4 py-5 text-center">
                      <span className="text-2xl block mb-1">✅</span>
                      <span className="text-xs font-bold text-slate-500 block">Nenhuma ordem necessária</span>
                      <span className="text-[10px] text-slate-400 mt-0.5 block">Robô monitorando crossovers KAMA</span>
                    </div>
                  ) : (
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200">
                          <th className="px-3 py-2 text-left text-[9px] uppercase tracking-wider text-slate-400 font-bold">Ação</th>
                          <th className="px-3 py-2 text-left text-[9px] uppercase tracking-wider text-slate-400 font-bold">Ativo</th>
                          <th className="px-3 py-2 text-right text-[9px] uppercase tracking-wider text-slate-400 font-bold">Qtd</th>
                          <th className="px-3 py-2 text-right text-[9px] uppercase tracking-wider text-slate-400 font-bold">Strike</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {orderLegs.map((leg, i) => (
                          <tr key={i} className={leg.color === "red" ? "bg-rose-50" : leg.color === "green" ? "bg-emerald-50" : "bg-white"}>
                            <td className="px-3 py-2.5">
                              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black tracking-wider border ${
                                leg.action === "VENDA"
                                  ? "bg-rose-100 text-rose-700 border-rose-300"
                                  : "bg-emerald-100 text-emerald-700 border-emerald-300"
                              }`}>
                                {leg.action === "VENDA" ? "▼" : "▲"} {leg.action}
                              </span>
                            </td>
                            <td className="px-3 py-2.5">
                              <div className="font-black text-slate-900 tracking-tight">{leg.ticker}</div>
                              <div className="text-[9px] text-slate-400 mt-0.5 leading-tight">{leg.nature}</div>
                            </td>
                            <td className="px-3 py-2.5 text-right">
                              <span className="font-black font-mono text-slate-800">{leg.qty.toLocaleString("pt-BR")}</span>
                            </td>
                            <td className="px-3 py-2.5 text-right">
                              <span className="font-mono font-bold text-slate-600">R$ {leg.strike.toFixed(2)}</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>

                {/* Rodapé */}
                <div className="pt-2 border-t border-slate-200/60 flex justify-between items-center text-[10px] text-slate-400">
                  <span className="font-semibold text-slate-500">Δ Líquido: {totalNetDelta >= 0 ? "+" : ""}{Math.round(totalNetDelta)} ações ({(hedgeRatio).toFixed(1)}% hedgeado)</span>
                  <span className="flex items-center gap-1 font-semibold text-emerald-600">
                    <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-ping" />
                    B3 Live
                  </span>
                </div>
              </div>
            </div>

          </div>
        </section>

        {/* Gráfico Teórico PnL */}
        <section className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm mb-8">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Curva de Payoff Teórico no Vencimento</h2>
              <p className="text-xs text-slate-400">Comparação visual do retorno do Collar contra a posição Long em Ações Puras</p>
            </div>
            
            <div className="flex gap-4 text-xs font-semibold">
              <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-indigo-600 inline-block" /> Portfólio com Hedge (Collar)</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-slate-300 border-dashed border inline-block" /> Ações Puras (Sem Hedge)</span>
            </div>
          </div>
          
          <div className="h-[380px] w-full">
            {!isMounted ? (
              <div className="h-full w-full flex items-center justify-center text-zinc-400">
                Carregando gráfico...
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 20, right: 20, left: 10, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis 
                    dataKey="price" 
                    stroke="#94a3b8" 
                    tickFormatter={(val) => `R$ ${val}`} 
                    fontSize={11}
                    tickMargin={10}
                  />
                  <YAxis 
                    stroke="#94a3b8" 
                    tickFormatter={(val) => `R$ ${val}`} 
                    fontSize={11}
                    tickMargin={10}
                  />
                  <Tooltip 
                    contentStyle={{ backgroundColor: "#ffffff", borderColor: "#e2e8f0", borderRadius: "8px", fontSize: "12px", color: "#0f172a", boxShadow: "0 1px 3px 0 rgba(0, 0, 0, 0.1)" }}
                    formatter={(value: any) => [`R$ ${value}`, ""]}
                    labelFormatter={(label) => `Preço de BBDC4: R$ ${label}`}
                  />
                  
                  {/* Linha da Proteção (Put Strike) */}
                  {state.active_put_strike && (
                    <ReferenceLine 
                      x={state.active_put_strike} 
                      stroke="#10b981" 
                      strokeDasharray="3 3"
                      label={{ value: "Piso (Put K)", fill: "#047857", position: "top", fontSize: 10, fontWeight: "bold" }} 
                    />
                  )}
                  
                  {/* Linha do Preço de Entrada */}
                  <ReferenceLine 
                    x={entryPrice} 
                    stroke="#6366f1" 
                    strokeDasharray="3 3"
                    label={{ value: "Entrada (R$ 17,80)", fill: "#4f46e5", position: "top", fontSize: 10, fontWeight: "bold" }} 
                  />

                  {/* Linha do Limite de Lucro (Call Strike) */}
                  <ReferenceLine 
                    x={callStrike} 
                    stroke="#f59e0b" 
                    strokeDasharray="3 3"
                    label={{ value: "Teto (Call K)", fill: "#b45309", position: "top", fontSize: 10, fontWeight: "bold" }} 
                  />

                  {/* Linha do Preço Simulado Atual */}
                  <ReferenceLine 
                    x={simulatedPrice} 
                    stroke="#a855f7" 
                    strokeWidth={2}
                    label={{ value: `R$ ${simulatedPrice.toFixed(2)}`, fill: "#7e22ce", position: "bottom", fontSize: 11, fontWeight: "bold" }} 
                  />

                  <Line 
                    type="monotone" 
                    dataKey="Retorno com Hedge (Collar)" 
                    stroke="#4f46e5" 
                    strokeWidth={2.5} 
                    dot={false} 
                    activeDot={{ r: 6 }}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="Retorno sem Hedge (Long)" 
                    stroke="#cbd5e1" 
                    strokeWidth={1.5} 
                    strokeDasharray="5 5" 
                    dot={false} 
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </section>

        {/* Tabela de Cenários */}
        <section className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
          <div className="mb-6">
            <h2 className="text-lg font-bold text-slate-900">Grade Completa de Cenários no Vencimento</h2>
            <p className="text-xs text-slate-400">Mapeamento matemático dos retornos e valores das opções para diferentes preços de vencimento</p>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left text-slate-500">
              <thead className="text-xs uppercase tracking-wider text-slate-400 bg-slate-50 border-b border-slate-200">
                <tr>
                  <th scope="col" className="px-6 py-4 font-semibold">Preço do Ativo</th>
                  <th scope="col" className="px-6 py-4 font-semibold">Valor das Ações</th>
                  <th scope="col" className="px-6 py-4 font-semibold text-indigo-600">Valor com Hedge</th>
                  <th scope="col" className="px-6 py-4 font-semibold text-slate-600">Resultado Ação Pura</th>
                  <th scope="col" className="px-6 py-4 font-semibold text-emerald-600">PnL da PUT</th>
                  <th scope="col" className="px-6 py-4 font-semibold text-amber-600">PnL da CALL</th>
                  <th scope="col" className="px-6 py-4 font-semibold">Custo do Hedge</th>
                  <th scope="col" className="px-6 py-4 font-semibold text-slate-900">Retorno Líquido Collar</th>
                  <th scope="col" className="px-6 py-4 font-semibold">Resultado (%)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {fixedScenarios.map((price, idx) => {
                  const s = calculateScenario(price);
                  const isCurrent = Math.abs(simulatedPrice - price) < 0.05;
                  const isPutStrike = price === putStrike;
                  const isCallStrike = price === callStrike;
                  const isEntry = price === entryPrice;

                  let rowBgClass = "hover:bg-slate-50";
                  
                  if (isCurrent) {
                    rowBgClass = "bg-purple-50 hover:bg-purple-100 border-l-4 border-purple-500 text-purple-900";
                  } else if (isPutStrike) {
                    rowBgClass = "bg-emerald-50 hover:bg-emerald-100 border-l-4 border-emerald-500 text-emerald-900";
                  } else if (isCallStrike) {
                    rowBgClass = "bg-amber-50 hover:bg-amber-100 border-l-4 border-amber-500 text-amber-900";
                  } else if (isEntry) {
                    rowBgClass = "bg-indigo-50 hover:bg-indigo-100 border-l-4 border-indigo-500 text-indigo-900";
                  }

                  return (
                    <tr key={idx} className={`transition-colors duration-150 ${rowBgClass}`}>
                      <td className="px-6 py-4 font-mono font-bold text-slate-900">
                        R$ {price.toFixed(2)}
                        {isCurrent && <span className="ml-2 px-1.5 py-0.5 rounded text-[9px] uppercase font-bold tracking-wider bg-purple-100 text-purple-700">Simulado</span>}
                        {isPutStrike && <span className="ml-2 px-1.5 py-0.5 rounded text-[9px] uppercase font-bold tracking-wider bg-emerald-100 text-emerald-700">Put Strike</span>}
                        {isCallStrike && <span className="ml-2 px-1.5 py-0.5 rounded text-[9px] uppercase font-bold tracking-wider bg-amber-100 text-amber-700">Call Strike</span>}
                        {isEntry && <span className="ml-2 px-1.5 py-0.5 rounded text-[9px] uppercase font-bold tracking-wider bg-indigo-100 text-indigo-700">Entrada</span>}
                      </td>
                      <td className="px-6 py-4 font-mono">
                        R$ {s.stockVal.toLocaleString("pt-BR", {minimumFractionDigits: 2})}
                      </td>
                      <td className="px-6 py-4 font-mono font-semibold text-indigo-600">
                        R$ {s.totalVal.toLocaleString("pt-BR", {minimumFractionDigits: 2})}
                      </td>
                      <td className={`px-6 py-4 font-mono font-semibold ${s.stockPL >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                        {s.stockPL >= 0 ? "+" : ""}R$ {Math.round(s.stockPL).toLocaleString("pt-BR")} ({s.unhedgedReturnPercent >= 0 ? "+" : ""}{s.unhedgedReturnPercent.toFixed(2)}%)
                      </td>
                      <td className={`px-6 py-4 font-mono font-medium ${s.putPL >= 0 ? "text-emerald-600" : "text-slate-400"}`}>
                        {s.putPL >= 0 ? "+" : ""}R$ {Math.round(s.putPL).toLocaleString("pt-BR")}
                      </td>
                      <td className={`px-6 py-4 font-mono font-medium ${s.callPL >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                        {s.callPL >= 0 ? "+" : ""}R$ {Math.round(s.callPL).toLocaleString("pt-BR")}
                      </td>
                      <td className="px-6 py-4 font-mono text-slate-400">
                        -R$ {Math.round(netCost * qty)}
                      </td>
                      <td className={`px-6 py-4 font-mono font-bold ${s.totalPL >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                        {s.totalPL >= 0 ? "+" : ""}R$ {Math.round(s.totalPL).toLocaleString("pt-BR")}
                      </td>
                      <td className={`px-6 py-4 font-mono font-bold ${s.totalPL >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                        {s.netReturnPercent >= 0 ? "+" : ""}{s.netReturnPercent.toFixed(2)}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

      </main>
      
      {/* Footer */}
      <footer className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 text-center text-xs text-slate-400 border-t border-slate-200 mt-12">
        <p>© 2026 Hedge Fund Quant Platform. Executado em modo Informativo / Read-Only para BBDC4.</p>
      </footer>
    </div>
  );
}
