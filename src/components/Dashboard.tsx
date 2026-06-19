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

const getOptionType = (ticker: string) => {
  if (!ticker.startsWith("BBDC") || ticker.length <= 4) return null;
  const letter = ticker[4].toUpperCase();
  if (["M", "N", "O", "P", "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z"].includes(letter)) return "PUT";
  if (["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"].includes(letter)) return "CALL";
  return null;
};

const getOptionDetails = (ticker: string, activeQuotes: any, state: any) => {
  if (!ticker.startsWith("BBDC") || ticker.length <= 4) return { strike: null, expiration: null };
  const letter = ticker[4].toUpperCase();
  
  // Determine strike
  let strike: number | null = null;
  if (ticker === "BBDCS2") strike = 17.39;
  else if (ticker === "BBDCG194") strike = 19.14;
  else if (ticker === "BBDCS167") strike = 16.89;
  else if (ticker === state.active_put_ticker && state.active_put_strike) strike = state.active_put_strike;
  else if (ticker === state.active_call_ticker && state.active_call_strike) strike = state.active_call_strike;
  else {
    if (ticker === activeQuotes?.put?.ticker) strike = activeQuotes.put.strike;
    else if (ticker === activeQuotes?.call?.ticker) strike = activeQuotes.call.strike;
    else if (ticker === activeQuotes?.put_275?.ticker) strike = activeQuotes.put_275.strike;
    else if (ticker === activeQuotes?.call_275?.ticker) strike = activeQuotes.call_275.strike;
    else if (ticker === activeQuotes?.put_50?.ticker) strike = activeQuotes.put_50.strike;
    else if (ticker === activeQuotes?.call_50?.ticker) strike = activeQuotes.call_50.strike;
    else if (ticker === activeQuotes?.call_06?.ticker) strike = activeQuotes.call_06.strike;
  }

  // Determine expiration
  let expiration: string | null = null;
  const monthCodes = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O", "P", "Q", "R", "S", "T", "U", "V", "W", "X"];
  const index = monthCodes.indexOf(letter);
  if (index !== -1) {
    const monthNum = index % 12;
    const thirdFridays: { [key: number]: string } = {
      0: "16/01/2026",
      1: "20/02/2026",
      2: "20/03/2026",
      3: "17/04/2026",
      4: "15/05/2026",
      5: "19/06/2026",
      6: "17/07/2026",
      7: "21/08/2026",
      8: "18/09/2026",
      9: "16/10/2026",
      10: "20/11/2026",
      11: "18/12/2026"
    };
    expiration = thirdFridays[monthNum] || null;
  }

  return { strike, expiration };
};

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

  // Cálculo dinâmico do PnL Real-Time de Opções (Ativas e Encerradas)
  const optionsInCustody: any[] = [];
  let calculatedPutsPL = 0;
  let calculatedCallsPL = 0;

  if (liveCustody && liveCustody.length > 0) {
    liveCustody.forEach((item: any) => {
      const type = getOptionType(item.ticker);
      if (!type) return;

      const itemQty = (item.availableQuantity || 0) + (item.collateralBlockedQuantity || 0);
      
      // Determina prêmio original de custo
      let originalPremium = item.averageCost || 0.0;
      if (item.ticker === "BBDCS2") originalPremium = 0.28;
      else if (item.ticker === "BBDCG194") originalPremium = 0.09;
      else if (item.ticker === state.active_put_ticker) originalPremium = state.put_premium_paid;
      else if (item.ticker === state.active_call_ticker) originalPremium = state.call_premium_received;

      // Determina cotação atual a mercado
      let mktPrice = 0.0;
      if (itemQty > 0) {
        if (item.ticker === liveQuotes?.put?.ticker) mktPrice = liveQuotes?.put?.price || 0;
        else if (item.ticker === liveQuotes?.call?.ticker) mktPrice = liveQuotes?.call?.price || 0;
        else if (item.ticker === liveQuotes?.put_275?.ticker) mktPrice = liveQuotes?.put_275?.price || 0;
        else if (item.ticker === liveQuotes?.call_275?.ticker) mktPrice = liveQuotes?.call_275?.price || 0;
        else if (item.ticker === liveQuotes?.put_50?.ticker) mktPrice = liveQuotes?.put_50?.price || 0;
        else if (item.ticker === liveQuotes?.call_50?.ticker) mktPrice = liveQuotes?.call_50?.price || 0;
        else if (item.ticker === liveQuotes?.call_06?.ticker) mktPrice = liveQuotes?.call_06?.price || 0;
        else if (type === "PUT" && putQuote?.ticker === item.ticker) mktPrice = putQuote?.price || 0;
        else if (type === "CALL" && callQuote?.ticker === item.ticker) mktPrice = callQuote?.price || 0;
        else mktPrice = item.averageCost || 0.0;
      } else {
        mktPrice = item.averageCost || 0.0;
      }

      // Calcula PnL
      let itemPL = 0;
      if (type === "PUT") {
        if (itemQty > 0) {
          itemPL = (mktPrice - originalPremium) * itemQty;
        } else if (originalPremium > 0) {
          itemPL = (mktPrice - originalPremium) * qty;
        }
        calculatedPutsPL += itemPL;
      } else { // CALL
        if (itemQty > 0) {
          itemPL = (originalPremium - mktPrice) * itemQty;
        } else if (originalPremium > 0) {
          itemPL = (originalPremium - mktPrice) * qty;
        }
        calculatedCallsPL += itemPL;
      }

      const pnlPercent = (itemPL / (entryPrice * qty)) * 100;
      const { strike, expiration } = getOptionDetails(item.ticker, liveQuotes, state);

      if (itemQty > 0 || Math.abs(itemPL) > 0.01) {
        optionsInCustody.push({
          ticker: item.ticker,
          type: `${type} Long (${itemQty > 0 ? "Ativa" : "Encerrada"})`,
          qty: itemQty,
          avgPrice: originalPremium,
          mktPrice: itemQty > 0 ? mktPrice : (item.averageCost || originalPremium),
          pnl: itemPL,
          pnlPercent: pnlPercent,
          strike: strike,
          expiration: expiration
        });
      }
    });
  } else {
    if (putTicker) {
      const putMktPrice = putQuote?.price || 0;
      const putPL = putQty > 0 
        ? (putMktPrice - putCost) * putQty
        : (custodyPutItem?.averageCost ? (custodyPutItem.averageCost - putCost) * qty : 0);
      calculatedPutsPL = putPL;
      const { strike, expiration } = getOptionDetails(putTicker, liveQuotes, state);
      optionsInCustody.push({
        ticker: putTicker,
        type: `Put Long (${putQty > 0 ? "Ativa" : "Encerrada"})`,
        qty: putQty,
        avgPrice: putCost,
        mktPrice: putQty > 0 ? putMktPrice : 0,
        pnl: putPL,
        pnlPercent: (putPL / (entryPrice * qty)) * 100,
        strike: strike,
        expiration: expiration
      });
    }

    if (callTicker) {
      const callMktPrice = callQuote?.price || 0;
      const callPL = callQty > 0
        ? (callIncome - callMktPrice) * callQty
        : (custodyCallItem?.averageCost ? (callIncome - custodyCallItem.averageCost) * qty : 0);
      calculatedCallsPL = callPL;
      const { strike, expiration } = getOptionDetails(callTicker, liveQuotes, state);
      optionsInCustody.push({
        ticker: callTicker,
        type: `Call Short (${callQty > 0 ? "Ativa" : "Encerrada"})`,
        qty: callQty,
        avgPrice: callIncome,
        mktPrice: callQty > 0 ? callMktPrice : 0,
        pnl: callPL,
        pnlPercent: (callPL / (entryPrice * qty)) * 100,
        strike: strike,
        expiration: expiration
      });
    }
  }

  const currentPutPL = calculatedPutsPL;
  const currentCallPL = calculatedCallsPL;
  
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

  // 2. Opções da Custódia
  positionItems.push(...optionsInCustody);

  // Encontra os strikes ativos na custódia
  const activePut = optionsInCustody.find((o: any) => o.type.includes("PUT") && o.qty > 0);
  const activeCall = optionsInCustody.find((o: any) => o.type.includes("CALL") && o.qty > 0);
  
  const activePutStrike = activePut ? (activePut.ticker === "BBDCS167" ? 16.89 : activePut.ticker === "BBDCS2" ? 17.39 : (state.active_put_strike || 17.39)) : null;
  const activeCallStrike = activeCall ? (activeCall.ticker === "BBDCG194" ? 19.14 : (state.active_call_strike || 19.14)) : null;

  const calculateDynamicScenario = (price: number) => {
    const stockPL = (price - entryPrice) * qty;
    let optionsPL = 0;

    optionsInCustody.forEach((opt: any) => {
      const type = opt.type.includes("PUT") ? "PUT" : "CALL";
      const isClosed = opt.qty === 0;
      const strike = opt.ticker === state.active_put_ticker ? (state.active_put_strike || 17.39)
                   : opt.ticker === state.active_call_ticker ? (state.active_call_strike || 19.14)
                   : opt.ticker === "BBDCS2" ? 17.39
                   : opt.ticker === "BBDCG194" ? 19.14
                   : opt.ticker === "BBDCS167" ? 16.89
                   : parseFloat(opt.ticker.replace(/\D/g, '')) / 100 || entryPrice;

      if (type === "PUT") {
        if (!isClosed) {
          optionsPL += (Math.max(0, strike - price) - opt.avgPrice) * opt.qty;
        } else {
          optionsPL += opt.pnl;
        }
      } else {
        if (!isClosed) {
          optionsPL += (opt.avgPrice - Math.max(0, price - strike)) * opt.qty;
        } else {
          optionsPL += opt.pnl;
        }
      }
    });

    const totalPL = stockPL + optionsPL;
    const netReturnPercent = (totalPL / (entryPrice * qty)) * 100;
    return { totalPL, netReturnPercent };
  };

  // ────────────────────────────────────────────────
  // Lógica de Sinais Operacionais — Ordens de Home Broker
  // ────────────────────────────────────────────────
  interface OrderLeg {
    action: "COMPRA" | "VENDA";
    ticker: string;
    qty: number;
    strike: number;
    nature: string;
    color: "green" | "red" | "blue" | "amber";
  }

  let signalTitle = "MANTER COLLAR";
  let signalAction = "Manter Estrutura Atual";
  let orderLegs: OrderLeg[] = [];
  let signalNote = "";
  let needsAdjustment = false;

  // Score Multifatorial para Decisão de Hedge BBDC4
  const scoreKama = livePrice > currentKAMA ? 1 : -1;
  const scoreTsmom = currentTSMOM > 0 ? 1 : -1;
  const scoreVol = currentZScore <= 1.0 ? 1 : -1;
  const scoreVrp = currentVRP >= 0 ? 1 : -1;
  const totalScore = scoreKama + scoreTsmom + scoreVol + scoreVrp;

  const isTransitionToA = currentRegime === "B" && totalScore >= 2;
  const isTransitionToB = currentRegime === "A" && totalScore <= -2;

  if (isTransitionToA) {
    needsAdjustment = true;
    signalTitle = "TRANSIÇÃO: ALTA (REGIME A)";
    signalAction = "Desmontar Put + Rolar Call para OTM";
    signalNote = `Score Multifatorial atingiu +2 ou mais (Preço R$ ${livePrice.toFixed(2)} > KAMA R$ ${currentKAMA.toFixed(2)}, TSMOM: ${currentTSMOM.toFixed(4)}, Vol Z-Score: ${currentZScore.toFixed(2)}). Reduzir proteção e aumentar exposição direcional.`;

    const targetCallTicker = liveQuotes?.call_06?.ticker || "BBDCG200";
    const targetCallStrike = liveQuotes?.call_06?.strike || 20.00;

    const activePut = optionsInCustody.find(o => o.type.includes("PUT") && o.qty > 0);
    if (activePut) {
      orderLegs.push({
        action: "VENDA",
        ticker: activePut.ticker,
        qty: qty,
        strike: activePut.strike || 17.39,
        nature: "Desmontar Put (Zerar Proteção)",
        color: "red"
      });
    }

    const activeCall = optionsInCustody.find(o => o.type.includes("CALL") && o.qty > 0);
    if (activeCall) {
      orderLegs.push({
        action: "COMPRA",
        ticker: activeCall.ticker,
        qty: qty,
        strike: activeCall.strike || 19.14,
        nature: "Recomprar Call Anterior (Encerrar)",
        color: "green"
      });
    }

    orderLegs.push({
      action: "VENDA",
      ticker: targetCallTicker,
      qty: qty,
      strike: targetCallStrike,
      nature: "Vender nova Call OTM (Delta ~ 0.06)",
      color: "red"
    });

  } else if (isTransitionToB) {
    needsAdjustment = true;
    signalTitle = "TRANSIÇÃO: CAIXA (REGIME B)";
    signalAction = "Montar Put ATM + Rolar Call para ATM";
    signalNote = `Score Multifatorial caiu para -2 ou menos (Preço R$ ${livePrice.toFixed(2)} < KAMA R$ ${currentKAMA.toFixed(2)}, TSMOM: ${currentTSMOM.toFixed(4)}, Vol Z-Score: ${currentZScore.toFixed(2)}). Ativar proteção total da carteira.`;

    const targetPutTicker = liveQuotes?.put_50?.ticker || "BBDCS175";
    const targetPutStrike = liveQuotes?.put_50?.strike || 17.50;
    const targetCallTicker = liveQuotes?.call_50?.ticker || "BBDCG175";
    const targetCallStrike = liveQuotes?.call_50?.strike || 17.50;

    orderLegs.push({
      action: "COMPRA",
      ticker: targetPutTicker,
      qty: qty,
      strike: targetPutStrike,
      nature: "Comprar Put ATM (Delta ~ -0.50)",
      color: "green"
    });

    const activeCall = optionsInCustody.find(o => o.type.includes("CALL") && o.qty > 0);
    if (activeCall) {
      orderLegs.push({
        action: "COMPRA",
        ticker: activeCall.ticker,
        qty: qty,
        strike: activeCall.strike || 19.14,
        nature: "Recomprar Call Anterior (Encerrar)",
        color: "green"
      });
    }

    orderLegs.push({
      action: "VENDA",
      ticker: targetCallTicker,
      qty: qty,
      strike: targetCallStrike,
      nature: "Vender nova Call ATM (Delta ~ 0.50)",
      color: "red"
    });

  } else {
    if (currentRegime === "A") {
      signalTitle = "MANTER COLLAR: ALTA ATIVA (REGIME A)";
      signalNote = `Preço atual (R$ ${livePrice.toFixed(2)}) e score multifatorial (${totalScore > 0 ? "+" : ""}${totalScore} pts) sustentam o regime de alta. Nenhuma ordem pendente.`;
    } else {
      signalTitle = "MANTER COLLAR: PROTEÇÃO ATIVA (REGIME B)";
      signalNote = `Preço atual (R$ ${livePrice.toFixed(2)}) e score multifatorial (${totalScore > 0 ? "+" : ""}${totalScore} pts) sustentam o regime de proteção. Posição de proteção total mantida.`;
    }
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
              winTicker={liveWinTicker}
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

          {/* Quadro de Cenários Limites */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            {/* Card Pior Cenário */}
            <div className="bg-white border border-zinc-200 rounded-lg p-6 shadow-xs flex flex-col justify-between">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-rose-500 flex items-center gap-2 mb-3 font-mono">
                  <TrendingDown className="h-4 w-4 text-rose-500" /> PIOR CENÁRIO (PROTEÇÃO DE BAIXA)
                </h3>
                {activePutStrike ? (
                  <>
                    <span className="text-zinc-500 text-xs font-medium">Preço Limitado pela Put ativa em R$ {activePutStrike.toFixed(2)}</span>
                    <div className="text-2xl font-black tracking-tight mt-1 flex items-baseline gap-2 font-mono text-rose-600">
                      R$ {calculateDynamicScenario(activePutStrike).totalPL.toLocaleString("pt-BR", {maximumFractionDigits: 2})}
                      <span className="text-xs font-bold">({calculateDynamicScenario(activePutStrike).netReturnPercent.toFixed(2)}%)</span>
                    </div>
                  </>
                ) : (
                  <>
                    <span className="text-zinc-500 text-xs font-medium">Hedge Inativo (Sem Put de proteção ativa)</span>
                    <div className="text-2xl font-black tracking-tight mt-1 font-mono text-rose-600">
                      Risco de Baixa Ilimitado
                    </div>
                  </>
                )}
              </div>
              <p className="text-[10px] text-zinc-400 mt-4 border-t border-zinc-150 pt-3">
                O pior resultado possível da estrutura de Collar consolidada, travado pelo strike de proteção da Put.
              </p>
            </div>

            {/* Card Melhor Cenário */}
            <div className="bg-white border border-zinc-200 rounded-lg p-6 shadow-xs flex flex-col justify-between">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-600 flex items-center gap-2 mb-3 font-mono">
                  <TrendingUp className="h-4 w-4 text-emerald-600" /> MELHOR CENÁRIO (RETORNO MÁXIMO CAPPED)
                </h3>
                {activeCallStrike ? (
                  <>
                    <span className="text-zinc-500 text-xs font-medium">Lucro Limitado pela Call vendida em R$ {activeCallStrike.toFixed(2)}</span>
                    <div className="text-2xl font-black tracking-tight mt-1 flex items-baseline gap-2 font-mono text-emerald-600">
                      +R$ {calculateDynamicScenario(activeCallStrike).totalPL.toLocaleString("pt-BR", {maximumFractionDigits: 2})}
                      <span className="text-xs font-bold">(+{calculateDynamicScenario(activeCallStrike).netReturnPercent.toFixed(2)}%)</span>
                    </div>
                  </>
                ) : (
                  <>
                    <span className="text-zinc-500 text-xs font-medium">Hedge de Alta Inativo (Sem Call vendida ativa)</span>
                    <div className="text-2xl font-black tracking-tight mt-1 font-mono text-emerald-600">
                      Alta Ilimitada
                    </div>
                  </>
                )}
              </div>
              <p className="text-[10px] text-zinc-400 mt-4 border-t border-zinc-150 pt-3">
                O retorno máximo possível da estrutura consolidada, limitado/travado pelo strike da Call vendida.
              </p>
            </div>
          </div>

          {/* Card de Recomendação Estratégica */}
          <section className="bg-white border border-zinc-200 rounded-lg p-6 shadow-xs mb-8">
            <div className="mb-4 pb-3 border-b border-zinc-150 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold text-zinc-900 uppercase tracking-wider font-mono">Recomendação Estratégica do Modelo</h2>
                <p className="text-xs text-zinc-400">Decisões de rebalanceamento baseadas no Score Multifatorial quantitativo</p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs font-bold text-zinc-500 font-mono">Score: {totalScore > 0 ? "+" : ""}{totalScore} pts</span>
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono ${
                  needsAdjustment ? "bg-amber-100 text-amber-800 border border-amber-200 animate-pulse" : "bg-zinc-100 text-zinc-650 border border-zinc-200"
                }`}>
                  {needsAdjustment ? "REAJUSTAR ESTRUTURA" : "ESTRUTURA OK"}
                </span>
              </div>
            </div>

            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div className="flex-1">
                <span className="text-xs text-zinc-500 font-medium">Status do Regime</span>
                <h4 className="text-lg font-bold text-zinc-900 font-mono mt-0.5">{signalTitle}</h4>
                <p className="text-xs text-zinc-650 mt-1 leading-relaxed">{signalNote}</p>
              </div>

              <div className="flex-shrink-0 md:w-80 p-4 rounded-lg bg-zinc-50 border border-zinc-200">
                <span className="text-[10px] uppercase font-bold text-zinc-400 tracking-wider font-mono block mb-2">Operações sugeridas</span>
                {orderLegs.length > 0 ? (
                  <ul className="space-y-2 font-mono text-xs">
                    {orderLegs.map((leg, idx) => (
                      <li key={idx} className="flex items-center justify-between gap-2 border-b border-zinc-150 pb-1.5 last:border-b-0 last:pb-0">
                        <span className={`font-bold ${leg.action === "COMPRA" ? "text-emerald-600" : "text-rose-600"}`}>
                          {leg.action}
                        </span>
                        <span className="font-bold text-zinc-900">{leg.ticker}</span>
                        <span className="text-zinc-500">K: R$ {leg.strike.toFixed(2)}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <span className="text-xs text-zinc-400 font-mono">Nenhum ajuste necessário no Home Broker no momento.</span>
                )}
              </div>
            </div>

            {/* Grid Detalhado do Score Multifatorial */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6 pt-6 border-t border-zinc-150 text-xs font-mono">
              <div className="p-3 rounded bg-zinc-50 border border-zinc-200 flex flex-col justify-between">
                <span className="text-zinc-400 text-[10px] uppercase font-bold">1. KAMA Trend</span>
                <span className="text-sm font-bold text-zinc-800 mt-1">{livePrice > currentKAMA ? "Alta (> KAMA)" : "Baixa (< KAMA)"}</span>
                <span className={`text-xs font-bold mt-1 ${scoreKama > 0 ? "text-emerald-600" : "text-rose-600"}`}>
                  {scoreKama > 0 ? "+1 pt" : "-1 pt"}
                </span>
              </div>
              <div className="p-3 rounded bg-zinc-50 border border-zinc-200 flex flex-col justify-between">
                <span className="text-zinc-400 text-[10px] uppercase font-bold">2. TSMOM Composite</span>
                <span className="text-sm font-bold text-zinc-800 mt-1">{currentTSMOM.toFixed(4)}</span>
                <span className={`text-xs font-bold mt-1 ${scoreTsmom > 0 ? "text-emerald-600" : "text-rose-600"}`}>
                  {scoreTsmom > 0 ? "+1 pt" : "-1 pt"}
                </span>
              </div>
              <div className="p-3 rounded bg-zinc-50 border border-zinc-200 flex flex-col justify-between">
                <span className="text-zinc-400 text-[10px] uppercase font-bold">3. Vol Z-Score</span>
                <span className="text-sm font-bold text-zinc-800 mt-1">{currentZScore.toFixed(2)}</span>
                <span className={`text-xs font-bold mt-1 ${scoreVol > 0 ? "text-emerald-600" : "text-rose-600"}`}>
                  {scoreVol > 0 ? "+1 pt" : "-1 pt"}
                </span>
              </div>
              <div className="p-3 rounded bg-zinc-50 border border-zinc-200 flex flex-col justify-between">
                <span className="text-zinc-400 text-[10px] uppercase font-bold">4. VRP Puts</span>
                <span className="text-sm font-bold text-zinc-800 mt-1">{(currentVRP * 100).toFixed(1)}%</span>
                <span className={`text-xs font-bold mt-1 ${scoreVrp > 0 ? "text-emerald-600" : "text-rose-600"}`}>
                  {scoreVrp > 0 ? "+1 pt" : "-1 pt"}
                </span>
              </div>
            </div>
          </section>

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
                    <th scope="col" className="px-6 py-4 font-bold text-right">Strike</th>
                    <th scope="col" className="px-6 py-4 font-bold text-right">Vencimento</th>
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
                      <td className="px-6 py-4 text-right">{item.strike ? `R$ ${item.strike.toFixed(2)}` : "-"}</td>
                      <td className="px-6 py-4 text-right text-xs">{item.expiration || "-"}</td>
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
