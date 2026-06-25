"use client";

import React, { useState } from "react";
import { 
  TrendingUp, 
  Activity, 
  RefreshCw, 
  AlertCircle, 
  CheckCircle2, 
  Coins, 
  Gauge, 
  HelpCircle,
  Maximize2,
  Calendar,
  Search,
  Check,
  X,
  Sparkles
} from "lucide-react";

interface ScanResult {
  ticker: string;
  preco_atual: number;
  preco_sinal: number;
  z_price: number;
  vol_ratio: number;
  z_volume: number;
  vol_60d: number;
  momentum_3m: number;
  score_quant: number;
  alocacao_sugerida: number;
  data_sinal: string;
  days_ago: number;
  cond_price: boolean;
  cond_vol: boolean;
  cond_vol_z: boolean;
  decisao: "COMPRA" | "HOLD";
  error?: string;
}

export default function StockPickingLongBias() {
  const [isRunning, setIsRunning] = useState(false);
  const [results, setResults] = useState<ScanResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastRun, setLastRun] = useState<string | null>(null);
  const [lookback, setLookback] = useState<number>(5); // Padrão de 5 dias
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [filterType, setFilterType] = useState<"all" | "compra">("all");
  const [selectedTicker, setSelectedTicker] = useState<ScanResult | null>(null);

  // Helper para calcular parâmetros operacionais baseados em volatilidade histórica
  const getTradeSetup = (item: ScanResult) => {
    // Estimativa de desvio padrão diário aproximado com base na vol de 60d
    // vol_diaria = vol_60d / sqrt(252) -> sqrt(252) ≈ 15.87
    const volDiaria = item.vol_60d / 15.87;
    // Risco em % (definimos 2 desvios padrões de stop para conter ruídos diários)
    // Limitado entre 2.5% e 7.5% para proteção e consistência de carteira no Swing Trade
    const riskPercent = Math.max(0.025, Math.min(0.075, 2.0 * volDiaria));
    
    // Se for COMPRA, a entrada recomendada é o preço no sinal.
    // Caso contrário, é o preço atual de D0.
    const entry = item.decisao === "COMPRA" && item.preco_sinal > 0 ? item.preco_sinal : item.preco_atual;
    const stop = entry * (1 - riskPercent);
    const target1 = entry * (1 + 1.5 * riskPercent); // Relação Retorno/Risco de 1.5x
    const target2 = entry * (1 + 3.0 * riskPercent); // Relação Retorno/Risco de 3x (Alvo Final)
    
    return {
      volDiaria,
      riskPercent,
      entry,
      stop,
      target1,
      target2
    };
  };

  const handleRunScan = async () => {
    setIsRunning(true);
    setError(null);
    try {
      const response = await fetch(`/api/stock-picking?lookback=${lookback}`);
      if (!response.ok) {
        throw new Error("Erro na resposta do servidor.");
      }
      const data = await response.json();
      if (data.success) {
        const newResults = data.data || [];
        setResults(newResults);
        
        // Tentar manter a seleção do ticker ou selecionar o primeiro sinal de compra por padrão
        if (selectedTicker) {
          const match = newResults.find((r: ScanResult) => r.ticker === selectedTicker.ticker);
          if (match) {
            setSelectedTicker(match);
          } else {
            setSelectedTicker(null);
          }
        } else {
          const firstCompra = newResults.find((r: ScanResult) => r.decisao === "COMPRA");
          if (firstCompra) setSelectedTicker(firstCompra);
        }
        
        setLastRun(new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
      } else {
        throw new Error(data.error || "Erro ao processar varredura.");
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Erro desconhecido ao executar varredura.");
    } finally {
      setIsRunning(false);
    }
  };

  // Carregar dados automaticamente no mount e quando mudar a janela lookback
  React.useEffect(() => {
    handleRunScan();
  }, [lookback]);

  // Filtragem dos dados
  const processedResults = results ? results.filter(item => {
    const matchesSearch = item.ticker.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFilter = filterType === "all" ? true : item.decisao === "COMPRA";
    return matchesSearch && matchesFilter;
  }) : [];

  const compraCount = results ? results.filter(r => r.decisao === "COMPRA").length : 0;

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      
      {/* Header and Control Card */}
      <section className="bg-white border border-zinc-200 rounded-lg p-6 shadow-xs">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div className="flex-1">
            <h2 className="text-sm font-bold text-zinc-900 uppercase tracking-wider font-mono flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-zinc-800" /> STOCK PICKING LONG BIAS
            </h2>
            <p className="text-xs text-zinc-500 mt-1 leading-relaxed">
              Varredura de <i>Squeeze Breakout</i> no universo IBRX100. Seleciona ativos rompendo volatilidade para iniciar tendência de alta.
            </p>
          </div>

          <div className="flex-shrink-0 flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full md:w-auto">
            <div className="flex items-center gap-2 border border-zinc-200 rounded px-3 py-1.5 bg-zinc-50 font-mono text-xs font-bold text-zinc-700">
              <Calendar className="h-3.5 w-3.5 text-zinc-400" />
              <span>Últimos 5 dias úteis</span>
            </div>

            <button
              onClick={handleRunScan}
              disabled={isRunning}
              className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded text-xs font-bold uppercase tracking-wider transition-all border font-mono cursor-pointer shadow-xs ${
                isRunning 
                  ? "bg-zinc-100 text-zinc-400 border-zinc-200 cursor-not-allowed" 
                  : "bg-zinc-900 text-white border-zinc-900 hover:bg-zinc-800 hover:border-zinc-800"
              }`}
            >
              {isRunning ? (
                <>
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  Varrendo Mercado...
                </>
              ) : (
                <>
                  <Activity className="h-3.5 w-3.5" />
                  Executar Varredura Quantitativa
                </>
              )}
            </button>
          </div>
        </div>

        {/* Error message */}
        {error && (
          <div className="mt-4 p-4 bg-rose-50 border border-rose-200 rounded flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-rose-600 mt-0.5 flex-shrink-0" />
            <div>
              <h4 className="text-xs font-bold text-rose-800 font-mono">Falha no processamento quantitativo</h4>
              <p className="text-xs text-rose-650 mt-0.5 font-mono">{error}</p>
            </div>
          </div>
        )}
      </section>

      {/* Loading Spinner Section */}
      {isRunning && (
        <div className="bg-white border border-zinc-200 rounded-lg p-12 shadow-xs text-center flex flex-col items-center justify-center space-y-4 animate-pulse">
          <RefreshCw className="h-10 w-10 text-zinc-800 animate-spin" />
          <div>
            <h3 className="text-sm font-bold text-zinc-900 font-mono">Executando Algoritmo de Varredura</h3>
            <p className="text-xs text-zinc-400 mt-1 max-w-md mx-auto">
              Baixando histórico de 1 ano via Yahoo Finance para os 99 ativos do IBRX100 e rodando filtros quantitativos em paralelo... (tempo estimado ~10-15s)
            </p>
          </div>
          <div className="w-48 h-1.5 bg-zinc-100 rounded-full overflow-hidden mx-auto mt-2">
            <div className="h-full bg-zinc-900 rounded-full animate-progress animate-pulse" style={{ width: "70%" }}></div>
          </div>
        </div>
      )}

      {/* Results Section */}
      {!isRunning && results !== null && (
        <section className="bg-white border border-zinc-200 rounded-lg p-6 shadow-xs">
          
          {/* Controls Bar inside Results */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 pb-5 border-b border-zinc-150">
            <div>
              <h3 className="text-sm font-bold text-zinc-900 uppercase tracking-wider font-mono flex items-center gap-2">
                <Sparkles className="h-4.5 w-4.5 text-zinc-800" /> GRADE DE MONITORAMENTO QUANTITATIVO ({compraCount} COMPRA / {results.length} Tickers)
              </h3>
              <p className="text-xs text-zinc-400 font-mono mt-0.5">Selecione uma ação na tabela abaixo para abrir os detalhes operacionais e pontos de entrada/saída.</p>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              {/* Search Box */}
              <div className="flex items-center gap-2 border border-zinc-200 rounded px-2.5 py-1.5 bg-zinc-50 w-full sm:w-48">
                <Search className="h-3.5 w-3.5 text-zinc-400" />
                <input
                  type="text"
                  placeholder="Buscar Ticker..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="text-xs font-mono text-zinc-700 bg-transparent border-none focus:outline-none w-full"
                />
              </div>

              {/* Toggles */}
              <div className="flex rounded border border-zinc-200 p-0.5 bg-zinc-100">
                <button
                  onClick={() => setFilterType("all")}
                  className={`px-3 py-1 rounded text-xs font-bold font-mono transition-all cursor-pointer ${
                    filterType === "all"
                      ? "bg-white text-zinc-900 shadow-xs"
                      : "text-zinc-500 hover:text-zinc-700"
                  }`}
                >
                  Ver Todos
                </button>
                <button
                  onClick={() => setFilterType("compra")}
                  className={`px-3 py-1 rounded text-xs font-bold font-mono transition-all cursor-pointer flex items-center gap-1 ${
                    filterType === "compra"
                      ? "bg-emerald-600 text-white shadow-xs font-bold"
                      : "text-zinc-500 hover:text-emerald-600"
                  }`}
                >
                  Comunicação Compra ({compraCount})
                </button>
              </div>
            </div>
          </div>

          {/* Active Stock Detail Panel */}
          {selectedTicker && (() => {
            const setup = getTradeSetup(selectedTicker);
            return (
              <div className="mb-8 p-6 bg-zinc-950 text-white rounded-lg border border-zinc-800 animate-in slide-in-from-top-4 duration-300">
                <div className="flex justify-between items-start gap-4 border-b border-zinc-800 pb-4 mb-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="text-xl font-mono font-black text-white tracking-tight">{selectedTicker.ticker}</h4>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono tracking-wider ${
                        selectedTicker.decisao === "COMPRA" 
                          ? "bg-emerald-500 text-zinc-955 font-bold" 
                          : "bg-zinc-800 text-zinc-450"
                      }`}>
                        {selectedTicker.decisao === "COMPRA" ? "COMPRA ATIVA (SQUEEZE BREAKOUT)" : "HOLD (AGUARDANDO SINAL)"}
                      </span>
                      {selectedTicker.alocacao_sugerida > 0 && (
                        <span className="bg-zinc-900 border border-zinc-800 px-2.5 py-0.5 rounded text-[10px] font-bold font-mono text-emerald-400">
                          Alocação Risk Parity: {selectedTicker.alocacao_sugerida.toFixed(2)}%
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-zinc-400 mt-1 font-mono">
                      {selectedTicker.decisao === "COMPRA" 
                        ? `Gatilho quantitativo ativado em ${selectedTicker.data_sinal} (há ${selectedTicker.days_ago} dias úteis)`
                        : `Métricas atuais baseadas no fechamento de hoje`}
                    </p>
                  </div>
                  <button 
                    onClick={() => setSelectedTicker(null)} 
                    className="p-1 hover:bg-zinc-800 rounded text-zinc-400 hover:text-white transition-all cursor-pointer"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {/* Column 1: Trade Setup & Targets */}
                  <div className="bg-zinc-900/60 rounded-md p-4 border border-zinc-850 space-y-4">
                    <h5 className="text-xs font-bold uppercase tracking-wider text-zinc-400 font-mono flex items-center gap-1.5">
                      <TrendingUp className="h-3.5 w-3.5 text-emerald-400" /> PLANO OPERACIONAL (SWING TRADE)
                    </h5>
                    
                    <div className="grid grid-cols-2 gap-3 text-xs font-mono">
                      <div className="p-2.5 bg-zinc-950 border border-zinc-850 rounded">
                        <span className="block text-[9px] text-zinc-500 font-bold uppercase">Entrada Recomendada</span>
                        <span className="text-sm font-black text-white mt-1 block">
                          R$ {setup.entry.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                        <span className="text-[9px] text-zinc-400 block mt-0.5">
                          {selectedTicker.decisao === "COMPRA" ? "Preço do Sinal" : "Preço Atual"}
                        </span>
                      </div>
                      <div className="p-2.5 bg-zinc-950 border border-zinc-850 rounded">
                        <span className="block text-[9px] text-zinc-500 font-bold uppercase">Stop Loss Técnico</span>
                        <span className="text-sm font-black text-rose-500 mt-1 block">
                          R$ {setup.stop.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                        <span className="text-[9px] text-rose-400 font-bold">-{ (setup.riskPercent * 100).toFixed(1) }% (2x Vol Diária)</span>
                      </div>
                      <div className="p-2.5 bg-zinc-950 border border-zinc-850 rounded">
                        <span className="block text-[9px] text-zinc-500 font-bold uppercase">Alvo 1 (Parcial 1.5x)</span>
                        <span className="text-sm font-black text-emerald-400 mt-1 block">
                          R$ {setup.target1.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                        <span className="text-[9px] text-emerald-400 font-bold">+{ (setup.riskPercent * 1.5 * 100).toFixed(1) }%</span>
                      </div>
                      <div className="p-2.5 bg-zinc-950 border border-zinc-850 rounded">
                        <span className="block text-[9px] text-zinc-500 font-bold uppercase">Alvo 2 (Final 3.0x)</span>
                        <span className="text-sm font-black text-emerald-350 mt-1 block">
                          R$ {setup.target2.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                        <span className="text-[9px] text-emerald-350 font-bold">+{ (setup.riskPercent * 3.0 * 100).toFixed(1) }%</span>
                      </div>
                    </div>
                  </div>

                  {/* Column 2: Quant Indicators */}
                  <div className="bg-zinc-900/60 rounded-md p-4 border border-zinc-850 space-y-3.5">
                    <h5 className="text-xs font-bold uppercase tracking-wider text-zinc-400 font-mono flex items-center gap-1.5">
                      <Gauge className="h-3.5 w-3.5 text-zinc-400" /> STATUS DOS FILTROS SWING TRADE
                    </h5>
                    
                    <div className="space-y-2 text-xs font-mono">
                      {/* Z-Price */}
                      <div className="flex justify-between items-center p-2.5 bg-zinc-950/70 rounded border border-zinc-850">
                        <div>
                          <span className="font-bold text-zinc-200">1. Z-Score Preço (20d)</span>
                          <span className="block text-[9px] text-zinc-500">Gatilho: Romper 1.0 (MMA20)</span>
                        </div>
                        <div className="text-right">
                          <span className={`font-black ${selectedTicker.z_price > 1.0 ? "text-emerald-400" : "text-zinc-500"}`}>
                            {selectedTicker.z_price.toFixed(2)}
                          </span>
                          <span className={`block text-[9px] font-bold ${selectedTicker.cond_price ? "text-emerald-500" : "text-zinc-500"}`}>
                            {selectedTicker.cond_price ? "CROSS UP" : "HOLD"}
                          </span>
                        </div>
                      </div>

                      {/* Vol Ratio */}
                      <div className="flex justify-between items-center p-2.5 bg-zinc-950/70 rounded border border-zinc-850">
                        <div>
                          <span className="font-bold text-zinc-200">2. Vol Ratio (5d/20d)</span>
                          <span className="block text-[9px] text-zinc-500">Gatilho: Ratio &gt; 1.05</span>
                        </div>
                        <div className="text-right">
                          <span className={`font-black ${selectedTicker.vol_ratio > 1.05 ? "text-emerald-400" : "text-zinc-500"}`}>
                            {selectedTicker.vol_ratio.toFixed(2)}
                          </span>
                          <span className={`block text-[9px] font-bold ${selectedTicker.vol_ratio > 1.05 ? "text-emerald-500" : "text-zinc-500"}`}>
                            {selectedTicker.vol_ratio > 1.05 ? "EXPANSÃO" : "COMPRESSÃO"}
                          </span>
                        </div>
                      </div>

                      {/* Z-Volume */}
                      <div className="flex justify-between items-center p-2.5 bg-zinc-950/70 rounded border border-zinc-850">
                        <div>
                          <span className="font-bold text-zinc-200">3. Z-Score Volume (20d)</span>
                          <span className="block text-[9px] text-zinc-500">Gatilho: Fluxo &gt; 0.8 desvios</span>
                        </div>
                        <div className="text-right">
                          <span className={`font-black ${selectedTicker.z_volume > 0.8 ? "text-emerald-400" : "text-zinc-500"}`}>
                            {selectedTicker.z_volume.toFixed(2)}
                          </span>
                          <span className={`block text-[9px] font-bold ${selectedTicker.z_volume > 0.8 ? "text-emerald-500" : "text-zinc-500"}`}>
                            {selectedTicker.z_volume > 0.8 ? "FLUXO" : "NORMAL"}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Column 3: Synthesized Analysis */}
                  <div className="bg-zinc-900/60 rounded-md p-4 border border-zinc-850 flex flex-col justify-between">
                    <div>
                      <h5 className="text-xs font-bold uppercase tracking-wider text-zinc-400 font-mono flex items-center gap-1.5 mb-2.5">
                        <Activity className="h-3.5 w-3.5 text-zinc-400" /> SÍNTESE DA ANÁLISE QUANT
                      </h5>
                      <p className="text-xs text-zinc-300 leading-relaxed font-sans">
                        {selectedTicker.decisao === "COMPRA" ? (
                          <>
                            O ativo <strong>{selectedTicker.ticker}</strong> ativou um setup de <strong>Squeeze Breakout</strong> com reparametrização rápida para Swing Trade. Apresenta aceleração no preço (Z-Price &gt; 1.0) acompanhado por expansão imediata da volatilidade curta de 5 dias em relação à de 20 dias, validada por pico de volume comprador. Entrada favorável próximo a R$ {setup.entry.toFixed(2)}.
                          </>
                        ) : (
                          <>
                            Ação <strong>{selectedTicker.ticker}</strong> em modo de espera. Não preenche os requisitos quantitativos de gatilho simultâneo. Momentum de 3 meses de {selectedTicker.momentum_3m.toFixed(2)}% com volatilidade histórica anualizada de {(selectedTicker.vol_60d * 100).toFixed(1)}%. Sugere-se acompanhar até rompimento da média móvel curta.
                          </>
                        )}
                      </p>
                    </div>

                    <div className="mt-4 pt-3 border-t border-zinc-800 flex justify-between items-center text-[10px] font-mono text-zinc-500">
                      <span>Vol Anualizada: {(selectedTicker.vol_60d * 100).toFixed(1)}%</span>
                      <span>Score Quant: {selectedTicker.score_quant.toFixed(3)}</span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}

          {processedResults.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left text-zinc-500">
                <thead className="text-[10px] uppercase tracking-wider text-zinc-400 bg-zinc-50 border-b border-zinc-250 font-mono">
                  <tr>
                    <th scope="col" className="px-4 py-4 font-bold text-zinc-900">Ticker</th>
                    <th scope="col" className="px-4 py-4 font-bold text-center">Data / Janela</th>
                    <th scope="col" className="px-4 py-4 font-bold text-right text-zinc-900">Preço Sinal</th>
                    <th scope="col" className="px-4 py-4 font-bold text-center">1. Z-Price (&gt;1.0)</th>
                    <th scope="col" className="px-4 py-4 font-bold text-center">2. Vol Ratio (&gt;1.05)</th>
                    <th scope="col" className="px-4 py-4 font-bold text-center">3. Z-Volume (&gt;0.8)</th>
                    <th scope="col" className="px-4 py-4 font-bold text-right">Momentum 3M</th>
                    <th scope="col" className="px-4 py-4 font-bold text-center text-zinc-900">Decisão Final</th>
                    <th scope="col" className="px-4 py-4 font-bold text-right text-emerald-600">Alocação</th>
                    <th scope="col" className="px-4 py-4 font-bold text-right text-zinc-900">Score Quant</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-150">
                  {processedResults.map((item) => (
                    <tr 
                      key={item.ticker} 
                      onClick={() => setSelectedTicker(item)}
                      className={`hover:bg-zinc-100 transition-all font-mono cursor-pointer ${
                        selectedTicker?.ticker === item.ticker
                          ? "bg-zinc-100 border-l-4 border-l-zinc-900"
                          : item.decisao === "COMPRA" 
                            ? "bg-emerald-50/15 border-l-4 border-l-emerald-500" 
                            : ""
                      }`}
                    >
                      <td className="px-4 py-4 font-bold text-zinc-955 text-base">{item.ticker}</td>
                      <td className="px-4 py-4 text-center">
                        {item.preco_atual > 0 ? (
                          <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${
                            item.decisao === "COMPRA"
                              ? item.days_ago === 0 
                                ? "bg-emerald-100 text-emerald-800 border border-emerald-200 font-bold" 
                                : "bg-emerald-50 text-emerald-700 border border-emerald-100"
                              : "bg-zinc-100 text-zinc-400"
                          }`}>
                            {item.decisao === "COMPRA" 
                              ? item.days_ago === 0 
                                ? "Hoje" 
                                : `${item.data_sinal} (${item.days_ago}d)` 
                              : "D0 (Fechamento)"}
                          </span>
                        ) : (
                          <span className="text-[10px] px-1.5 py-0.5 rounded font-mono bg-rose-50 text-rose-700 border border-rose-100 font-bold" title={item.error || "Sem dados do Yahoo Finance"}>
                            Falha Yahoo
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-4 text-right font-bold text-zinc-900">
                        {item.preco_atual > 0 
                          ? `R$ ${item.preco_atual.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                          : "N/A"}
                      </td>
                      
                      {/* Z-Price Indicator */}
                      <td className="px-4 py-4 text-center">
                        <div className="flex flex-col items-center">
                          <span className={`text-xs font-bold ${item.preco_atual > 0 && item.z_price > 1.0 ? "text-emerald-600" : "text-zinc-500"}`}>
                            {item.preco_atual > 0 ? item.z_price.toFixed(2) : "N/A"}
                          </span>
                          <span className={`text-[9px] mt-0.5 px-1 rounded-sm font-bold flex items-center gap-0.5 ${
                            item.preco_atual > 0 && item.cond_price 
                              ? "bg-emerald-100 text-emerald-800" 
                              : "bg-zinc-100 text-zinc-450"
                          }`}>
                            {item.preco_atual > 0 ? (item.cond_price ? <Check className="h-2 w-2" /> : <X className="h-2 w-2" />) : null}
                            {item.preco_atual > 0 ? (item.cond_price ? "CROSS" : "HOLD") : "-"}
                          </span>
                        </div>
                      </td>

                      {/* Vol Ratio Indicator */}
                      <td className="px-4 py-4 text-center">
                        <div className="flex flex-col items-center">
                          <span className={`text-xs font-bold ${item.preco_atual > 0 && item.vol_ratio > 1.05 ? "text-emerald-600" : "text-zinc-500"}`}>
                            {item.preco_atual > 0 ? item.vol_ratio.toFixed(2) : "N/A"}
                          </span>
                          <span className={`text-[9px] mt-0.5 px-1 rounded-sm font-bold flex items-center gap-0.5 ${
                            item.preco_atual > 0 && item.vol_ratio > 1.05
                              ? "bg-emerald-100 text-emerald-800" 
                              : "bg-zinc-100 text-zinc-450"
                          }`}>
                            {item.preco_atual > 0 ? (item.vol_ratio > 1.05 ? <Check className="h-2 w-2" /> : <X className="h-2 w-2" />) : null}
                            {item.preco_atual > 0 ? (item.vol_ratio > 1.05 ? "EXPANSÃO" : "HOLD") : "-"}
                          </span>
                        </div>
                      </td>

                      {/* Z-Volume Indicator */}
                      <td className="px-4 py-4 text-center">
                        <div className="flex flex-col items-center">
                          <span className={`text-xs font-bold ${item.preco_atual > 0 && item.z_volume > 0.8 ? "text-emerald-600" : "text-zinc-500"}`}>
                            {item.preco_atual > 0 ? item.z_volume.toFixed(2) : "N/A"}
                          </span>
                          <span className={`text-[9px] mt-0.5 px-1 rounded-sm font-bold flex items-center gap-0.5 ${
                            item.preco_atual > 0 && item.z_volume > 0.8 
                              ? "bg-emerald-100 text-emerald-800" 
                              : "bg-zinc-100 text-zinc-450"
                          }`}>
                            {item.preco_atual > 0 ? (item.z_volume > 0.8 ? <Check className="h-2 w-2" /> : <X className="h-2 w-2" />) : null}
                            {item.preco_atual > 0 ? (item.z_volume > 0.8 ? "FLUXO" : "HOLD") : "-"}
                          </span>
                        </div>
                      </td>

                      <td className={`px-4 py-4 text-right font-bold ${
                        item.preco_atual > 0 
                          ? (item.momentum_3m >= 0 ? "text-emerald-600" : "text-rose-600")
                          : "text-zinc-455"
                      }`}>
                        {item.preco_atual > 0 
                          ? `${item.momentum_3m >= 0 ? "+" : ""}${item.momentum_3m.toFixed(2)}%`
                          : "N/A"}
                      </td>

                      {/* Decision Column */}
                      <td className="px-4 py-4 text-center">
                        <span className={`inline-block px-3 py-1 rounded text-xs font-black uppercase tracking-wider font-sans border ${
                          item.decisao === "COMPRA"
                            ? "bg-emerald-600 text-white border-emerald-600 animate-pulse"
                            : "bg-zinc-100 text-zinc-500 border-zinc-200"
                        }`}>
                          {item.decisao}
                        </span>
                      </td>

                      {/* Allocation Column */}
                      <td className="px-4 py-4 text-right font-bold">
                        {item.alocacao_sugerida > 0 ? (
                          <span className="inline-block px-2 py-0.5 bg-emerald-100 border border-emerald-200 rounded text-xs font-bold text-emerald-700">
                            {item.alocacao_sugerida.toFixed(2)}%
                          </span>
                        ) : (
                          <span className="text-zinc-350">0.00%</span>
                        )}
                      </td>

                      <td className="px-4 py-4 text-right font-black text-zinc-900">
                        {item.preco_atual > 0 && item.score_quant !== -9999 ? item.score_quant.toFixed(4) : "N/A"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="bg-zinc-50 border border-zinc-200 rounded p-8 text-center text-zinc-400 font-mono text-xs">
              Nenhum ativo encontrado para os filtros selecionados.
            </div>
          )}
        </section>
      )}

      {/* Methodology Grid */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white border border-zinc-200 rounded-lg p-5 shadow-xs">
          <div className="flex items-center gap-2 text-zinc-800 font-bold text-xs uppercase tracking-wider mb-2 font-mono">
            <Gauge className="h-4 w-4 text-zinc-500" /> 1. Z-Score Preço (20d)
          </div>
          <p className="text-xs text-zinc-650 leading-relaxed">
            {"Identifica o início de uma tendência direcional. Exige que o fechamento atual cruze o Z-Score de 1.0 para cima (Z_Price > 1.0 e D-1 <= 1.0 ou nos últimos dias)."}
          </p>
          <div className="mt-3 p-2 bg-zinc-50 border border-zinc-200 rounded text-[10px] font-mono text-zinc-500 text-center">
            {"(Preço - MMA20) / DesvPad20"}
          </div>
        </div>

        <div className="bg-white border border-zinc-200 rounded-lg p-5 shadow-xs">
          <div className="flex items-center gap-2 text-zinc-800 font-bold text-xs uppercase tracking-wider mb-2 font-mono">
            <HelpCircle className="h-4 w-4 text-zinc-500" /> 2. Regime de Volatilidade
          </div>
          <p className="text-xs text-zinc-650 leading-relaxed">
            {"Mede a taxa de expansão da volatilidade de curtíssimo prazo (5d) em relação ao último mês (20d) para capturar a ignição pós-compressão (squeeze)."}
          </p>
          <div className="mt-3 p-2 bg-zinc-50 border border-zinc-200 rounded text-[10px] font-mono text-zinc-500 text-center">
            {"HV 5d / HV 20d > 1.05"}
          </div>
        </div>

        <div className="bg-white border border-zinc-200 rounded-lg p-5 shadow-xs">
          <div className="flex items-center gap-2 text-zinc-800 font-bold text-xs uppercase tracking-wider mb-2 font-mono">
            <Coins className="h-4 w-4 text-zinc-500" /> 3. Z-Score Volume (20d)
          </div>
          <p className="text-xs text-zinc-650 leading-relaxed">
            {"Confirma a entrada de fluxo comprador relevante para validar o breakout de volatilidade. Exige que o volume atual supere a média em pelo menos 0.8 desvios padrão."}
          </p>
          <div className="mt-3 p-2 bg-zinc-50 border border-zinc-200 rounded text-[10px] font-mono text-zinc-500 text-center">
            {"(Vol - MMA_Vol20) / DesvPad_Vol20 > 0.8"}
          </div>
        </div>
      </section>

      {/* Allocation and Ranking Card */}
      <section className="bg-zinc-900 border border-zinc-800 rounded-lg p-6 shadow-xs text-white">
        <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-2 mb-3 font-mono">
          <Maximize2 className="h-4 w-4 text-zinc-300" /> LÓGICA DE ALOCAÇÃO E SCORE QUANT
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs text-zinc-300">
          <div className="space-y-2">
            <h4 className="font-bold text-white font-mono text-xs">Allocation via Risk Parity</h4>
            <p className="leading-relaxed text-zinc-400">
              O capital alocado para cada ativo que passa nas três condições simultaneamente é calculado de forma inversamente proporcional à sua volatilidade de 60 dias. Isso garante que ativos mais voláteis recebam um peso financeiro menor na carteira final, equilibrando o risco intrínseco.
            </p>
          </div>
          <div className="space-y-2">
            <h4 className="font-bold text-white font-mono text-xs">Score Quant e Ordenação</h4>
            <p className="leading-relaxed text-zinc-400">
              Os ativos na tabela de resultados são automaticamente ordenados do maior para o menor **Score Quant**, definido como o Momentum de 3 meses dividido pela volatilidade histórica de 60 dias. Esse ratio atua como um índice de retorno ajustado pelo risco (semelhante ao Sharpe), priorizando ativos com forte aceleração de preço e volatilidade controlada.
            </p>
          </div>
        </div>
      </section>

    </div>
  );
}
