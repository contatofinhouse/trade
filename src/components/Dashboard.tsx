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
import LongShortWin from "./LongShortWin";

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
  winIndicators?: {
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
  winLivePrice?: number | null;
  initialCustody?: any[] | null;
  initialWinTicker?: string;
}

export default function Dashboard({ initialState, initialHistory, activeQuotes, winIndicators, winLivePrice, initialCustody, initialWinTicker }: DashboardProps) {
  const [isMounted, setIsMounted] = useState(false);
  const [activeTab, setActiveTab] = useState<"bbdc4" | "win">("bbdc4");
  const [simulatedPrice, setSimulatedPrice] = useState(17.66); // Default current price
  
  const [liveQuotes, setLiveQuotes] = useState(activeQuotes);
  const [liveWinPrice, setLiveWinPrice] = useState(winLivePrice);
  const [liveState, setLiveState] = useState(initialState);
  const [isFetchingQuotes, setIsFetchingQuotes] = useState(false);
  const [liveCustody, setLiveCustody] = useState<any[] | null>(initialCustody || null);
  const [liveWinTicker, setLiveWinTicker] = useState(initialWinTicker || "WINQ26");

  const state = liveState || {
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
  }, []);

  useEffect(() => {
    if (liveQuotes?.underlyingPrice) {
      setSimulatedPrice(liveQuotes.underlyingPrice);
    } else if (initialHistory && initialHistory.length > 0) {
      const latestPrice = parseFloat(initialHistory[initialHistory.length - 1].preco_fechamento);
      if (!isNaN(latestPrice)) {
        setSimulatedPrice(latestPrice);
      }
    }
  }, [initialHistory, liveQuotes]);

  useEffect(() => {
    let intervalId: any;
    if (isMounted) {
      // Executa uma vez imediatamente ao montar
      const fetchInitial = async () => {
        try {
          setIsFetchingQuotes(true);
          const res = await fetch("/api/quotes");
          if (res.ok) {
            const data = await res.json();
            if (data.activeQuotes) setLiveQuotes(data.activeQuotes);
            if (data.winLivePrice !== undefined) setLiveWinPrice(data.winLivePrice);
            if (data.winTicker) setLiveWinTicker(data.winTicker);
            if (data.clearCustody) setLiveCustody(data.clearCustody);
            if (data.state) setLiveState(data.state);
          }
        } catch (error) {
          console.error("Erro ao buscar cotações iniciais:", error);
        } finally {
          setIsFetchingQuotes(false);
        }
      };
      fetchInitial();

      intervalId = setInterval(async () => {
        try {
          setIsFetchingQuotes(true);
          const res = await fetch("/api/quotes");
          if (res.ok) {
            const data = await res.json();
            if (data.activeQuotes) {
              setLiveQuotes(data.activeQuotes);
            }
            if (data.winLivePrice !== undefined) {
              setLiveWinPrice(data.winLivePrice);
            }
            if (data.winTicker) {
              setLiveWinTicker(data.winTicker);
            }
            if (data.clearCustody) {
              setLiveCustody(data.clearCustody);
            }
            if (data.state) {
              setLiveState(data.state);
            }
          }
        } catch (error) {
          console.error("Erro ao buscar cotações atualizadas:", error);
        } finally {
          setIsFetchingQuotes(false);
        }
      }, 10000); // 10 segundos
    }
    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [isMounted]);

  // Parâmetros da Posição com possibilidade de sobreposição dinâmica via custódia da Clear
  let qty = state.quantity;
  let entryPrice = state.activation_price;
  let putTicker: string | null = state.active_put_ticker;
  let putStrike: number | null = state.active_put_strike;
  let callTicker: string | null = state.active_call_ticker;
  let callStrike: number | null = state.active_call_strike;
  let isHedgeActive = state.hedge_active;
  let putQty = state.active_put_ticker ? qty : 0;
  let callQty = state.active_call_ticker ? qty : 0;
  let custodyPutItem: any = null;
  let custodyCallItem: any = null;

  if (liveCustody && liveCustody.length > 0) {
    const custodyBbdc4 = liveCustody.find((item: any) => item.ticker === "BBDC4");
    if (custodyBbdc4 && custodyBbdc4.availableQuantity > 0) {
      qty = custodyBbdc4.availableQuantity;
      entryPrice = custodyBbdc4.averageCost || entryPrice;
    }

    const getOptionType = (ticker: string) => {
      if (!ticker.startsWith("BBDC") || ticker.length <= 4) return null;
      const letter = ticker[4].toUpperCase();
      if (["M", "N", "O", "P", "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z"].includes(letter)) return "PUT";
      if (["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"].includes(letter)) return "CALL";
      return null;
    };

    // Busca Put na custódia (preferindo ativa, mas aceitando zerada)
    custodyPutItem = liveCustody.find((item: any) => 
      getOptionType(item.ticker) === "PUT" &&
      (Math.abs(item.availableQuantity || 0) > 0 || Math.abs(item.collateralBlockedQuantity || 0) > 0)
    );
    if (!custodyPutItem) {
      custodyPutItem = liveCustody.find((item: any) => 
        getOptionType(item.ticker) === "PUT"
      );
    }

    if (custodyPutItem) {
      putTicker = custodyPutItem.ticker;
      putQty = (custodyPutItem.availableQuantity || 0) + (custodyPutItem.collateralBlockedQuantity || 0);
      isHedgeActive = putQty > 0;
    } else {
      putTicker = null;
      putStrike = null;
      putQty = 0;
      isHedgeActive = false;
    }

    // Busca Call na custódia (preferindo ativa, mas aceitando zerada)
    custodyCallItem = liveCustody.find((item: any) => 
      getOptionType(item.ticker) === "CALL" &&
      (Math.abs(item.availableQuantity || 0) > 0 || Math.abs(item.collateralBlockedQuantity || 0) > 0)
    );
    if (!custodyCallItem) {
      custodyCallItem = liveCustody.find((item: any) => 
        getOptionType(item.ticker) === "CALL"
      );
    }

    if (custodyCallItem) {
      callTicker = custodyCallItem.ticker;
      callQty = (custodyCallItem.availableQuantity || 0) + (custodyCallItem.collateralBlockedQuantity || 0);
    } else {
      callTicker = null;
      callStrike = null;
      callQty = 0;
    }
  }

  // Preços de Custo originais ou ajustados
  const putCost = putTicker ? (state.active_put_ticker === putTicker ? state.put_premium_paid : 0.28) : 0.0;
  const callIncome = callTicker ? (state.active_call_ticker === callTicker ? state.call_premium_received : 0.09) : 0.0;
  const netCost = putCost - callIncome;

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
  const putQuote = putTicker 
    ? (liveQuotes?.put || {
        ticker: putTicker,
        strike: putStrike || 17.39,
        price: 0.28,
        iv: 0.247,
        delta: -0.275
      }) 
    : null;

  const callQuote = (liveQuotes?.call && liveQuotes.call.ticker === callTicker) 
    ? liveQuotes.call 
    : (callTicker ? {
        ticker: callTicker,
        strike: callStrike || 19.14,
        price: 0.09,
        iv: 0.213,
        delta: 0.252
      } : null);

  // Cálculo de Deltas e Exposição
  const stockDelta = 1.0;
  const putDelta = putQuote ? putQuote.delta : 0.0; // Delta negativo ou 0 se desmontado
  const callDelta = callQuote ? callQuote.delta : 0.0; // Delta positivo
  
  // Delta líquido do Collar por ação
  const netDeltaPerShare = isHedgeActive 
    ? (stockDelta + putDelta - callDelta) 
    : 1.0;
    
  const totalNetDelta = netDeltaPerShare * qty;
  const hedgeRatio = (1 - netDeltaPerShare) * 100; // Porcentagem do risco mitigada pelo hedge

  // Preço corrente real (não simulado)
  const livePrice = liveQuotes?.underlyingPrice || currentClose;
  const distToKama = ((livePrice - currentKAMA) / currentKAMA) * 100;

  // Cálculo de Skew do Smile (Put IV - Call IV)
  const smileSkew = ((putQuote?.iv || 0.247) - (callQuote ? callQuote.iv : 0.213)) * 100;

  // Cálculo do PnL Real-Time Atual (preços marcados a mercado e realizados)
  let currentPutPL = 0;
  if (putTicker) {
    if (putQty > 0) {
      const currentPutVal = putQuote ? (putQuote.price * putQty) : 0.0;
      const initialPutVal = putCost * putQty;
      currentPutPL = currentPutVal - initialPutVal;
    } else if (custodyPutItem && custodyPutItem.averageCost > 0) {
      currentPutPL = (custodyPutItem.averageCost - putCost) * qty;
    }
  }

  let currentCallPL = 0;
  if (callTicker) {
    if (callQty > 0) {
      const currentCallVal = callQuote ? (callQuote.price * callQty) : 0.0;
      const initialCallVal = callIncome * callQty;
      currentCallPL = initialCallVal - currentCallVal;
    } else if (custodyCallItem && custodyCallItem.averageCost > 0) {
      currentCallPL = (callIncome - custodyCallItem.averageCost) * qty;
    }
  }
  
  const currentStockPL = (simulatedPrice - entryPrice) * qty;

  // Preços e Resultados Real-Time baseados no preço atual real (não simulado)
  const liveStockPL = (livePrice - entryPrice) * qty;
  const liveTotalPL = liveStockPL + currentPutPL + currentCallPL;
  const liveReturnPercent = (liveTotalPL / (entryPrice * qty)) * 100;
  const liveStockReturnPercent = (liveStockPL / (entryPrice * qty)) * 100;

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
  const skewSuperficie = liveQuotes?.skew !== undefined && liveQuotes?.skew !== null
    ? liveQuotes.skew
    : (liveQuotes?.put_375 && liveQuotes?.call_131
      ? (liveQuotes.put_375.iv - liveQuotes.call_131.iv) * 100
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
  let signalColorClass = "border-zinc-200 bg-zinc-50 text-zinc-900 bg-zinc-900";
  let signalAction = "Manter Estrutura Atual";
  let orderLegs: OrderLeg[] = [];
  let signalNote = "";

  // Verifica se há cruzamento pendente no preço live vs KAMA
  const isCrossoverAbove = currentRegime === "B" && livePrice > currentKAMA;
  const isCrossoverBelow = currentRegime === "A" && livePrice < currentKAMA;

  if (isCrossoverAbove) {
    signalTitle = "TRANSIÇÃO: ALTA (REGIME A)";
    signalColorClass = "border-zinc-200 bg-zinc-50 text-zinc-900 bg-zinc-900";
    signalAction = "Desmontar Put + Rolar Call para OTM";
    signalNote = "Cruzamento UP — Preço R$ " + livePrice.toFixed(2) + " ultrapassou KAMA R$ " + currentKAMA.toFixed(2);

    const targetCallTicker = liveQuotes?.call_06?.ticker || "BBDCG200";
    const targetCallStrike = liveQuotes?.call_06?.strike || 20.00;

    if (putTicker && putStrike) {
      orderLegs.push({
        action: "VENDA",
        ticker: putTicker,
        qty: qty,
        strike: putStrike,
        nature: "Desmontar Put (Zerar Proteção)",
        color: "red"
      });
    }
    if (callTicker && callStrike) {
      orderLegs.push({
        action: "COMPRA",
        ticker: callTicker,
        qty: qty,
        strike: callStrike,
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
    signalColorClass = "border-zinc-200 bg-zinc-50 text-zinc-900 bg-zinc-900";
    signalAction = "Montar Put ATM + Rolar Call para ATM";
    signalNote = "Cruzamento DOWN — Preço R$ " + livePrice.toFixed(2) + " caiu abaixo da KAMA R$ " + currentKAMA.toFixed(2);

    const targetPutTicker = liveQuotes?.put_50?.ticker || "BBDCS175";
    const targetPutStrike = liveQuotes?.put_50?.strike || parseFloat(livePrice.toFixed(0)) + 0.00;
    const targetCallTicker = liveQuotes?.call_50?.ticker || "BBDCG175";
    const targetCallStrike = liveQuotes?.call_50?.strike || parseFloat(livePrice.toFixed(0)) + 0.00;

    orderLegs.push({
      action: "COMPRA",
      ticker: targetPutTicker,
      qty: qty,
      strike: targetPutStrike,
      nature: "Comprar Put ATM nova (Δ ≈ -0.50)",
      color: "green"
    });
    if (callTicker && callStrike) {
      orderLegs.push({
        action: "COMPRA",
        ticker: callTicker,
        qty: qty,
        strike: callStrike,
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
      signalColorClass = "border-zinc-200 bg-zinc-50 text-zinc-900 bg-zinc-900";
      signalAction = "Nenhuma Ordem Necessária";
      signalNote = "Preço (R$ " + livePrice.toFixed(2) + ") acima da KAMA (R$ " + currentKAMA.toFixed(2) + "). Exposição direcional máxima.";
    } else {
      signalTitle = "REGIME B — HEDGE ATIVO";
      signalColorClass = "border-zinc-200 bg-zinc-50 text-zinc-900 bg-zinc-900";
      signalAction = "Nenhuma Ordem Necessária";
      signalNote = "Preço (R$ " + livePrice.toFixed(2) + ") abaixo da KAMA (R$ " + currentKAMA.toFixed(2) + "). Caixa sintético preservado.";
    }
  }

  // Calculadora de Cenários
  const calculateScenario = (price: number) => {
    const stockPL = (price - entryPrice) * qty;
    
    // Put PL
    let putPL = 0;
    if (putTicker) {
      if (putQty > 0) {
        putPL = (Math.max(0, (putStrike || 0) - price) - putCost) * putQty;
      } else if (custodyPutItem && custodyPutItem.averageCost > 0) {
        putPL = (custodyPutItem.averageCost - putCost) * qty;
      }
    }

    // Call PL
    let callPL = 0;
    if (callTicker) {
      if (callQty > 0) {
        callPL = (callIncome - Math.max(0, price - (callStrike || 0))) * callQty;
      } else if (custodyCallItem && custodyCallItem.averageCost > 0) {
        callPL = (callIncome - custodyCallItem.averageCost) * qty;
      }
    }

    const optionsPL = putPL + callPL;
    const totalPL = stockPL + optionsPL;
    
    const stockVal = price * qty;
    const optionsVal = (
      (putTicker && putQty > 0 ? Math.max(0, (putStrike || 0) - price) : 0.0) - 
      (callTicker && callQty > 0 ? Math.max(0, price - (callStrike || 0)) : 0.0)
    ) * qty;
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
    ...(putStrike ? [putStrike] : []),
    livePrice,
    entryPrice,
    18.50,
    ...(callStrike ? [callStrike] : []),
    20.00,
    21.00
  ])).sort((a, b) => a - b);

  const getStatusBadge = () => {
    if (putStrike && simulatedPrice <= putStrike) {
      return (
        <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
          <ShieldCheck className="h-3 w-3 mr-1.5" /> Proteção Ativada (Loss Limitado)
        </span>
      );
    } else if (callStrike && simulatedPrice >= callStrike) {
      return (
        <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
          <AlertTriangle className="h-3 w-3 mr-1.5" /> Lucro Máximo Atingido (Cap)
        </span>
      );
    } else {
      return (
        <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-zinc-50 text-zinc-700 border border-zinc-200 font-mono">
          <ArrowRightLeft className="h-3 w-3 mr-1.5 text-zinc-500" /> {putTicker ? "Flutuação Livre (Zona Collar)" : "Exposição Direcional (Sem Put)"}
        </span>
      );
    }
  };

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900 font-sans antialiased selection:bg-zinc-200">
      
      {/* Tab Selector */}
      <div className="bg-white border-b border-zinc-200 text-zinc-900 sticky top-0 z-50 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex space-x-8 h-14 items-center">
            <button
              onClick={() => setActiveTab("bbdc4")}
              className={`text-xs font-bold uppercase tracking-wider h-full border-b-2 px-1 transition-all cursor-pointer ${
                activeTab === "bbdc4"
                  ? "border-zinc-900 text-zinc-950"
                  : "border-transparent text-zinc-400 hover:text-zinc-600"
              }`}
            >
              BBDC4 Collar
            </button>
            <button
              onClick={() => setActiveTab("win")}
              className={`text-xs font-bold uppercase tracking-wider h-full border-b-2 px-1 transition-all cursor-pointer ${
                activeTab === "win"
                  ? "border-zinc-900 text-zinc-950"
                  : "border-transparent text-zinc-400 hover:text-zinc-600"
              }`}
            >
              LONG/SHORT WIN
            </button>
          </div>
        </div>
      </div>

      {activeTab === "win" ? (
        <div className="animate-in fade-in duration-300">
          <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8 pb-6 border-b border-zinc-200">
              <div>
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider bg-zinc-100 text-zinc-600 border border-zinc-200">
                    Quantitative Trend Following
                  </span>
                  <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-zinc-50 text-zinc-700 border border-zinc-200">
                    Monitor Operacional Futuro (WIN)
                  </span>
                </div>
                <h1 className="text-3xl font-extrabold tracking-tight text-zinc-900">
                  Trend Following: <span className="text-zinc-950">LONG/SHORT WIN</span>
                </h1>
              </div>
              
              <div className="flex flex-col md:text-right font-mono">
                <span className="text-xs text-zinc-400 font-sans">Série Ativa ({liveWinTicker})</span>
                <span className="text-sm font-semibold text-zinc-700">
                  {liveWinPrice ? `${liveWinPrice.toLocaleString("pt-BR")} pts` : "Carregando..."}
                </span>
              </div>
            </header>
            <LongShortWin
              initialState={winIndicators || { 
                close_price: 120000, 
                kama: 119500, 
                atr: 1500, 
                high: 120500, 
                low: 119000,
                bollinger_upper: 122500,
                bollinger_lower: 116500,
                connors_rsi: 50,
                kalman_price: 120000,
                kalman_trend: "UP"
              }}
              livePriceFromClear={liveWinPrice}
            />
          </main>
        </div>
      ) : (
        <>
          {/* Container Principal */}
          <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        
        {/* Header */}
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8 pb-6 border-b border-zinc-200">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider bg-zinc-100 text-zinc-600 border border-zinc-200">
                Quantitative Portfolio
              </span>
              {getStatusBadge()}
            </div>
            <h1 className="text-3xl font-extrabold tracking-tight text-zinc-900">
              Monitor de Hedge: <span className="text-zinc-950">BBDC4 Collar</span>
            </h1>
          </div>
          
          <div className="flex flex-col md:text-right">
            <span className="text-xs text-zinc-400">Operação Iniciada em</span>
            <span className="text-sm font-semibold text-zinc-700">
              {new Date(state.activation_date).toLocaleDateString("pt-BR")}
            </span>
          </div>
        </header>        {/* Dashboard Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          
          {/* Card: Detalhes da Operação */}
          <div className="bg-white border border-zinc-200 rounded-lg p-6 shadow-xs">
            <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-2 mb-4 font-mono">
              <Layers className="h-4 w-4 text-zinc-500" /> DETALHES DA ESTRUTURA
            </h3>
            
            <div className="space-y-4">
              <div className="flex justify-between items-center py-2 border-b border-zinc-100">
                <span className="text-zinc-500 text-sm">Ações BBDC4</span>
                <span className="font-mono text-sm font-semibold text-zinc-900 flex flex-col items-end">
                  <span>{qty.toLocaleString("pt-BR")} Qtd @ R$ {entryPrice.toFixed(2)}</span>
                  {liveQuotes?.underlyingPrice && (
                    <span className="text-[10px] font-normal text-zinc-500">
                      Mkt: R$ {liveQuotes.underlyingPrice.toFixed(2)}
                    </span>
                  )}
                </span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-zinc-100">
                <span className="text-zinc-500 text-sm">Put Long (Proteção)</span>
                <span className="font-mono text-sm font-semibold text-emerald-600 flex flex-col items-end">
                  <span>{putTicker ? `${putTicker} (K: R$ ${putStrike?.toFixed(2)})` : "DESMONTADA"}</span>
                  {putQuote?.price ? (
                    <span className="text-[10px] font-normal text-zinc-500">
                      Mkt: R$ {putQuote.price.toFixed(2)}
                    </span>
                  ) : null}
                </span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-zinc-100">
                <span className="text-zinc-500 text-sm">Call Short (Financ.)</span>
                <span className="font-mono text-sm font-semibold text-zinc-800 flex flex-col items-end">
                  <span>{callTicker ? `${callTicker} (K: R$ ${callStrike?.toFixed(2)})` : "NENHUMA"}</span>
                  {callQuote?.price ? (
                    <span className="text-[10px] font-normal text-zinc-500">
                      Mkt: R$ {callQuote.price.toFixed(2)}
                    </span>
                  ) : null}
                </span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-zinc-100">
                <span className="text-zinc-500 text-sm">Prêmio da Put Pago</span>
                <span className="font-mono text-sm font-semibold text-zinc-700">
                  {putTicker 
                    ? `R$ ${putCost.toFixed(2)} (- R$ ${Math.round(putCost * qty)})` 
                    : "R$ 0,00"}
                </span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-zinc-100">
                <span className="text-zinc-500 text-sm">Prêmio da Call Recebido</span>
                <span className="font-mono text-sm font-semibold text-zinc-700">
                  {callTicker 
                    ? `R$ ${callIncome.toFixed(2)} (+ R$ ${Math.round(callIncome * qty)})` 
                    : "R$ 0,00"}
                </span>
              </div>
              <div className="flex justify-between items-center pt-2">
                <span className="text-zinc-500 text-sm">Custo Líquido do Hedge</span>
                <span className="font-mono text-sm font-bold text-zinc-900">R$ {netCost.toFixed(2)} (- R$ {Math.round(netCost * qty)})</span>
              </div>
            </div>
          </div>

          {/* Card: Simulador Interativo */}
          <div className="bg-white border border-zinc-200 rounded-lg p-6 shadow-xs">
            <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-2 mb-4 font-mono">
              <RefreshCw className="h-4 w-4 text-zinc-500" /> SIMULADOR DE CENÁRIOS
            </h3>
            
            <div className="flex flex-col h-full justify-between pb-2">
              <div className="space-y-4">
                <div className="flex justify-between items-baseline">
                  <span className="text-zinc-500 text-sm">Preço Simulado de BBDC4</span>
                  <span className="text-2xl font-black text-zinc-900 tracking-tight font-mono">R$ {simulatedPrice.toFixed(2)}</span>
                </div>
                
                {/* Input Slider */}
                <input 
                  type="range" 
                  min="14.50" 
                  max="21.50" 
                  step="0.05"
                  value={simulatedPrice} 
                  onChange={(e) => setSimulatedPrice(parseFloat(e.target.value))}
                  className="w-full h-1.5 bg-zinc-200 rounded-lg appearance-none cursor-pointer accent-zinc-800 focus:outline-none"
                />
                
                <div className="flex justify-between text-[10px] text-zinc-400 font-mono">
                  <span>MÍN: R$ 14,50</span>
                  <span className="text-zinc-650 font-bold">ENTRADA: R$ 17,80</span>
                  <span>MÁX: R$ 21,50</span>
                </div>
              </div>

              <div className="mt-6 p-4 rounded-lg bg-zinc-50 border border-zinc-100 space-y-3">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-zinc-500 font-medium">Valor Total da Carteira</span>
                  <span className="font-bold text-zinc-700 font-mono">R$ {currentMetrics.totalVal.toLocaleString("pt-BR", {minimumFractionDigits: 2})}</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-zinc-400 font-medium">Valor das Ações Puras</span>
                  <span className="font-semibold text-zinc-500 font-mono">R$ {currentMetrics.stockVal.toLocaleString("pt-BR", {minimumFractionDigits: 2})}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Card: PnL Consolidado */}
          <div className="bg-white border border-zinc-200 rounded-lg p-6 shadow-xs">
            <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-2 mb-4 font-mono">
              <DollarSign className="h-4 w-4 text-zinc-500" /> LUCRO / PREJUÍZO ATUAL
            </h3>
            
            <div className="space-y-6">
              <div>
                <span className="text-zinc-500 text-sm">Resultado Líquido do Collar</span>
                <div className={`text-3xl font-black tracking-tight mt-1 flex items-baseline gap-2 font-mono ${liveTotalPL >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                  {liveTotalPL >= 0 ? "+" : ""}R$ {liveTotalPL.toLocaleString("pt-BR", {maximumFractionDigits: 0})}
                  <span className="text-xs font-bold">({liveReturnPercent >= 0 ? "+" : ""}{liveReturnPercent.toFixed(2)}%)</span>
                </div>
              </div>

              <div className="p-4 rounded-lg bg-zinc-50 border border-zinc-100 space-y-3">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-zinc-500 font-medium">Resultado Sem Hedge (Long)</span>
                  <span className={`font-semibold font-mono ${liveStockPL >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                    {liveStockPL >= 0 ? "+" : ""}R$ {liveStockPL.toLocaleString("pt-BR", {maximumFractionDigits: 0})} ({liveStockReturnPercent >= 0 ? "+" : ""}{liveStockReturnPercent.toFixed(2)}%)
                  </span>
                </div>
                
                <div className="flex justify-between items-center text-xs pt-2 border-t border-zinc-200">
                  <span className="text-zinc-500 font-medium">Assimetria Gerada pelo Collar</span>
                  <span className={`font-bold font-mono ${liveTotalPL - liveStockPL >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                    {liveTotalPL - liveStockPL >= 0 ? "+" : ""}R$ {Math.round(liveTotalPL - liveStockPL).toLocaleString("pt-BR")}
                  </span>
                </div>
              </div>
            </div>
          </div>

        </div>

        {/* Custódia Real-Time (Clear API) */}
        {liveCustody && liveCustody.length > 0 && (
          <section className="bg-white border border-zinc-200 rounded-lg p-6 shadow-xs mb-8">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-zinc-100">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-zinc-500" />
                <div>
                  <h2 className="text-sm font-bold text-zinc-900 uppercase tracking-wider font-mono">Posição Integrada Clear API</h2>
                  <p className="text-xs text-zinc-400">Custódia detectada em tempo real diretamente na corretora Clear</p>
                </div>
              </div>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold font-mono bg-zinc-100 text-zinc-650 border border-zinc-200">
                SINCRO CORRETORA
              </span>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {liveCustody
                .filter((item: any) => item.availableQuantity > 0 || item.collateralBlockedQuantity > 0 || item.ticker === "BBDC4" || item.ticker === "BBDCS2" || item.ticker === "BBDCG194")
                .map((item: any, idx: number) => (
                  <div key={idx} className="p-4 rounded-lg bg-zinc-50 border border-zinc-200 font-mono flex flex-col justify-between">
                    <div>
                      <span className="text-[10px] uppercase font-bold text-zinc-400">{item.module || "Custódia"}</span>
                      <div className="text-lg font-bold text-zinc-950 mt-1">{item.ticker}</div>
                    </div>
                    <div className="mt-4 space-y-1">
                      <div className="flex justify-between text-xs text-zinc-600">
                        <span>Quantidade:</span>
                        <span className="font-bold text-zinc-900">{item.availableQuantity + item.collateralBlockedQuantity}</span>
                      </div>
                      <div className="flex justify-between text-xs text-zinc-600">
                        <span>Preço Médio:</span>
                        <span className="text-zinc-700">R$ {item.averageCost?.toFixed(2)}</span>
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          </section>
        )}

        {/* Monitor Quantitativo de Sinais */}
        <section className="bg-white border border-zinc-200 rounded-lg p-6 shadow-xs mb-8">
          <div className="flex items-center gap-2 mb-6 pb-4 border-b border-zinc-100">
            <Cpu className="h-4 w-4 text-zinc-500" />
            <div>
              <h2 className="text-sm font-bold text-zinc-900 uppercase tracking-wider font-mono">Quant Decision Engine (Monitor KAMA & Fatores)</h2>
              <p className="text-xs text-zinc-400">Algoritmo de tomada de decisão para regimes de travas de hedge e crossovers adaptativos</p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* Coluna 1: Stance do Modelo */}
            <div className="flex flex-col justify-between p-5 rounded-lg border border-zinc-200 bg-zinc-50 relative overflow-hidden">
              <div>
                <span className="text-[10px] uppercase font-bold text-zinc-400 tracking-wider font-mono">Diretriz do Modelo</span>
                <div className="text-lg font-bold text-zinc-900 mt-2 mb-3 tracking-tight flex items-center gap-2 font-mono">
                  <Radio className={`h-4 w-4 ${currentRegime === "A" ? "text-emerald-600" : "text-zinc-650"}`} />
                  {currentRegime === "A" ? "REGIME A: ALTA / ALFA" : "REGIME B: PROTEÇÃO / CAIXA"}
                </div>
                <p className="text-xs text-zinc-500 leading-relaxed">
                  {currentRegime === "A" 
                    ? `Preço de BBDC4 (R$ ${livePrice.toFixed(2)}) acima da KAMA (R$ ${currentKAMA.toFixed(2)}). O robô está em modo de maximização de alfa. Put desmontada (Proteção zerada) e Call curta rolada OTM para permitir participação na alta.`
                    : `Preço de BBDC4 (R$ ${livePrice.toFixed(2)}) abaixo da KAMA (R$ ${currentKAMA.toFixed(2)}). O robô está em modo de preservação de capital. Put ATM ativa (Delta ~-0.50) e Call vendida ATM para travar a carteira em Cash Sintético.`
                  }
                </p>
              </div>
              <div className="mt-4 pt-4 border-t border-zinc-200 flex justify-between items-center text-[10px] text-zinc-400 font-mono">
                <span>Cálculo: Diário (Pós-Fechamento)</span>
                <span>Data: {latestMetric.data}</span>
              </div>
            </div>

            {/* Coluna 2: Fatores de Risco */}
            <div className="space-y-4 p-5 rounded-lg border border-zinc-200 bg-white">
              <span className="text-[10px] uppercase font-bold text-zinc-400 tracking-wider flex items-center gap-1.5 font-mono">
                <Activity className="h-3.5 w-3.5 text-zinc-400" /> Fatores Quantitativos (KAMA + AQR Style)
              </span>
              
              <div className="space-y-3 mt-2">
                <div className="flex justify-between items-center py-1.5 border-b border-zinc-50">
                  <span className="text-xs text-zinc-500">Média Adaptativa KAMA</span>
                  <span className="font-mono text-xs font-bold text-zinc-700">
                    R$ {currentKAMA.toFixed(2)}
                  </span>
                </div>

                <div className="flex justify-between items-center py-1.5 border-b border-zinc-50">
                  <span className="text-xs text-zinc-500">Afastamento da KAMA</span>
                  <span className={`font-mono text-xs font-bold ${distToKama > 0 ? "text-emerald-600" : "text-rose-600"}`}>
                    {distToKama > 0 ? "+" : ""}{distToKama.toFixed(2)}%
                  </span>
                </div>

                <div className="flex justify-between items-center py-1.5 border-b border-zinc-50">
                  <div className="flex items-center gap-1.5 text-xs text-zinc-500">
                    {currentTSMOM < 0 ? <TrendingDown className="h-3.5 w-3.5 text-rose-500" /> : <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />}
                    Momentum Composto (TSMOM)
                  </div>
                  <span className={`font-mono text-xs font-bold ${currentTSMOM < 0 ? "text-rose-600" : "text-emerald-600"}`}>
                    {currentTSMOM.toFixed(4)}
                  </span>
                </div>

                <div className="flex justify-between items-center py-1.5 border-b border-zinc-50">
                  <span className="text-xs text-zinc-500">Volatilidade Histórica (HV 20d)</span>
                  <span className="font-mono text-xs font-bold text-zinc-700">
                    {(currentHV * 100).toFixed(2)}%
                  </span>
                </div>

                <div className="flex justify-between items-center py-1.5 border-b border-zinc-50">
                  <span className="text-xs text-zinc-500">Z-Score de Vol. (Regime)</span>
                  <span className={`font-mono text-xs font-bold ${currentZScore > 0 ? "text-zinc-600" : "text-zinc-450"}`}>
                    {currentZScore > 0 ? "+" : ""}{currentZScore.toFixed(2)}
                  </span>
                </div>

                <div className="flex justify-between items-center py-1.5">
                  <span className="text-xs text-zinc-500">Vol. Risk Premium (VRP Puts)</span>
                  <span className={`font-mono text-xs font-bold ${currentVRP < 0 ? "text-emerald-600" : "text-rose-600"}`}>
                    {currentVRP > 0 ? "+" : ""}{(currentVRP * 100).toFixed(2)}%
                  </span>
                </div>
              </div>
            </div>

            {/* Coluna 3: Gatilhos e Status */}
            <div className="p-5 rounded-lg border border-zinc-200 bg-white space-y-4">
              <span className="text-[10px] uppercase font-bold text-zinc-400 tracking-wider font-mono">
                Status dos Gatilhos Operacionais
              </span>

              <div className="space-y-3.5 mt-2">
                <div>
                  <span className="text-[10px] text-zinc-400 font-semibold block mb-1 font-mono">GATILHOS KAMA</span>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-zinc-500">Tendência de Alta (Preço &gt; KAMA)</span>
                      <span className={`flex items-center gap-1 font-semibold ${livePrice > currentKAMA ? "text-emerald-600" : "text-zinc-400"}`}>
                        {livePrice > currentKAMA ? "Ativo (Regime A)" : "Inativo"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-zinc-500">Tendência de Baixa (Preço &lt; KAMA)</span>
                      <span className={`flex items-center gap-1 font-semibold ${livePrice < currentKAMA ? "text-rose-600" : "text-zinc-400"}`}>
                        {livePrice < currentKAMA ? "Ativo (Regime B)" : "Inativo"}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="pt-2 border-t border-zinc-100">
                  <span className="text-[10px] text-zinc-400 font-semibold block mb-1 font-mono">FATORES ADICIONAIS</span>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-zinc-500">Reversão de Momentum (TSMOM &gt; 0)</span>
                      <span className={`flex items-center gap-1 font-semibold ${currentTSMOM > 0 ? "text-emerald-600" : "text-zinc-400"}`}>
                        {currentTSMOM > 0 ? "Ativo" : "Inativo"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-zinc-500">Vol Crush (IV Percentil &gt; 95%)</span>
                      <span className="flex items-center gap-1 font-semibold text-zinc-400">
                        Inativo
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

          </div>
        </section>

        {/* Monitor Real-Time de Volatilidade, Skew & Gregas */}
        <section className="bg-white border border-zinc-200 rounded-lg p-6 shadow-xs mb-8">
          <div className="flex items-center gap-2 mb-6 pb-4 border-b border-zinc-100">
            <Scale className="h-4 w-4 text-zinc-500" />
            <div>
              <h2 className="text-sm font-bold text-zinc-900 uppercase tracking-wider font-mono">Monitor Analítico & Sinais de Ajuste Collar (Cotação B3)</h2>
              <p className="text-xs text-zinc-400">Acompanhamento atômico dos limites operacionais de Skew da Superfície, Z-Score de IV e Delta Líquido com recomendações de compra/venda</p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* Tabela de Parâmetros Operacionais (ocupa 2 colunas) */}
            <div className="lg:col-span-2 border border-zinc-200 rounded-lg overflow-hidden bg-white shadow-xs flex flex-col justify-between">
              <div className="p-4 bg-zinc-50 border-b border-zinc-200">
                <span className="text-[10px] uppercase font-bold text-zinc-500 font-mono">Parâmetros Quantitativos de Cobertura</span>
              </div>
              <div className="overflow-x-auto flex-1">
                <table className="w-full text-sm text-left text-zinc-500">
                  <thead className="text-[10px] uppercase tracking-wider text-zinc-400 bg-zinc-50 border-b border-zinc-200">
                    <tr>
                      <th scope="col" className="px-5 py-3 font-bold">Indicador</th>
                      <th scope="col" className="px-5 py-3 font-bold">Valor Atual</th>
                      <th scope="col" className="px-5 py-3 font-bold">Alerta de Ajuste</th>
                      <th scope="col" className="px-5 py-3 font-bold">Ação Esperada</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 font-sans">
                    
                    {/* Linha KAMA */}
                    <tr className="hover:bg-zinc-50">
                      <td className="px-5 py-4">
                        <div className="font-semibold text-zinc-900 text-xs uppercase tracking-wider font-mono">Média Adaptativa KAMA</div>
                        <div className="text-[10px] text-zinc-400">Média adaptativa de Kaufman (n=10) como rastreador de tendência</div>
                      </td>
                      <td className="px-5 py-4 font-mono font-bold text-zinc-950">
                        <span className={`px-2 py-0.5 rounded text-xs ${currentRegime === "A" ? "bg-emerald-50 text-emerald-700 font-extrabold" : "bg-rose-50 text-rose-700 font-extrabold"}`}>
                          R$ {currentKAMA.toFixed(2)} ({distToKama > 0 ? "+" : ""}{distToKama.toFixed(2)}%)
                        </span>
                      </td>
                      <td className="px-5 py-4 font-semibold text-zinc-700 font-mono text-xs">
                        Cruzamento Preço vs KAMA
                      </td>
                      <td className="px-5 py-4 text-xs text-zinc-650">
                        Alterna regimes de travas de proteção (Alfa vs Capital)
                      </td>
                    </tr>

                    {/* Linha Skew */}
                    <tr className="hover:bg-zinc-50">
                      <td className="px-5 py-4">
                        <div className="font-semibold text-zinc-900 text-xs uppercase tracking-wider font-mono">Skew da Superfície</div>
                        <div className="text-[10px] text-zinc-400">Diferença de IV entre Delta -0.375 e 0.131</div>
                      </td>
                      <td className="px-5 py-4 font-mono font-bold text-zinc-950">
                        <span className={`px-2 py-0.5 rounded text-xs ${skewSuperficie > 5.0 ? "bg-zinc-100 text-zinc-800" : "bg-zinc-50 text-zinc-600"}`}>
                          {skewSuperficie.toFixed(2)}%
                        </span>
                      </td>
                      <td className="px-5 py-4 font-semibold text-zinc-700 font-mono text-xs">
                        &gt; +5.0%
                      </td>
                      <td className="px-5 py-4 text-xs text-zinc-650">
                        Rolling Down da Put (Ganha crédito no pânico)
                      </td>
                    </tr>

                    {/* Linha Z-Score IV */}
                    <tr className="hover:bg-zinc-50">
                      <td className="px-5 py-4">
                        <div className="font-semibold text-zinc-900 text-xs uppercase tracking-wider font-mono">Z-Score de IV (20d)</div>
                        <div className="text-[10px] text-zinc-400">Afastamento da Vol. Implícita das puts da média histórica</div>
                      </td>
                      <td className="px-5 py-4 font-mono font-bold text-zinc-950">
                        <span className={`px-2 py-0.5 rounded text-xs ${ivZScore < -1.0 ? "bg-rose-50 text-rose-700 font-extrabold font-mono" : "bg-zinc-50 text-zinc-600 font-mono"}`}>
                          {ivZScore.toFixed(2)}
                        </span>
                      </td>
                      <td className="px-5 py-4 font-semibold text-zinc-700 font-mono text-xs">
                        &lt; -1.0
                      </td>
                      <td className="px-5 py-4 text-xs text-zinc-650">
                        Desmontar Put (Evita perda por Vol Crush)
                      </td>
                    </tr>

                    {/* Linha Delta Líquido */}
                    <tr className="hover:bg-zinc-50">
                      <td className="px-5 py-4">
                        <div className="font-semibold text-zinc-900 text-xs uppercase tracking-wider font-mono">Delta Líquido (&Delta;<sub>net</sub>)</div>
                        <div className="text-[10px] text-zinc-400">Risco direcional consolidado da carteira collar</div>
                      </td>
                      <td className="px-5 py-4 font-mono font-bold text-zinc-950">
                        <span className={`px-2 py-0.5 rounded text-xs ${(netDeltaPerShare < 0.35 || netDeltaPerShare > 0.65) ? "bg-amber-50 text-amber-700 font-extrabold font-mono" : "bg-zinc-50 text-zinc-600 font-mono"}`}>
                          {netDeltaPerShare.toFixed(3)}
                        </span>
                      </td>
                      <td className="px-5 py-4 font-semibold text-zinc-700 font-mono text-xs">
                        &lt; 0.35 ou &gt; 0.65
                      </td>
                      <td className="px-5 py-4 text-xs text-zinc-650">
                        Ajustar Strikes (Rebalanceamento do Hedge Direcional)
                      </td>
                    </tr>

                  </tbody>
                </table>
              </div>
              <div className="p-3 bg-zinc-50 border-t border-zinc-100 text-[10px] text-zinc-400 leading-relaxed text-center font-mono">
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
                  <span className="flex items-center gap-1 font-semibold text-emerald-600 font-mono text-[9px]">
                    <span className={`w-1.5 h-1.5 rounded-full ${isFetchingQuotes ? "bg-amber-500 animate-pulse" : "bg-emerald-500 animate-ping"}`} />
                    {isFetchingQuotes ? "ATUALIZANDO..." : "B3 LIVE"}
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
                  {putStrike && (
                    <ReferenceLine 
                      x={putStrike} 
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
                  {callStrike && (
                    <ReferenceLine 
                      x={callStrike} 
                      stroke="#f59e0b" 
                      strokeDasharray="3 3"
                      label={{ value: "Teto (Call K)", fill: "#b45309", position: "top", fontSize: 10, fontWeight: "bold" }} 
                    />
                  )}

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
        <section className="bg-white border border-zinc-200 rounded-lg p-6 shadow-xs">
          <div className="mb-6">
            <h2 className="text-sm font-bold text-zinc-900 uppercase tracking-wider font-mono">Grade Completa de Cenários no Vencimento</h2>
            <p className="text-xs text-zinc-400">Mapeamento matemático dos retornos e valores das opções para diferentes preços de vencimento</p>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left text-zinc-500">
              <thead className="text-[10px] uppercase tracking-wider text-zinc-400 bg-zinc-50 border-b border-zinc-200">
                <tr>
                  <th scope="col" className="px-6 py-4 font-bold">Preço do Ativo</th>
                  <th scope="col" className="px-6 py-4 font-bold">Valor das Ações</th>
                  <th scope="col" className="px-6 py-4 font-bold text-zinc-900">Valor com Hedge</th>
                  <th scope="col" className="px-6 py-4 font-bold text-zinc-650">Resultado Ação Pura</th>
                  <th scope="col" className="px-6 py-4 font-bold text-emerald-600">PnL da PUT</th>
                  <th scope="col" className="px-6 py-4 font-bold text-rose-600">PnL da CALL</th>
                  <th scope="col" className="px-6 py-4 font-bold">Custo do Hedge</th>
                  <th scope="col" className="px-6 py-4 font-bold text-zinc-900">Retorno Líquido Collar</th>
                  <th scope="col" className="px-6 py-4 font-bold">Resultado (%)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-150">
                {fixedScenarios.map((price, idx) => {
                  const s = calculateScenario(price);
                  const isCurrent = Math.abs(simulatedPrice - price) < 0.05;
                  const isPutStrike = price === putStrike;
                  const isCallStrike = price === callStrike;
                  const isEntry = price === entryPrice;

                  let rowBgClass = "hover:bg-zinc-50/50";
                  
                  if (isCurrent) {
                    rowBgClass = "bg-zinc-100 hover:bg-zinc-200/80 border-l-2 border-zinc-900 text-zinc-950 font-semibold";
                  } else if (isPutStrike) {
                    rowBgClass = "bg-zinc-50 hover:bg-zinc-100 border-l-2 border-zinc-500 text-zinc-800";
                  } else if (isCallStrike) {
                    rowBgClass = "bg-zinc-50 hover:bg-zinc-100 border-l-2 border-zinc-500 text-zinc-800";
                  } else if (isEntry) {
                    rowBgClass = "bg-zinc-50 hover:bg-zinc-100 border-l-2 border-zinc-500 text-zinc-800";
                  }

                  return (
                    <tr key={idx} className={`transition-colors duration-150 ${rowBgClass}`}>
                      <td className="px-6 py-4 font-mono font-bold text-zinc-900">
                        R$ {price.toFixed(2)}
                        {isCurrent && <span className="ml-2 px-1.5 py-0.5 rounded text-[9px] uppercase font-bold tracking-wider bg-zinc-200 text-zinc-700">Simulado</span>}
                        {isPutStrike && <span className="ml-2 px-1.5 py-0.5 rounded text-[9px] uppercase font-bold tracking-wider bg-zinc-100 text-zinc-650">Put Strike</span>}
                        {isCallStrike && <span className="ml-2 px-1.5 py-0.5 rounded text-[9px] uppercase font-bold tracking-wider bg-zinc-100 text-zinc-650">Call Strike</span>}
                        {isEntry && <span className="ml-2 px-1.5 py-0.5 rounded text-[9px] uppercase font-bold tracking-wider bg-zinc-100 text-zinc-650">Entrada</span>}
                      </td>
                      <td className="px-6 py-4 font-mono">
                        R$ {s.stockVal.toLocaleString("pt-BR", {minimumFractionDigits: 2})}
                      </td>
                      <td className="px-6 py-4 font-mono font-semibold text-zinc-800">
                        R$ {s.totalVal.toLocaleString("pt-BR", {minimumFractionDigits: 2})}
                      </td>
                      <td className={`px-6 py-4 font-mono font-semibold ${s.stockPL >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                        {s.stockPL >= 0 ? "+" : ""}R$ {Math.round(s.stockPL).toLocaleString("pt-BR")} ({s.unhedgedReturnPercent >= 0 ? "+" : ""}{s.unhedgedReturnPercent.toFixed(2)}%)
                      </td>
                      <td className={`px-6 py-4 font-mono font-medium ${s.putPL >= 0 ? "text-emerald-600" : "text-zinc-400"}`}>
                        {s.putPL >= 0 ? "+" : ""}R$ {Math.round(s.putPL).toLocaleString("pt-BR")}
                      </td>
                      <td className={`px-6 py-4 font-mono font-medium ${s.callPL >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                        {s.callPL >= 0 ? "+" : ""}R$ {Math.round(s.callPL).toLocaleString("pt-BR")}
                      </td>
                      <td className="px-6 py-4 font-mono text-zinc-400">
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
        </>
      )}
      
      {/* Footer */}
      <footer className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 text-center text-xs text-zinc-400 border-t border-zinc-200 mt-12 font-mono">
        <p>© 2026 Hedge Fund Quant Platform. Executado em modo Informativo / Read-Only.</p>
      </footer>
    </div>
  );
}
