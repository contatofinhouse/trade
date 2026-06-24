"use client";

import React from "react";
import {
  BookOpen,
  ShieldCheck,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Target,
  Activity,
  Layers,
  ArrowRightLeft,
  ShieldAlert,
  Scale
} from "lucide-react";

export default function Metodologia() {
  return (
    <div className="space-y-8 animate-in fade-in duration-300">

      {/* Header */}
      <div className="bg-white border border-zinc-200 rounded-lg p-6 shadow-xs">
        <div className="flex items-center gap-3 mb-4">
          <div className="h-10 w-10 rounded-lg bg-zinc-900 flex items-center justify-center">
            <BookOpen className="h-5 w-5 text-white" />
          </div>
          <div>
            <h2 className="text-lg font-extrabold text-zinc-900 tracking-tight">Metodologia Quantitativa</h2>
            <p className="text-xs text-zinc-400">Documentacao completa dos modelos de risco e estrategia</p>
          </div>
        </div>
        <p className="text-sm text-zinc-600 leading-relaxed">
          Este painel documenta a logica matematica e os indicadores quantitativos por tras de cada estrategia operada:
          o <strong>Collar Protetor de BBDC4</strong> (opcoes) e o <strong>Trend Following de Mini Indice (WIN)</strong> (futuros).
          Todos os calculos sao feitos em tempo real a partir de dados de mercado e custodia da corretora Clear.
        </p>
      </div>

      {/* ===== SEÇÃO 1: COLLAR BBDC4 ===== */}
      <section className="bg-white border border-zinc-200 rounded-lg shadow-xs overflow-hidden">
        <div className="bg-zinc-900 px-6 py-4 flex items-center gap-3">
          <ShieldCheck className="h-5 w-5 text-emerald-400" />
          <h2 className="text-sm font-bold text-white uppercase tracking-wider">Estrategia 1: Collar Protetor de BBDC4</h2>
        </div>
        <div className="p-6 space-y-6">

          {/* Conceito */}
          <div>
            <h3 className="text-sm font-bold text-zinc-900 mb-2 flex items-center gap-2">
              <Layers className="h-4 w-4 text-zinc-500" /> Conceito Geral
            </h3>
            <p className="text-sm text-zinc-600 leading-relaxed">
              O <strong>Collar</strong> e uma estrategia de protecao da carteira de acoes que combina a <strong>compra de uma Put (seguro contra queda)</strong> com a 
              <strong> venda de uma Call (financiamento do seguro)</strong>. O custo liquido e controlado pelo premio recebido da Call vs. o premio pago pela Put.
            </p>
          </div>

          {/* Regimes */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
              <h4 className="text-xs font-bold text-emerald-800 uppercase tracking-wider mb-2 flex items-center gap-2">
                <TrendingUp className="h-4 w-4" /> Regime A - Collar de Alta (Bullish)
              </h4>
              <ul className="text-xs text-emerald-900 space-y-1.5 leading-relaxed">
                <li><strong>Put:</strong> Compra de Put OTM profunda (delta ~-0.065) para protecao de cauda (Black Swan).</li>
                <li><strong>Call:</strong> Venda de Call OTM (delta ~0.065) para financiar a put. Premio baixo, mas libera upside.</li>
                <li><strong>Logica:</strong> O mercado esta em alta, entao o hedge e barato e cobre apenas eventos extremos de queda.</li>
                <li><strong>Custo:</strong> Proximo de zero ou credito liquido (Call financia a Put).</li>
              </ul>
            </div>
            <div className="bg-rose-50 border border-rose-200 rounded-lg p-4">
              <h4 className="text-xs font-bold text-rose-800 uppercase tracking-wider mb-2 flex items-center gap-2">
                <TrendingDown className="h-4 w-4" /> Regime B - Collar Protetor (Defensive)
              </h4>
              <ul className="text-xs text-rose-900 space-y-1.5 leading-relaxed">
                <li><strong>Put:</strong> Compra de Put ATM (delta ~-0.50) para protecao maxima contra queda.</li>
                <li><strong>Call:</strong> Venda de Call ATM (delta ~0.50) para financiar. Sacrifica todo o upside em troca de protecao.</li>
                <li><strong>Logica:</strong> O mercado esta vulneravel ou em queda. Prioridade e proteger capital.</li>
                <li><strong>Custo:</strong> Baixo, pois a Call ATM gera premio alto que compensa a Put cara.</li>
              </ul>
            </div>
          </div>

          {/* Detecção de Regime */}
          <div>
            <h3 className="text-sm font-bold text-zinc-900 mb-2 flex items-center gap-2">
              <Activity className="h-4 w-4 text-zinc-500" /> Deteccao Automatica de Regime
            </h3>
            <p className="text-sm text-zinc-600 leading-relaxed mb-3">
              O sistema identifica o regime com base nos indicadores de volatilidade e posicionamento:
            </p>
            <div className="bg-zinc-50 rounded-lg border border-zinc-200 p-4">
              <table className="w-full text-xs font-mono">
                <thead>
                  <tr className="border-b border-zinc-200">
                    <th className="text-left py-2 text-zinc-400 font-bold uppercase">Criterio</th>
                    <th className="text-center py-2 text-emerald-600 font-bold">Regime A</th>
                    <th className="text-center py-2 text-rose-600 font-bold">Regime B</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-150">
                  <tr>
                    <td className="py-2 text-zinc-600">Skew (IV Put - IV Call)</td>
                    <td className="py-2 text-center text-zinc-700">&lt; 3%</td>
                    <td className="py-2 text-center text-zinc-700">&ge; 3%</td>
                  </tr>
                  <tr>
                    <td className="py-2 text-zinc-600">IVP (Percentil IV 12m)</td>
                    <td className="py-2 text-center text-zinc-700">&lt; 50%</td>
                    <td className="py-2 text-center text-zinc-700">&ge; 50%</td>
                  </tr>
                  <tr>
                    <td className="py-2 text-zinc-600">Delta Put Recomendada</td>
                    <td className="py-2 text-center text-zinc-700">~-0.065 (Deep OTM)</td>
                    <td className="py-2 text-center text-zinc-700">~-0.50 (ATM)</td>
                  </tr>
                  <tr>
                    <td className="py-2 text-zinc-600">Delta Call Recomendada</td>
                    <td className="py-2 text-center text-zinc-700">~0.065 (Deep OTM)</td>
                    <td className="py-2 text-center text-zinc-700">~0.50 (ATM)</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Seleção de Opções */}
          <div>
            <h3 className="text-sm font-bold text-zinc-900 mb-2 flex items-center gap-2">
              <Scale className="h-4 w-4 text-zinc-500" /> Selecao de Opcoes (Grade)
            </h3>
            <p className="text-sm text-zinc-600 leading-relaxed mb-3">
              As opcoes sao selecionadas automaticamente na grade do vencimento mensal mais proximo (15 a 45 dias uteis) com os seguintes criterios:
            </p>
            <div className="bg-zinc-50 rounded-lg border border-zinc-200 p-4">
              <table className="w-full text-xs font-mono">
                <thead>
                  <tr className="border-b border-zinc-200">
                    <th className="text-left py-2 text-zinc-400 font-bold uppercase">Referencia</th>
                    <th className="text-center py-2 text-zinc-400 font-bold uppercase">Delta Alvo</th>
                    <th className="text-left py-2 text-zinc-400 font-bold uppercase">Uso</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-150">
                  <tr>
                    <td className="py-2 text-zinc-600">Put ATM (put_50)</td>
                    <td className="py-2 text-center text-zinc-700">-0.50</td>
                    <td className="py-2 text-zinc-600">Collar Protetor (Regime B)</td>
                  </tr>
                  <tr>
                    <td className="py-2 text-zinc-600">Call ATM (call_50)</td>
                    <td className="py-2 text-center text-zinc-700">+0.50</td>
                    <td className="py-2 text-zinc-600">Collar Protetor (Regime B)</td>
                  </tr>
                  <tr>
                    <td className="py-2 text-zinc-600">Put OTM (put_06)</td>
                    <td className="py-2 text-center text-zinc-700">-0.065</td>
                    <td className="py-2 text-zinc-600">Protecao de Cauda / Black Swan (Regime A)</td>
                  </tr>
                  <tr>
                    <td className="py-2 text-zinc-600">Call OTM (call_06)</td>
                    <td className="py-2 text-center text-zinc-700">+0.065</td>
                    <td className="py-2 text-zinc-600">Financiamento da Put (Regime A)</td>
                  </tr>
                  <tr>
                    <td className="py-2 text-zinc-600">Put Delta 275 (put_275)</td>
                    <td className="py-2 text-center text-zinc-700">-0.275</td>
                    <td className="py-2 text-zinc-600">Referencia de Hedge Padrao</td>
                  </tr>
                  <tr>
                    <td className="py-2 text-zinc-600">Call Delta 275 (call_275)</td>
                    <td className="py-2 text-center text-zinc-700">+0.275</td>
                    <td className="py-2 text-zinc-600">Referencia de Financiamento Padrao</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Fonte de Dados */}
          <div className="bg-zinc-50 rounded-lg border border-zinc-200 p-4">
            <h4 className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">Fontes de Dados</h4>
            <ul className="text-xs text-zinc-600 space-y-1">
              <li><strong>Grade de Opcoes:</strong> API opcoes.net.br (cadeia de opcoes, deltas, IVs, strikes)</li>
              <li><strong>Cotacoes Real-Time:</strong> Clear API (XP Open API) - sem delay de 15 min</li>
              <li><strong>Custodia:</strong> Clear API /v1/custody - posicoes e preco medio reais</li>
              <li><strong>Cron de Atualizacao:</strong> Vercel Cron as 16:45 BRT e Tarefa Local (hedge_monitor.py) as 16:20 BRT</li>
            </ul>
          </div>
        </div>
      </section>

      {/* ===== SEÇÃO 2: LONG/SHORT WIN ===== */}
      <section className="bg-white border border-zinc-200 rounded-lg shadow-xs overflow-hidden">
        <div className="bg-zinc-900 px-6 py-4 flex items-center gap-3">
          <ArrowRightLeft className="h-5 w-5 text-blue-400" />
          <h2 className="text-sm font-bold text-white uppercase tracking-wider">Estrategia 2: Trend Following - Long/Short WIN</h2>
        </div>
        <div className="p-6 space-y-6">

          {/* Conceito */}
          <div>
            <h3 className="text-sm font-bold text-zinc-900 mb-2 flex items-center gap-2">
              <Activity className="h-4 w-4 text-zinc-500" /> Conceito Geral
            </h3>
            <p className="text-sm text-zinc-600 leading-relaxed">
              Estrategia direcional no contrato de Mini Indice (WIN) baseada em <strong>Trend Following quantitativo</strong>.
              O modelo usa 3 indicadores independentes para gerar um sinal de direcao (COMPRA/VENDA) via <strong>voting ensemble</strong>, 
              e monitora o risco da posicao aberta com <strong>Trailing Stop dinamico</strong> via KAMA e <strong>Take Profit adaptativo</strong> via Bollinger.
            </p>
          </div>

          {/* Sinal de Entrada */}
          <div>
            <h3 className="text-sm font-bold text-zinc-900 mb-2 flex items-center gap-2">
              <Target className="h-4 w-4 text-zinc-500" /> Sinal de Entrada (Scoring)
            </h3>
            <p className="text-sm text-zinc-600 leading-relaxed mb-3">
              Tres indicadores votam independentemente (+1 ou -1). O score total define a direcao:
            </p>
            <div className="bg-zinc-50 rounded-lg border border-zinc-200 p-4">
              <table className="w-full text-xs font-mono">
                <thead>
                  <tr className="border-b border-zinc-200">
                    <th className="text-left py-2 text-zinc-400 font-bold uppercase">Indicador</th>
                    <th className="text-center py-2 text-emerald-600 font-bold">+1 (Compra)</th>
                    <th className="text-center py-2 text-rose-600 font-bold">-1 (Venda)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-150">
                  <tr>
                    <td className="py-2 text-zinc-600">KAMA (10,2,30)</td>
                    <td className="py-2 text-center text-zinc-700">Preco &gt; KAMA</td>
                    <td className="py-2 text-center text-zinc-700">Preco &lt; KAMA</td>
                  </tr>
                  <tr>
                    <td className="py-2 text-zinc-600">Connors RSI (3,2,100)</td>
                    <td className="py-2 text-center text-zinc-700">CRSI &gt; 50</td>
                    <td className="py-2 text-center text-zinc-700">CRSI &lt; 50</td>
                  </tr>
                  <tr>
                    <td className="py-2 text-zinc-600">Kalman Filter</td>
                    <td className="py-2 text-center text-zinc-700">Tendencia UP</td>
                    <td className="py-2 text-center text-zinc-700">Tendencia DOWN</td>
                  </tr>
                </tbody>
              </table>
              <div className="mt-3 pt-3 border-t border-zinc-200 text-xs text-zinc-500">
                <strong>Score &ge; +2:</strong> Sinal de COMPRA | <strong>Score &le; -2:</strong> Sinal de VENDA | <strong>Demais:</strong> CAIXA (aguardar)
              </div>
              <div className="mt-1 text-xs text-zinc-500">
                <strong>Filtro Anti-Overbought:</strong> Se preco &ge; Bollinger Superior, bloqueia COMPRA. Se preco &le; Bollinger Inferior, bloqueia VENDA.
              </div>
            </div>
          </div>

          {/* Limites Iniciais */}
          <div>
            <h3 className="text-sm font-bold text-zinc-900 mb-2 flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-zinc-500" /> Limites Iniciais de Risco
            </h3>
            <div className="bg-zinc-50 rounded-lg border border-zinc-200 p-4 font-mono text-xs space-y-2">
              <div className="flex justify-between">
                <span className="text-zinc-500">Stop Distance:</span>
                <span className="text-zinc-800 font-bold">roundToWIN(ATR x Multiplier)</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">Target Distance:</span>
                <span className="text-zinc-800 font-bold">roundToWIN(ATR x Multiplier x 1.5)</span>
              </div>
              <div className="border-t border-zinc-200 pt-2 mt-2 text-zinc-500">
                <div><strong>LONG:</strong> Stop = Entrada - Stop Distance | Alvo = Entrada + Target Distance</div>
                <div><strong>SHORT:</strong> Stop = Entrada + Stop Distance | Alvo = Entrada - Target Distance</div>
              </div>
              <div className="text-zinc-400 text-[10px] mt-1">
                roundToWIN(x) = round(x / 5) * 5 (multiplos de 5 pts, tick minimo do WIN)
              </div>
            </div>
          </div>

          {/* Trailing Stop */}
          <div>
            <h3 className="text-sm font-bold text-zinc-900 mb-2 flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-rose-500" /> Trailing Stop Loss (Persistido)
            </h3>
            <div className="bg-rose-50 border border-rose-200 rounded-lg p-4">
              <p className="text-xs text-rose-900 leading-relaxed mb-3">
                O stop loss e ajustado dinamicamente seguindo a <strong>KAMA</strong>. O valor e <strong>persistido em localStorage</strong>, 
                garantindo que entre recarregamentos de pagina o stop nunca retroceda (Regra de Ouro).
              </p>
              <div className="bg-white rounded border border-rose-200 p-3 font-mono text-xs space-y-1.5">
                <div><strong className="text-rose-700">LONG:</strong> Stop Trailing = KAMA - ATR x 0.5</div>
                <div><strong className="text-rose-700">SHORT:</strong> Stop Trailing = KAMA + ATR x 0.5</div>
                <div className="border-t border-rose-100 pt-2 mt-2">
                  <strong className="text-rose-700">Regra de Ouro:</strong> Stop Recomendado = max(Stop Persistido, Stop Trailing, Stop Inicial) para LONG
                </div>
                <div>
                  <strong className="text-rose-700">Regra de Ouro:</strong> Stop Recomendado = min(Stop Persistido, Stop Trailing, Stop Inicial) para SHORT
                </div>
              </div>
              <div className="mt-3 text-xs text-rose-700 bg-rose-100 rounded p-2 border border-rose-200">
                <strong>Persistencia:</strong> O melhor stop ja atingido e salvo em localStorage com chave <code>win_trailing_WINQ26</code>. 
                Quando a posicao e encerrada (qty = 0 na custodia), o estado e limpo automaticamente.
              </div>
            </div>
          </div>

          {/* Take Profit Adaptativo */}
          <div>
            <h3 className="text-sm font-bold text-zinc-900 mb-2 flex items-center gap-2">
              <Target className="h-4 w-4 text-emerald-500" /> Take Profit Adaptativo (Bollinger)
            </h3>
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
              <p className="text-xs text-emerald-900 leading-relaxed mb-3">
                O alvo inicial e fixo em 1.5x ATR. Em momentos de expansao de volatilidade, as <strong>Bandas de Bollinger (2 sigma, centradas na KAMA)</strong> 
                podem superar o alvo fixo. Quando isso ocorre, o modelo recomenda <strong>estender o alvo</strong> para capturar o maximo do movimento.
              </p>
              <div className="bg-white rounded border border-emerald-200 p-3 font-mono text-xs space-y-1.5">
                <div><strong className="text-emerald-700">LONG:</strong> Alvo = max(Alvo Inicial, Bollinger Superior)</div>
                <div><strong className="text-emerald-700">SHORT:</strong> Alvo = min(Alvo Inicial, Bollinger Inferior)</div>
              </div>
              <div className="mt-3 text-xs text-emerald-700">
                O alvo tambem e <strong>persistido</strong> e nunca retrocede (so cresce para LONG, so diminui para SHORT).
              </div>
            </div>
          </div>

          {/* Filtro Anti-Spam */}
          <div>
            <h3 className="text-sm font-bold text-zinc-900 mb-2 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" /> Filtro Anti-Spam (50 pts)
            </h3>
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
              <p className="text-xs text-amber-900 leading-relaxed">
                Para evitar ruido excessivo de alertas, o painel so exibe <strong>"AJUSTE RECOMENDADO"</strong> quando a diferenca entre o 
                Stop/Alvo Recomendado e o Stop/Alvo Inicial e de pelo menos <strong>50 pontos</strong>.
                Variações menores sao consideradas insignificantes para execucao manual no Home Broker.
              </p>
            </div>
          </div>

          {/* Indicadores Quantitativos */}
          <div>
            <h3 className="text-sm font-bold text-zinc-900 mb-2 flex items-center gap-2">
              <Activity className="h-4 w-4 text-zinc-500" /> Indicadores Quantitativos Utilizados
            </h3>
            <div className="bg-zinc-50 rounded-lg border border-zinc-200 p-4">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-zinc-200">
                    <th className="text-left py-2 text-zinc-400 font-bold uppercase font-mono">Indicador</th>
                    <th className="text-left py-2 text-zinc-400 font-bold uppercase font-mono">Parametros</th>
                    <th className="text-left py-2 text-zinc-400 font-bold uppercase font-mono">Funcao</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-150">
                  <tr>
                    <td className="py-2 font-bold text-zinc-800 font-mono">KAMA</td>
                    <td className="py-2 text-zinc-600 font-mono">n=10, fast=2, slow=30</td>
                    <td className="py-2 text-zinc-600">Media Movel Adaptativa de Kaufman. Sinal principal de tendencia e base do trailing stop.</td>
                  </tr>
                  <tr>
                    <td className="py-2 font-bold text-zinc-800 font-mono">ATR</td>
                    <td className="py-2 text-zinc-600 font-mono">periodo=14</td>
                    <td className="py-2 text-zinc-600">Average True Range. Calibra distancia de stop e alvo proporcionalmente a volatilidade.</td>
                  </tr>
                  <tr>
                    <td className="py-2 font-bold text-zinc-800 font-mono">Bollinger (KAMA)</td>
                    <td className="py-2 text-zinc-600 font-mono">periodo=20, sigma=2.0</td>
                    <td className="py-2 text-zinc-600">Bandas de volatilidade centradas na KAMA. Usadas para extensao de alvos.</td>
                  </tr>
                  <tr>
                    <td className="py-2 font-bold text-zinc-800 font-mono">Connors RSI</td>
                    <td className="py-2 text-zinc-600 font-mono">RSI(3), Streak RSI(2), PercentRank(100)</td>
                    <td className="py-2 text-zinc-600">Momentum composto. Voto no scoring de entrada (+1/-1).</td>
                  </tr>
                  <tr>
                    <td className="py-2 font-bold text-zinc-800 font-mono">Kalman Filter</td>
                    <td className="py-2 text-zinc-600 font-mono">Q=0.05, R=1.0</td>
                    <td className="py-2 text-zinc-600">Filtro de estado linear. Determina tendencia UP/DOWN baseado no slope.</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Fonte de Dados WIN */}
          <div className="bg-zinc-50 rounded-lg border border-zinc-200 p-4">
            <h4 className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">Fontes de Dados</h4>
            <ul className="text-xs text-zinc-600 space-y-1">
              <li><strong>Historico Diario:</strong> Yahoo Finance API (^BVSP, 1 ano de dados diarios)</li>
              <li><strong>Cotacao Real-Time:</strong> Clear API /v1/marketdata/quote (sem delay)</li>
              <li><strong>Custodia e Preco Medio:</strong> Clear API /v1/custody (posicao e averageCost reais)</li>
              <li><strong>Trailing Persistido:</strong> localStorage do navegador (chave: win_trailing_WINQ26)</li>
            </ul>
          </div>

          {/* PnL */}
          <div>
            <h3 className="text-sm font-bold text-zinc-900 mb-2 flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-zinc-500" /> Calculo de PnL
            </h3>
            <div className="bg-zinc-50 rounded-lg border border-zinc-200 p-4 font-mono text-xs space-y-2">
              <div><strong>LONG:</strong> PnL (pts) = Cotacao Atual - Preco de Entrada</div>
              <div><strong>SHORT:</strong> PnL (pts) = Preco de Entrada - Cotacao Atual</div>
              <div className="border-t border-zinc-200 pt-2 mt-2">
                <strong>PnL Financeiro (R$):</strong> PnL (pts) x R$ 0,20 x Quantidade de Contratos
              </div>
              <div className="text-zinc-400 text-[10px] mt-1">
                Cada ponto do Mini Indice (WIN) vale R$ 0,20 por contrato.
              </div>
            </div>
          </div>

        </div>
      </section>

      {/* Disclaimer */}
      <div className="bg-zinc-100 border border-zinc-200 rounded-lg p-4 text-[10px] text-zinc-400 font-mono leading-relaxed">
        <strong>AVISO:</strong> Esta metodologia e documentacao interna de uso exclusivo para gestao de risco proprietario.
        Nao constitui recomendacao de investimento. Todos os modelos quantitativos estao sujeitos a falhas e devem ser
        monitorados ativamente. Resultados passados nao garantem resultados futuros.
      </div>

    </div>
  );
}
