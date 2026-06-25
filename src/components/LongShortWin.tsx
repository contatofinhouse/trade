"use client";

import React, { useState, useEffect } from "react";
import { 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  Layers, 
  Activity,
  Sliders,
  ShieldAlert,
  ArrowRightLeft,
  Target
} from "lucide-react";
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer 
} from "recharts";

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
  liveCustody?: any[] | null;
  winIntradayState?: any | null;
}

export default function LongShortWin({ initialState, livePriceFromClear, winTicker = "WINQ26", liveCustody, winIntradayState }: LongShortWinProps) {
  const [isMounted, setIsMounted] = useState(false);
  const [intradayTab, setIntradayTab] = useState<"daily" | "intraday">("daily");
  
  // Parâmetros de risco
  const [capitalBase, setCapitalBase] = useState(100000);
  const [maxRiskCash, setMaxRiskCash] = useState(1000);
  const [atrMultiplier, setAtrMultiplier] = useState(1.0);
  
  // Preços
  const basePrice = livePriceFromClear || initialState.close_price || 170000;
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

  let modelSignal: "COMPRA" | "VENDA" | "CAIXA" = "CAIXA";
  let blockReason = "";

  if (totalScore >= 2) {
    if (isOverbought) {
      modelSignal = "CAIXA";
      blockReason = "Preço esticado acima da banda superior.";
    } else {
      modelSignal = "COMPRA";
    }
  } else if (totalScore <= -2) {
    if (isOversold) {
      modelSignal = "CAIXA";
      blockReason = "Preço esticado abaixo da banda inferior.";
    } else {
      modelSignal = "VENDA";
    }
  } else {
    blockReason = `Score insuficiente (${totalScore > 0 ? "+" : ""}${totalScore}). Aguardando sinal claro.`;
  }

  // Identificação da Posição Atual pela Custódia
  let positionQty = 0;
  let entryPrice = basePrice;
  
  if (liveCustody && liveCustody.length > 0) {
    const custodyWin = liveCustody.find((item: any) => item.ticker === winTicker);
    if (custodyWin) {
      const available = custodyWin.availableQuantity || 0;
      const blocked = custodyWin.collateralBlockedQuantity || 0;
      positionQty = available + blocked;
      if (positionQty !== 0) {
        entryPrice = custodyWin.averageCost || entryPrice;
      }
    }
  }

  const direction: "LONG" | "SHORT" | "CAIXA" = positionQty > 0 ? "LONG" : positionQty < 0 ? "SHORT" : "CAIXA";
  const hasActivePosition = direction !== "CAIXA";

  const stopDistance = roundToWIN(atr * atrMultiplier);
  const targetDistance = roundToWIN(atr * atrMultiplier * 1.5);

  // --- Trailing Stop com Persistência (localStorage) ---
  const TRAILING_KEY = `win_trailing_${winTicker}`;

  interface TrailingState {
    direction: "LONG" | "SHORT";
    entryPrice: number;
    currentStop: number;
    currentTarget: number;
    lastUpdated: string;
  }

  // Função para ler estado persistido
  const readTrailing = (): TrailingState | null => {
    try {
      const raw = localStorage.getItem(TRAILING_KEY);
      if (!raw) return null;
      return JSON.parse(raw) as TrailingState;
    } catch { return null; }
  };

  // Função para salvar estado persistido
  const saveTrailing = (state: TrailingState) => {
    try { localStorage.setItem(TRAILING_KEY, JSON.stringify(state)); } catch {}
  };

  // Função para limpar estado persistido
  const clearTrailing = () => {
    try { localStorage.removeItem(TRAILING_KEY); } catch {}
  };

  // Calcula stops e alvos sugeridos pelo modelo (sem persistência)
  let stopInicial = 0;
  let alvoInicial = 0;
  let stopModeloAtual = 0;  // Trailing stop sugerido pela KAMA agora
  let alvoModeloAtual = 0;  // Alvo sugerido pela Bollinger agora

  const referencePrice = hasActivePosition ? entryPrice : currentPrice;

  if (direction === "LONG" || (direction === "CAIXA" && modelSignal === "COMPRA")) {
    stopInicial = roundToWIN(referencePrice - stopDistance);
    alvoInicial = roundToWIN(referencePrice + targetDistance);
    stopModeloAtual = roundToWIN(kama - atr * 0.5);
    alvoModeloAtual = roundToWIN(bollingerUpper);
  } else if (direction === "SHORT" || (direction === "CAIXA" && modelSignal === "VENDA")) {
    stopInicial = roundToWIN(referencePrice + stopDistance);
    alvoInicial = roundToWIN(referencePrice - targetDistance);
    stopModeloAtual = roundToWIN(kama + atr * 0.5);
    alvoModeloAtual = roundToWIN(bollingerLower);
  }

  // Aplica persistência: lê o melhor stop/alvo já registrado e só move a favor
  let stopRecomendado = stopInicial;
  let alvoRecomendado = alvoInicial;

  if (hasActivePosition) {
    const saved = readTrailing();

    // Verifica se o estado persistido é da mesma posição
    const samePosition = saved && saved.direction === direction && saved.entryPrice === entryPrice;

    // Detecta se os valores salvos estão corrompidos por um erro de cálculo do ATR anterior (mais de 4 ATRs de distância da entrada)
    const isCorrupted = saved && (
      direction === "LONG"
        ? (saved.currentTarget > entryPrice + atr * 4 || saved.currentStop < entryPrice - atr * 4)
        : (saved.currentTarget < entryPrice - atr * 4 || saved.currentStop > entryPrice + atr * 4)
    );

    if (samePosition && saved && !isCorrupted) {
      // Lê o melhor stop/alvo persistido (nunca recua)
      if (direction === "LONG") {
        // Stop: max(persistido, modelo_atual, inicial) — só sobe
        stopRecomendado = Math.max(saved.currentStop, stopModeloAtual, stopInicial);
        // Alvo: max(persistido, modelo_atual, inicial) — só sobe
        alvoRecomendado = Math.max(saved.currentTarget, alvoModeloAtual, alvoInicial);
      } else {
        // SHORT: Stop desce, Alvo desce
        stopRecomendado = Math.min(saved.currentStop, stopModeloAtual, stopInicial);
        alvoRecomendado = Math.min(saved.currentTarget, alvoModeloAtual, alvoInicial);
      }
    } else {
      // Nova posição, primeira vez ou estado corrompido: inicializa com modelo vs inicial
      if (direction === "LONG") {
        stopRecomendado = Math.max(stopInicial, stopModeloAtual);
        alvoRecomendado = Math.max(alvoInicial, alvoModeloAtual);
      } else {
        stopRecomendado = Math.min(stopInicial, stopModeloAtual);
        alvoRecomendado = Math.min(alvoInicial, alvoModeloAtual);
      }
    }

    // Persiste o estado atualizado
    saveTrailing({
      direction,
      entryPrice,
      currentStop: stopRecomendado,
      currentTarget: alvoRecomendado,
      lastUpdated: new Date().toISOString()
    });
  } else {
    // Sem posição: limpa estado antigo
    clearTrailing();
    if (modelSignal === "COMPRA") {
      stopRecomendado = Math.max(stopInicial, stopModeloAtual);
      alvoRecomendado = Math.max(alvoInicial, alvoModeloAtual);
    } else if (modelSignal === "VENDA") {
      stopRecomendado = Math.min(stopInicial, stopModeloAtual);
      alvoRecomendado = Math.min(alvoInicial, alvoModeloAtual);
    }
  }

  const riskPerContract = stopDistance * 0.20;
  const contractsSize = hasActivePosition ? Math.abs(positionQty) : Math.max(1, Math.floor(maxRiskCash / riskPerContract));

  const winPointValue = 0.20;
  
  // Resultados da Custódia
  let resultadoPts = 0;
  if (direction === "LONG") resultadoPts = currentPrice - entryPrice;
  if (direction === "SHORT") resultadoPts = entryPrice - currentPrice;
  
  const pnlFinanceiro = resultadoPts * winPointValue * contractsSize;
  const percentualCapital = (pnlFinanceiro / capitalBase) * 100;

  // Lógica de Recomendação de Ajuste (Anti-Spam 50 pts)
  // Agora compara o recomendado contra o PERSISTIDO, não contra o inicial
  let ajusteStop = "";
  let ajusteAlvo = "";
  
  if (hasActivePosition) {
    const saved = readTrailing();
    // Se há um valor salvo anterior, compara contra ele para ver se mudou
    // Se não, compara contra o inicial
    const stopAnterior = (saved && saved.direction === direction && saved.entryPrice === entryPrice) 
      ? saved.currentStop : stopInicial;
    const alvoAnterior = (saved && saved.direction === direction && saved.entryPrice === entryPrice) 
      ? saved.currentTarget : alvoInicial;

    const deltaStop = stopRecomendado - stopInicial;
    const deltaAlvo = alvoRecomendado - alvoInicial;

    if (Math.abs(deltaStop) >= 50) {
      if (direction === "LONG" && deltaStop > 0) {
        ajusteStop = `Subir Stop Loss para ${stopRecomendado.toLocaleString("pt-BR")} pts`;
      } else if (direction === "SHORT" && deltaStop < 0) {
        ajusteStop = `Descer Stop Loss para ${stopRecomendado.toLocaleString("pt-BR")} pts`;
      }
    }

    if (Math.abs(deltaAlvo) >= 50) {
      if (direction === "LONG" && deltaAlvo > 0) {
        ajusteAlvo = `Subir Alvo para ${alvoRecomendado.toLocaleString("pt-BR")} pts`;
      } else if (direction === "SHORT" && deltaAlvo < 0) {
        ajusteAlvo = `Descer Alvo para ${alvoRecomendado.toLocaleString("pt-BR")} pts`;
      }
    }
  }

  if (!isMounted) return null;

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      
      {/* Selector de Horizonte Temporal */}
      <div className="flex space-x-2 bg-zinc-100 p-1.5 rounded-lg w-max border border-zinc-200">
        <button
          onClick={() => setIntradayTab("daily")}
          className={`px-4 py-1.5 rounded text-xs font-bold transition-all cursor-pointer ${
            intradayTab === "daily"
              ? "bg-white text-zinc-950 shadow-xs border border-zinc-200"
              : "text-zinc-500 hover:text-zinc-800"
          }`}
        >
          Daily (Swing Trade)
        </button>
        <button
          onClick={() => setIntradayTab("intraday")}
          className={`px-4 py-1.5 rounded text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
            intradayTab === "intraday"
              ? "bg-white text-zinc-950 shadow-xs border border-zinc-200"
              : "text-zinc-500 hover:text-zinc-800"
          }`}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          Intraday M5 (MetaTrader 5)
        </button>
      </div>

      {intradayTab === "daily" ? (
        <>
      
      {/* Três Cards Principais */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* Card 1: Resultado PnL */}
        <div className="bg-white border border-zinc-200 rounded-lg p-6 shadow-xs flex flex-col justify-between">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-2 mb-3 font-mono">
              <DollarSign className="h-4 w-4 text-zinc-500" /> RESULTADO DA OPERAÇÃO
            </h3>
            <span className="text-zinc-500 text-xs font-medium">PnL Real-Time da Posição</span>
            {hasActivePosition ? (
              <div className={`text-3xl font-black tracking-tight mt-1 flex items-baseline gap-2 font-mono ${pnlFinanceiro >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                {pnlFinanceiro >= 0 ? "+" : ""}R$ {pnlFinanceiro.toLocaleString("pt-BR", {minimumFractionDigits: 2})}
                <span className="text-xs font-bold">({percentualCapital >= 0 ? "+" : ""}{percentualCapital.toFixed(2)}%)</span>
              </div>
            ) : (
              <div className="text-3xl font-black tracking-tight mt-1 flex items-baseline gap-2 font-mono text-zinc-300">
                R$ 0,00
                <span className="text-xs font-bold">(0.00%)</span>
              </div>
            )}
          </div>
          <p className="text-[10px] text-zinc-400 mt-4 border-t border-zinc-150 pt-3 font-mono flex justify-between">
            {hasActivePosition ? (
              <>
                <span>Mkt: {currentPrice.toLocaleString("pt-BR")}</span>
                <span>Entrada: {entryPrice.toLocaleString("pt-BR")}</span>
                <span className={resultadoPts >= 0 ? "text-emerald-500" : "text-rose-500"}>
                  {resultadoPts >= 0 ? "+" : ""}{resultadoPts} pts
                </span>
              </>
            ) : (
              <span>Nenhuma posição aberta no momento. Cotação: {currentPrice.toLocaleString("pt-BR")} pts</span>
            )}
          </p>
        </div>

        {/* Card 2: Recomendação e Score */}
        <div className="bg-white border border-zinc-200 rounded-lg p-6 shadow-xs flex flex-col justify-between">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-2 mb-3 font-mono">
              <Activity className="h-4 w-4 text-zinc-500" /> SINAL DO MODELO QUANT
            </h3>
            <span className="text-zinc-500 text-xs font-medium">Sinal Direcional / Score</span>
            <div className={`text-3xl font-black tracking-tight mt-1 flex items-baseline gap-2 font-mono ${
              modelSignal === "COMPRA" ? "text-emerald-600" : modelSignal === "VENDA" ? "text-rose-600" : "text-zinc-500"
            }`}>
              {modelSignal === "COMPRA" ? "COMPRA" : modelSignal === "VENDA" ? "VENDA" : "AGUARDAR"}
              <span className="text-xs font-bold text-zinc-400 font-sans">({totalScore > 0 ? "+" : ""}{totalScore} pts)</span>
            </div>
          </div>
          <p className="text-[10px] text-zinc-400 mt-4 border-t border-zinc-150 pt-3 font-mono">
            {hasActivePosition ? `Já posicionado (${direction}). Avaliando saídas.` : (modelSignal !== "CAIXA" ? `Lote Recomendado: ${contractsSize} contratos` : blockReason)}
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
                  className="w-24 px-1.5 py-0.5 border border-zinc-200 rounded text-right font-bold text-zinc-800 focus:outline-none bg-transparent"
                  disabled={hasActivePosition}
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
                    disabled={hasActivePosition}
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

      {/* Card de Ajustes Dinâmicos (Take Profit / Stop Loss) */}
      {hasActivePosition && (
        <section className="bg-white border border-zinc-200 rounded-lg p-6 shadow-xs border-l-4 border-l-emerald-500">
          <div className="mb-4 pb-3 border-b border-zinc-150 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-zinc-900 uppercase tracking-wider font-mono">Monitoramento de Risco da Operação (Trailing)</h2>
              <p className="text-xs text-zinc-400">Recomendações do modelo quantitativo baseadas na evolução da KAMA e Bollinger</p>
            </div>
            <span className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono ${
              ajusteStop || ajusteAlvo ? "bg-amber-100 text-amber-800 border border-amber-200 animate-pulse" : "bg-emerald-100 text-emerald-800 border border-emerald-200"
            }`}>
              {ajusteStop || ajusteAlvo ? "AJUSTE RECOMENDADO" : "RISCO ALINHADO"}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-zinc-50 rounded p-4 border border-zinc-200">
              <h4 className="text-xs font-bold text-rose-600 uppercase mb-2 flex items-center gap-2 font-mono">
                <ShieldAlert className="h-4 w-4" /> Stop Loss (Trailing)
              </h4>
              <div className="flex justify-between items-center text-sm font-mono mt-3">
                <span className="text-zinc-500">Stop Inicial (Cadastrado):</span>
                <span className="font-bold text-zinc-800">{stopInicial.toLocaleString("pt-BR")} pts</span>
              </div>
              <div className="flex justify-between items-center text-sm font-mono mt-1">
                <span className="text-zinc-500">Stop Recomendado (KAMA):</span>
                <span className="font-bold text-rose-600">{stopRecomendado.toLocaleString("pt-BR")} pts</span>
              </div>
              {ajusteStop ? (
                <div className="mt-3 text-xs font-bold text-amber-700 bg-amber-50 p-2 rounded border border-amber-200 flex items-center justify-between">
                  <span>{ajusteStop}</span>
                  <span className="text-amber-500 flex items-center">
                    {(direction === "LONG" && stopRecomendado > stopInicial) ? "▲" : "▼"} {Math.abs(stopRecomendado - stopInicial)} pts
                  </span>
                </div>
              ) : (
                <div className="mt-3 text-xs text-zinc-400 font-mono">Nenhum ajuste necessário no Stop Loss.</div>
              )}
            </div>

            <div className="bg-zinc-50 rounded p-4 border border-zinc-200">
              <h4 className="text-xs font-bold text-emerald-600 uppercase mb-2 flex items-center gap-2 font-mono">
                <Target className="h-4 w-4" /> Take Profit (Alvo)
              </h4>
              <div className="flex justify-between items-center text-sm font-mono mt-3">
                <span className="text-zinc-500">Alvo Inicial (Fixo):</span>
                <span className="font-bold text-zinc-800">{alvoInicial.toLocaleString("pt-BR")} pts</span>
              </div>
              <div className="flex justify-between items-center text-sm font-mono mt-1">
                <span className="text-zinc-500">Alvo Recomendado (Banda):</span>
                <span className="font-bold text-emerald-600">{alvoRecomendado.toLocaleString("pt-BR")} pts</span>
              </div>
              {ajusteAlvo ? (
                <div className="mt-3 text-xs font-bold text-amber-700 bg-amber-50 p-2 rounded border border-amber-200 flex items-center justify-between">
                  <span>{ajusteAlvo}</span>
                  <span className="text-amber-500 flex items-center">
                    {(direction === "LONG" && alvoRecomendado > alvoInicial) ? "▲" : "▼"} {Math.abs(alvoRecomendado - alvoInicial)} pts
                  </span>
                </div>
              ) : (
                <div className="mt-3 text-xs text-zinc-400 font-mono">Nenhum ajuste necessário no Alvo.</div>
              )}
            </div>
          </div>
        </section>
      )}

      {/* Card de Entrada (Somente se não houver posição ativa) */}
      {!hasActivePosition && (
        <section className="bg-white border border-zinc-200 rounded-lg p-6 shadow-xs">
          <div className="mb-4 pb-3 border-b border-zinc-150 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-zinc-900 uppercase tracking-wider font-mono">Sinal de Entrada Estratégica (WIN)</h2>
              <p className="text-xs text-zinc-400">Direcionamento operacional com base no alinhamento de KAMA, RSI e Kalman</p>
            </div>
            <span className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono ${
              modelSignal !== "CAIXA" ? "bg-emerald-100 text-emerald-800 border border-emerald-200" : "bg-zinc-100 text-zinc-650 border border-zinc-200"
            }`}>
              {modelSignal !== "CAIXA" ? "ENTRADA RECOMENDADA" : "MANTER NEUTRO"}
            </span>
          </div>

          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="flex-1">
              <span className="text-xs text-zinc-500 font-medium">Direcionamento Estratégico</span>
              <h4 className="text-lg font-bold text-zinc-900 font-mono mt-0.5">
                {modelSignal === "COMPRA" ? "INICIAR POSIÇÃO COMPRADA (LONG)" : modelSignal === "VENDA" ? "INICIAR POSIÇÃO VENDIDA (SHORT)" : "NEUTRO / AGUARDAR FORA DO MERCADO"}
              </h4>
              <p className="text-xs text-zinc-650 mt-1 leading-relaxed">
                {modelSignal === "COMPRA" 
                  ? `Alinhamento altista detectado com score de ${totalScore > 0 ? "+" : ""}${totalScore} pts. Entrar comprado em WIN a mercado.` 
                  : modelSignal === "VENDA"
                  ? `Alinhamento baixista detectado com score de ${totalScore} pts. Entrar vendido em WIN a mercado.`
                  : blockReason || "Sinais quantitativos divergentes. Aguardar alinhamento para evitar falsos rompimentos."}
              </p>
            </div>

            <div className="flex-shrink-0 md:w-80 p-4 rounded-lg bg-zinc-50 border border-zinc-200">
              <span className="text-[10px] uppercase font-bold text-zinc-400 tracking-wider font-mono block mb-2">Setup Sugerido</span>
              {modelSignal !== "CAIXA" ? (
                <ul className="space-y-2 font-mono text-xs">
                  <li className="flex items-center justify-between gap-2 border-b border-zinc-150 pb-1.5 last:border-b-0 last:pb-0">
                    <span className={`font-bold ${modelSignal === "COMPRA" ? "text-emerald-600" : "text-rose-600"}`}>
                      {modelSignal === "COMPRA" ? "COMPRA" : "VENDA"}
                    </span>
                    <span className="font-bold text-zinc-900">{winTicker}</span>
                    <span className="text-zinc-500">{contractsSize} Contratos</span>
                  </li>
                  <li className="flex items-center justify-between gap-2 border-b border-zinc-150 pb-1.5 last:border-b-0 last:pb-0">
                    <span className="text-zinc-400">STOP LOSS:</span>
                    <span className="text-rose-600 font-bold">{stopInicial.toLocaleString("pt-BR")} pts</span>
                  </li>
                  <li className="flex items-center justify-between gap-2 border-b border-zinc-150 pb-1.5 last:border-b-0 last:pb-0">
                    <span className="text-zinc-400">ALVO (TP):</span>
                    <span className="text-emerald-600 font-bold">{alvoInicial.toLocaleString("pt-BR")} pts</span>
                  </li>
                </ul>
              ) : (
                <span className="text-xs text-zinc-400 font-mono">Nenhuma entrada recomendada ativa no momento.</span>
              )}
            </div>
          </div>
        </section>
      )}

      {/* Tabela de Posicionamento Unificada */}
      <section className="bg-white border border-zinc-200 rounded-lg p-6 shadow-xs">
        <div className="mb-6 pb-3 border-b border-zinc-150 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-zinc-900 uppercase tracking-wider font-mono">Posicionamento Detalhado do Mini Índice (WIN)</h2>
            <p className="text-xs text-zinc-400">Detalhamento dos alvos, stops e cotações correntes do modelo</p>
          </div>
          <span className="px-2 py-0.5 rounded text-[10px] font-bold font-mono bg-zinc-100 text-zinc-650 border border-zinc-200">
            CUSTÓDIA EM TEMPO REAL
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
                <th scope="col" className="px-6 py-4 font-bold text-right text-rose-600">Stop Recomendado</th>
                <th scope="col" className="px-6 py-4 font-bold text-right text-emerald-600">Alvo Recomendado</th>
                <th scope="col" className="px-6 py-4 font-bold text-right text-zinc-900">PnL Real-Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-150">
              {hasActivePosition ? (
                <tr className="hover:bg-zinc-50/50 transition-all font-mono">
                  <td className="px-6 py-4 font-bold text-zinc-950">{winTicker}</td>
                  <td className={`px-6 py-4 text-xs font-bold font-sans ${direction === "LONG" ? "text-emerald-600" : "text-rose-600"}`}>
                    {direction === "LONG" ? "COMPRADO (LONG)" : "VENDIDO (SHORT)"}
                  </td>
                  <td className="px-6 py-4 text-right font-bold text-zinc-800">{contractsSize} Contratos</td>
                  <td className="px-6 py-4 text-right">{entryPrice.toLocaleString("pt-BR")} pts</td>
                  <td className="px-6 py-4 text-right font-bold text-zinc-900 bg-zinc-50/70">{currentPrice.toLocaleString("pt-BR")} pts</td>
                  <td className="px-6 py-4 text-right text-rose-600 font-bold">
                    {stopRecomendado.toLocaleString("pt-BR")} pts
                    {ajusteStop && <span className="block text-[10px] text-amber-500 mt-1">AJUSTAR!</span>}
                  </td>
                  <td className="px-6 py-4 text-right text-emerald-600 font-bold">
                    {alvoRecomendado.toLocaleString("pt-BR")} pts
                    {ajusteAlvo && <span className="block text-[10px] text-amber-500 mt-1">AJUSTAR!</span>}
                  </td>
                  <td className={`px-6 py-4 text-right font-bold ${pnlFinanceiro >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                    {pnlFinanceiro >= 0 ? "+" : ""}R$ {pnlFinanceiro.toLocaleString("pt-BR", {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                  </td>
                </tr>
              ) : (
                <tr>
                  <td colSpan={8} className="px-6 py-8 text-center text-zinc-400 font-mono text-xs">
                    Nenhuma operação em andamento identificada na custódia (Regime Neutro).
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
      </>
      ) : (
        <div className="space-y-8 animate-in fade-in duration-300">
          {!winIntradayState ? (
            <div className="bg-white border border-zinc-200 rounded-lg p-12 text-center shadow-xs">
              <div className="inline-flex items-center justify-center p-3 rounded-full bg-amber-50 text-amber-600 mb-4 animate-bounce">
                <Sliders className="h-6 w-6" />
              </div>
              <h3 className="text-sm font-bold uppercase tracking-wider text-zinc-850 font-mono mb-2">Aguardando Conexão MetaTrader 5</h3>
              <p className="text-xs text-zinc-500 max-w-md mx-auto leading-relaxed">
                Por favor, execute o script de monitoramento no seu terminal local para atualizar as cotações:
                <code className="block bg-zinc-50 border border-zinc-200 p-2.5 rounded font-mono text-[10px] text-rose-600 mt-2">
                  python win_intraday_monitor.py
                </code>
                Isso iniciará o processamento em tempo real dos candles de 5 minutos do contrato ativo do WINQ26.
              </p>
            </div>
          ) : (
            <>
              {/* Três Cards Intraday */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                
                {/* Card 1: Estado da Posição */}
                <div className="bg-white border border-zinc-200 rounded-lg p-6 shadow-xs flex flex-col justify-between animate-in fade-in duration-300">
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-2 mb-3 font-mono">
                      <Target className="h-4 w-4 text-zinc-500" /> SINAL DO MODELO (M5)
                    </h3>
                    <span className="text-zinc-500 text-xs font-medium">Recomendação Operacional</span>
                    <div className={`text-3xl font-black tracking-tight mt-1 flex items-baseline gap-2 font-mono ${
                      winIntradayState.signal_state.includes("SHORT") ? "text-rose-650" : "text-zinc-500"
                    }`}>
                      {winIntradayState.signal_state}
                    </div>
                  </div>
                  <div className="text-[10px] text-zinc-500 mt-4 border-t border-zinc-150 pt-3 flex flex-col gap-1.5 font-mono">
                    {winIntradayState.active_position ? (
                      <>
                        <div className="flex justify-between">
                          <span>Preço Entrada:</span>
                          <span className="font-bold text-zinc-900">{winIntradayState.active_position.entry_price.toLocaleString("pt-BR")} pts</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Stop Loss:</span>
                          <span className="font-bold text-rose-600">{winIntradayState.active_position.stop_loss.toLocaleString("pt-BR")} pts</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Parcial (TP1):</span>
                          <span className={`font-bold ${winIntradayState.active_position.has_taken_partial ? "text-emerald-600 line-through" : "text-zinc-700"}`}>
                            {winIntradayState.active_position.tp1.toLocaleString("pt-BR")} pts
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span>Alvo Final (TP2):</span>
                          <span className="font-bold text-emerald-600">{winIntradayState.active_position.tp2.toLocaleString("pt-BR")} pts</span>
                        </div>
                      </>
                    ) : (
                      <span>Aguardando exaustão em topo duplo para acionar SHORT.</span>
                    )}
                  </div>
                </div>

                {/* Card 2: Indicadores Real-Time */}
                <div className="bg-white border border-zinc-200 rounded-lg p-6 shadow-xs flex flex-col justify-between animate-in fade-in duration-300">
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-2 mb-3 font-mono">
                      <Activity className="h-4 w-4 text-zinc-500" /> COTAÇÃO & INDICADORES
                    </h3>
                    <span className="text-zinc-500 text-xs font-medium">Preço de tela do WINQ26</span>
                    <div className="text-3xl font-black tracking-tight mt-1 flex items-baseline gap-2 font-mono text-zinc-950">
                      {winIntradayState.last_price.toLocaleString("pt-BR")} pts
                      <span className="text-xs font-bold text-zinc-400 font-sans">({winIntradayState.last_time})</span>
                    </div>
                  </div>
                  <div className="text-[10px] text-zinc-500 mt-4 border-t border-zinc-150 pt-3 flex flex-col gap-1.5 font-mono">
                    <div className="flex justify-between">
                      <span>VWAP do dia:</span>
                      <span className="font-bold text-zinc-800">{winIntradayState.vwap.toLocaleString("pt-BR")} pts</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Z-Score VWAP:</span>
                      <span className={`font-bold ${
                        Math.abs(winIntradayState.zscore) >= 2.0 ? "text-rose-500 animate-pulse font-extrabold" : "text-zinc-800"
                      }`}>{winIntradayState.zscore.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>RSI (2):</span>
                      <span className="font-bold text-zinc-800">{winIntradayState.rsi2.toFixed(1)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Kalman Price:</span>
                      <span className="font-bold text-zinc-800">{winIntradayState.kalman.toLocaleString("pt-BR")} pts</span>
                    </div>
                  </div>
                </div>

                {/* Card 3: Topos Duplos */}
                <div className="bg-white border border-zinc-200 rounded-lg p-6 shadow-xs flex flex-col justify-between animate-in fade-in duration-300">
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-2 mb-3 font-mono">
                      <TrendingUp className="h-4 w-4 text-zinc-500" /> RESISTÊNCIAS RECENTES (PEAKS)
                    </h3>
                    <span className="text-zinc-500 text-xs font-medium">Exaustão no dia</span>
                    <div className="mt-3 space-y-2">
                      {winIntradayState.recent_peaks && winIntradayState.recent_peaks.length > 0 ? (
                        winIntradayState.recent_peaks.map((p: any, idx: number) => (
                          <div key={idx} className="flex justify-between text-xs font-mono border-b border-zinc-100 pb-1.5 last:border-b-0 last:pb-0">
                            <span className="text-zinc-400">Pico às {p.time}:</span>
                            <span className="font-bold text-zinc-800">{p.price.toLocaleString("pt-BR")} pts</span>
                          </div>
                        ))
                      ) : (
                        <div className="text-xs text-zinc-400 font-mono py-1">Nenhuma resistência detectada ainda hoje.</div>
                      )}
                    </div>
                  </div>
                  <p className="text-[10px] text-zinc-400 mt-4 border-t border-zinc-150 pt-3">
                    As resistências são calculadas buscando máximas locais no M5 coincidentes com desvio alto da VWAP.
                  </p>
                </div>
              </div>

              {/* Painel de Projeção Intraday (Hedge Fund Mindset) */}
              {winIntradayState.projection && (
                <div className="bg-white border border-zinc-200 rounded-lg p-6 shadow-xs border-l-4 border-l-zinc-950 animate-in fade-in duration-300">
                  <div className="mb-4 pb-2 border-b border-zinc-150 flex items-center justify-between">
                    <div>
                      <h2 className="text-sm font-bold text-zinc-900 uppercase tracking-wider font-mono">Projeção Estatística de Preço (Intraday Forecast)</h2>
                      <p className="text-xs text-zinc-400">Modelagem quantitativa baseada em desvios de VWAP e momentum do Filtro de Kalman</p>
                    </div>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold font-mono bg-zinc-100 text-zinc-650 border border-zinc-200">
                      FORECAST MODEL
                    </span>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                    <div className="bg-zinc-50 p-4 rounded border border-zinc-150">
                      <span className="text-[10px] uppercase font-bold text-zinc-400 tracking-wider font-mono block">Direção Esperada</span>
                      <span className={`text-sm font-extrabold font-mono block mt-1 ${
                        winIntradayState.projection.expected_direction.includes("QUEDA") 
                          ? "text-rose-600" 
                          : winIntradayState.projection.expected_direction.includes("ALTA") 
                            ? "text-emerald-600" 
                            : "text-zinc-600"
                      }`}>
                        {winIntradayState.projection.expected_direction}
                      </span>
                    </div>

                    <div className="bg-zinc-50 p-4 rounded border border-zinc-150">
                      <span className="text-[10px] uppercase font-bold text-zinc-400 tracking-wider font-mono block">Alvo Projetado</span>
                      <span className="text-sm font-extrabold font-mono text-zinc-900 block mt-1">
                        {winIntradayState.projection.projected_target.toLocaleString("pt-BR", {maximumFractionDigits: 0})} pts
                      </span>
                    </div>

                    <div className="bg-zinc-50 p-4 rounded border border-zinc-150">
                      <span className="text-[10px] uppercase font-bold text-zinc-400 tracking-wider font-mono block">Canal de Volatilidade (M5)</span>
                      <span className="text-[10px] font-mono text-zinc-600 block mt-1 leading-normal">
                        Teto (+2 SD): <b className="text-rose-500 font-bold">{winIntradayState.projection.projected_ceiling.toLocaleString("pt-BR", {maximumFractionDigits: 0})} pts</b>
                        <br />
                        Piso (-2 SD): <b className="text-emerald-500 font-bold">{winIntradayState.projection.projected_floor.toLocaleString("pt-BR", {maximumFractionDigits: 0})} pts</b>
                      </span>
                    </div>

                    <div className="bg-zinc-50 p-4 rounded border border-zinc-150">
                      <span className="text-[10px] uppercase font-bold text-zinc-400 tracking-wider font-mono block">Confiança / Volatilidade</span>
                      <span className="text-sm font-extrabold font-mono text-zinc-900 block mt-1">
                        {winIntradayState.projection.probability}
                      </span>
                    </div>
                  </div>
                  
                  <p className="text-[11px] text-zinc-500 font-mono mt-4 leading-relaxed bg-zinc-50/50 p-3 rounded border border-zinc-100">
                    💡 <b>Análise de Cenário:</b> {winIntradayState.projection.description}
                  </p>
                </div>
              )}

              {/* Gráfico Intraday Recharts */}
              <section className="bg-white border border-zinc-200 rounded-lg p-6 shadow-xs">
                <div className="mb-6 pb-3 border-b border-zinc-150">
                  <h2 className="text-sm font-bold text-zinc-900 uppercase tracking-wider font-mono">Gráfico Real-Time WINQ26 (5 Minutos)</h2>
                  <p className="text-xs text-zinc-400">Preços, VWAP Bands e Kalman Filter diretamente do MetaTrader 5</p>
                </div>
                <div className="h-96 w-full font-mono text-xs">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={winIntradayState.chart_data} margin={{ top: 10, right: 30, left: 20, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f4f4f5" />
                      <XAxis dataKey="time" stroke="#a1a1aa" fontSize={10} />
                      <YAxis domain={['auto', 'auto']} stroke="#a1a1aa" fontSize={10} tickFormatter={(v) => v.toLocaleString("pt-BR")} />
                      <Tooltip formatter={(value: any) => value.toLocaleString("pt-BR")} labelStyle={{ fontWeight: "bold" }} />
                      <Line type="monotone" dataKey="close" stroke="#09090b" strokeWidth={2.5} dot={false} name="Preço Close" />
                      <Line type="monotone" dataKey="vwap" stroke="#f97316" strokeWidth={1.5} strokeDasharray="5 5" dot={false} name="VWAP" />
                      <Line type="monotone" dataKey="upper_2" stroke="#ef4444" strokeWidth={1} strokeDasharray="3 3" dot={false} name="VWAP +2.0 SD (Res.)" />
                      <Line type="monotone" dataKey="lower_2" stroke="#10b981" strokeWidth={1} strokeDasharray="3 3" dot={false} name="VWAP -2.0 SD (Suporte)" />
                      <Line type="monotone" dataKey="kalman" stroke="#8b5cf6" strokeWidth={1.5} dot={false} name="Filtro de Kalman" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </section>
            </>
          )}
        </div>
      )}
    </div>
  );
}
