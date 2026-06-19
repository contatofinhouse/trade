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

     const positionItems = [];
  
  // 1. Stock BBDC4
  positionItems.push({
    ticker: "BBDC4",
    type: "Ação",
    qty: qty,
    avgPrice: entryPrice,
    mktPrice: livePrice,
    pnl: liveStockPL,
    pnlPercent: liveStockReturnPercent
  });

  // 2. Put Option BBDCS2
  if (putTicker) {
    const putMktPrice = putQuote?.price || 0;
    const putPL = putQty > 0 
      ? (putMktPrice - putCost) * putQty
      : (custodyPutItem?.averageCost ? (custodyPutItem.averageCost - putCost) * qty : 0);
    const putPLPercent = (putPL / (entryPrice * qty)) * 100;
    positionItems.push({
      ticker: putTicker,
      type: `Put Long (${putQty > 0 ? "Ativa" : "Encerrada"})`,
      qty: putQty,
      avgPrice: putCost,
      mktPrice: putQty > 0 ? putMktPrice : (custodyPutItem?.averageCost || 0),
      pnl: putPL,
      pnlPercent: putPLPercent
    });
  }

  // 3. Call Option BBDCG194
  if (callTicker) {
    const callMktPrice = callQuote?.price || 0;
    const callPL = callQty > 0
      ? (callIncome - callMktPrice) * callQty
      : (custodyCallItem?.averageCost ? (callIncome - custodyCallItem.averageCost) * qty : 0);
    const callPLPercent = (callPL / (entryPrice * qty)) * 100;
    positionItems.push({
      ticker: callTicker,
      type: `Call Short (${callQty > 0 ? "Ativa" : "Encerrada"})`,
      qty: callQty,
      avgPrice: callIncome,
      mktPrice: callQty > 0 ? callMktPrice : (custodyCallItem?.averageCost || 0),
      pnl: callPL,
      pnlPercent: callPLPercent
    });
  }

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
                  <span className="px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider bg-zinc-100 text-zinc-650 border border-zinc-200">
                    Quantitative Trend Following
                  </span>
                </div>
                <h1 className="text-3xl font-extrabold tracking-tight text-zinc-900">
                  Trend Following: <span className="text-zinc-950 font-mono">LONG/SHORT WIN</span>
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
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-in fade-in duration-300">
          
          {/* Header */}
          <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8 pb-6 border-b border-zinc-200">
            <div>
              <div className="flex items-center gap-2 mb-1.5">
                <span className="px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider bg-zinc-100 text-zinc-650 border border-zinc-200 animate-pulse">
                  Quantitative Portfolio
                </span>
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-zinc-100 text-zinc-700 border border-zinc-200 font-mono">
                  Hedge Ativo: BBDC4 Collar
                </span>
              </div>
              <h1 className="text-3xl font-extrabold tracking-tight text-zinc-900">
                Monitor de Hedge: <span className="text-zinc-950 font-mono">BBDC4 Collar</span>
              </h1>
            </div>
            
            <div className="flex flex-col md:text-right font-mono text-xs text-zinc-500 gap-1">
              <div>Iniciado em: {new Date(state.activation_date).toLocaleDateString("pt-BR")}</div>
              <div className="flex items-center md:justify-end gap-1.5 font-bold text-emerald-600">
                <span className={`w-2 h-2 rounded-full ${isFetchingQuotes ? "bg-amber-500 animate-pulse" : "bg-emerald-500"}`} />
                {isFetchingQuotes ? "ATUALIZANDO..." : "CONECTADO A CLEAR API"}
              </div>
            </div>
          </header>

          {/* Três Cards Principais */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            
            {/* Card 1: Resultado Consolidado */}
            <div className="bg-white border border-zinc-200 rounded-lg p-6 shadow-xs flex flex-col justify-between">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-2 mb-3 font-mono">
                  <DollarSign className="h-4 w-4 text-zinc-500" /> LUCRO / PREJUÍZO ATUAL
                </h3>
                <span className="text-zinc-500 text-xs font-medium">Resultado Total Consolidado (Ação + Opções)</span>
                <div className={`text-3xl font-black tracking-tight mt-1 flex items-baseline gap-2 font-mono ${liveTotalPL >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                  {liveTotalPL >= 0 ? "+" : ""}R$ {liveTotalPL.toLocaleString("pt-BR", {maximumFractionDigits: 2})}
                  <span className="text-xs font-bold">({liveReturnPercent >= 0 ? "+" : ""}{liveReturnPercent.toFixed(2)}%)</span>
                </div>
              </div>
              <p className="text-[10px] text-zinc-400 mt-4 border-t border-zinc-150 pt-3">
                Lucro/prejuízo consolidado da posição considerando o ativo subjacente e o hedge.
              </p>
            </div>

            {/* Card 2: Detalhes das Ações */}
            <div className="bg-white border border-zinc-200 rounded-lg p-6 shadow-xs flex flex-col justify-between">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-2 mb-3 font-mono">
                  <Layers className="h-4 w-4 text-zinc-500" /> POSIÇÃO EM AÇÕES (BBDC4)
                </h3>
                <span className="text-zinc-500 text-xs font-medium">Valorização de BBDC4</span>
                <div className={`text-3xl font-black tracking-tight mt-1 flex items-baseline gap-2 font-mono ${liveStockPL >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                  {liveStockPL >= 0 ? "+" : ""}R$ {liveStockPL.toLocaleString("pt-BR", {maximumFractionDigits: 2})}
                  <span className="text-xs font-bold">({liveStockReturnPercent >= 0 ? "+" : ""}{liveStockReturnPercent.toFixed(2)}%)</span>
                </div>
              </div>
              <div className="text-[10px] text-zinc-500 mt-4 border-t border-zinc-150 pt-3 flex justify-between font-mono">
                <span>Qtd: {qty.toLocaleString("pt-BR")}</span>
                <span>Preço Médio: R$ {entryPrice.toFixed(2)}</span>
                <span>Mkt: R$ {livePrice.toFixed(2)}</span>
              </div>
            </div>

            {/* Card 3: Detalhes das Opções */}
            <div className="bg-white border border-zinc-200 rounded-lg p-6 shadow-xs flex flex-col justify-between">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-2 mb-3 font-mono">
                  <ShieldCheck className="h-4 w-4 text-zinc-500" /> ESTRUTURA DE HEDGE (OPÇÕES)
                </h3>
                <span className="text-zinc-500 text-xs font-medium">Resultado Líquido do Collar</span>
                <div className={`text-3xl font-black tracking-tight mt-1 flex items-baseline gap-2 font-mono ${(currentPutPL + currentCallPL) >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                  {(currentPutPL + currentCallPL) >= 0 ? "+" : ""}R$ {(currentPutPL + currentCallPL).toLocaleString("pt-BR", {maximumFractionDigits: 2})}
                  <span className="text-xs font-bold">
                    ({((currentPutPL + currentCallPL) / (entryPrice * qty) * 100) >= 0 ? "+" : ""}{((currentPutPL + currentCallPL) / (entryPrice * qty) * 100).toFixed(2)}%)
                  </span>
                </div>
              </div>
              <div className="text-[10px] text-zinc-500 mt-4 border-t border-zinc-150 pt-3 flex justify-between font-mono">
                <span>Put Cost: R$ {putCost.toFixed(2)}</span>
                <span>Call Income: R$ {callIncome.toFixed(2)}</span>
                <span>Custo Líquido: R$ {netCost.toFixed(2)}</span>
              </div>
            </div>

          </div>

          {/* Tabela de Custódia Unificada */}
          <section className="bg-white border border-zinc-200 rounded-lg p-6 shadow-xs">
            <div className="mb-6 pb-3 border-b border-zinc-150 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold text-zinc-900 uppercase tracking-wider font-mono">Detalhamento de Ativos e Posições (Clear API)</h2>
                <p className="text-xs text-zinc-400">Custódia física e derivativos integrados em tempo real diretamente na corretora</p>
              </div>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold font-mono bg-zinc-100 text-zinc-650 border border-zinc-200">
                SINCRO CORRETORA
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left text-zinc-500">
                <thead className="text-[10px] uppercase tracking-wider text-zinc-400 bg-zinc-50 border-b border-zinc-250 font-mono">
                  <tr>
                    <th scope="col" className="px-6 py-4 font-bold text-zinc-900">Ativo / Ticker</th>
                    <th scope="col" className="px-6 py-4 font-bold">Tipo</th>
                    <th scope="col" className="px-6 py-4 font-bold text-right">Quantidade</th>
                    <th scope="col" className="px-6 py-4 font-bold text-right">Preço Médio</th>
                    <th scope="col" className="px-6 py-4 font-bold text-right">Cotação Atual</th>
                    <th scope="col" className="px-6 py-4 font-bold text-right text-zinc-900">Resultado Líquido (PnL)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-150">
                  {positionItems.map((item, idx) => (
                    <tr key={idx} className="hover:bg-zinc-50/50 transition-all font-mono">
                      <td className="px-6 py-4 font-bold text-zinc-950">{item.ticker}</td>
                      <td className="px-6 py-4 text-xs text-zinc-500 font-sans">{item.type}</td>
                      <td className="px-6 py-4 text-right font-bold text-zinc-800">{item.qty.toLocaleString("pt-BR")}</td>
                      <td className="px-6 py-4 text-right">R$ {item.avgPrice.toFixed(2)}</td>
                      <td className="px-6 py-4 text-right">R$ {item.mktPrice.toFixed(2)}</td>
                      <td className={`px-6 py-4 text-right font-bold ${item.pnl >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                        {item.pnl >= 0 ? "+" : ""}R$ {item.pnl.toLocaleString("pt-BR", {minimumFractionDigits: 2, maximumFractionDigits: 2})} ({item.pnlPercent >= 0 ? "+" : ""}{item.pnlPercent.toFixed(2)}%)
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </main>
      )}
      
      {/* Footer */}
      <footer className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 text-center text-xs text-zinc-400 border-t border-zinc-200 mt-12 font-mono">
        <p>© 2026 Hedge Fund Quant Platform. Executado em modo Informativo / Read-Only.</p>
      </footer>
    </div>
  );
}
