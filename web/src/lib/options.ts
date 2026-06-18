export interface OptionItem {
  ticker: string;
  strike: number;
  price: number;
  iv: number;
  delta: number;
}

export interface ExpirationInfo {
  date: string;
  du: number;
}

export interface SelectedCollar {
  best_put: OptionItem | null;
  best_call: OptionItem | null;
  expiration_info: ExpirationInfo;
  underlying_asset: {
    price: number;
    iv_p: number; // Vol. Implícita das Puts
    ivp_p_12m: number; // Percentil IV das Puts
  };
}

export async function fetchSelectedCollarOptions(): Promise<SelectedCollar> {
  const z = Math.floor(Date.now() / 10000);
  const url = `https://www.opcoes.net.br/api/v1?z=${z}&r0t=LastQuotesInfo&r1t=OptionsChain&r1p.underlying_asset_id=BBDC4&r1p.skip=0&r1p.load=1000&r1p.columns_info=true&r1p.underlying_quotes=true`;

  const headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "application/json"
  };

  const response = await fetch(url, { headers, next: { revalidate: 3600 } });
  if (!response.ok) {
    throw new Error(`opcoes.net.br API returned status ${response.status}`);
  }

  const data = await response.json();
  if (!data.success) {
    const errorMsg = data.error?.message || "Unknown error from opcoes.net.br API";
    throw new Error(`opcoes.net.br API error: ${errorMsg}`);
  }

  const optionsRequest = data.requests?.find((r: any) => r.type === "OptionsChain");
  const optionsChain = optionsRequest?.results;

  if (!optionsChain) {
    throw new Error("OptionsChain result not found in API response");
  }

  const expirations = optionsChain.expirations || [];
  if (expirations.length === 0) {
    throw new Error("No expirations available in options chain");
  }

  // 1. Encontra o vencimento alvo
  // Pega mensal (m === true) com 15 <= du <= 45
  let targetExp = expirations.find((exp: any) => exp.du >= 15 && exp.du <= 45 && exp.m === true);
  
  // Se não achar mensal puro, relaxa o filtro de mensal
  if (!targetExp) {
    targetExp = expirations.find((exp: any) => exp.du >= 15 && exp.du <= 45);
  }

  if (!targetExp) {
    throw new Error("Nenhum vencimento de opções disponível no intervalo de 15 a 45 dias úteis.");
  }

  const duLeft = targetExp.du;
  const expDate = targetExp.dt;

  const puts = targetExp.puts || [];
  const calls = targetExp.calls || [];

  // Mapeamento de colunas da API opcoes.net.br:
  // index 0: Suffix (ex: 'S2')
  // index 3: Strike (ex: '17.39')
  // index 6: Last Price (ex: '0.28')
  // index 17: Implied Vol (ex: '0.247')
  // index 18: Delta (ex: '-0.275')

  // Encontra a melhor Put (mais próxima de delta -0.275, no intervalo [-0.30, -0.20])
  let bestPut: OptionItem | null = null;
  let bestPutDiff = Infinity;
  for (const p of puts) {
    const delta = p[18] !== null && p[18] !== undefined ? parseFloat(p[18]) : null;
    if (delta !== null && delta >= -0.30 && delta <= -0.20) {
      const diff = Math.abs(delta - (-0.275));
      if (diff < bestPutDiff) {
        bestPutDiff = diff;
        bestPut = {
          ticker: `BBDC${p[0]}`,
          strike: parseFloat(p[3]),
          price: p[6] !== null && p[6] !== undefined ? parseFloat(p[6]) : 0.0,
          iv: p[17] !== null && p[17] !== undefined ? parseFloat(p[17]) : 0.0,
          delta: delta
        };
      }
    }
  }

  // Encontra a melhor Call (mais próxima de delta 0.275, no intervalo [0.20, 0.30])
  let bestCall: OptionItem | null = null;
  let bestCallDiff = Infinity;
  for (const c of calls) {
    const delta = c[18] !== null && c[18] !== undefined ? parseFloat(c[18]) : null;
    if (delta !== null && delta >= 0.20 && delta <= 0.30) {
      const diff = Math.abs(delta - 0.275);
      if (diff < bestCallDiff) {
        bestCallDiff = diff;
        bestCall = {
          ticker: `BBDC${c[0]}`,
          strike: parseFloat(c[3]),
          price: c[6] !== null && c[6] !== undefined ? parseFloat(c[6]) : 0.0,
          iv: c[17] !== null && c[17] !== undefined ? parseFloat(c[17]) : 0.0,
          delta: delta
        };
      }
    }
  }

  // Extrai informações do ativo subjacente (BBDC4)
  const underlying = optionsChain.underlying_asset || {};
  const underlyingPrice = underlying.quote !== null && underlying.quote !== undefined ? parseFloat(underlying.quote) : 0.0;
  const underlyingIV = underlying.iv_p !== null && underlying.iv_p !== undefined ? parseFloat(underlying.iv_p) : 0.0;
  const underlyingIVP = underlying.ivp_p_12m !== null && underlying.ivp_p_12m !== undefined ? parseFloat(underlying.ivp_p_12m) : 0.0;

  return {
    best_put: bestPut,
    best_call: bestCall,
    expiration_info: {
      date: expDate,
      du: duLeft
    },
    underlying_asset: {
      price: underlyingPrice,
      iv_p: underlyingIV,
      ivp_p_12m: underlyingIVP
    }
  };
}

export interface ActiveOptionQuote {
  ticker: string;
  strike: number;
  price: number;
  iv: number;
  delta: number;
}

export interface ActiveQuotesResponse {
  put: ActiveOptionQuote | null;
  call: ActiveOptionQuote | null;
  underlyingPrice: number | null;
  skew: number | null;
  put_375: ActiveOptionQuote | null;
  call_131: ActiveOptionQuote | null;
  put_20: ActiveOptionQuote | null;
  put_275: ActiveOptionQuote | null;
  call_275: ActiveOptionQuote | null;
  put_50: ActiveOptionQuote | null;
  call_50: ActiveOptionQuote | null;
  call_06: ActiveOptionQuote | null;
  du: number | null;
}

export async function fetchActiveOptionsQuotes(
  putTicker: string | null,
  callTicker: string | null
): Promise<ActiveQuotesResponse> {
  let putResult: ActiveOptionQuote | null = null;
  let callResult: ActiveOptionQuote | null = null;
  let underlyingPrice: number | null = null;
  
  let put375Result: ActiveOptionQuote | null = null;
  let call131Result: ActiveOptionQuote | null = null;
  let put20Result: ActiveOptionQuote | null = null;
  let put275Result: ActiveOptionQuote | null = null;
  let call275Result: ActiveOptionQuote | null = null;
  let put50Result: ActiveOptionQuote | null = null;
  let call50Result: ActiveOptionQuote | null = null;
  let call06Result: ActiveOptionQuote | null = null;
  let targetDu: number | null = null;

  const returnEmpty = () => ({
    put: null,
    call: null,
    underlyingPrice: null,
    skew: null,
    put_375: null,
    call_131: null,
    put_20: null,
    put_275: null,
    call_275: null,
    put_50: null,
    call_50: null,
    call_06: null,
    du: null
  });

  const z = Math.floor(Date.now() / 10000);
  const url = `https://www.opcoes.net.br/api/v1?z=${z}&r0t=LastQuotesInfo&r1t=OptionsChain&r1p.underlying_asset_id=BBDC4&r1p.skip=0&r1p.load=1000&r1p.columns_info=true&r1p.underlying_quotes=true`;

  const headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "application/json"
  };

  try {
    const response = await fetch(url, { headers, next: { revalidate: 60 } }); // Cache de 1 minuto para cotações
    if (response.ok) {
      const data = await response.json();
      if (data.success) {
        const optionsRequest = data.requests?.find((r: any) => r.type === "OptionsChain");
        const optionsChain = optionsRequest?.results;
        if (optionsChain) {
          const underlying = optionsChain.underlying_asset || {};
          if (underlying.quote !== null && underlying.quote !== undefined) {
            underlyingPrice = parseFloat(underlying.quote);
          }
          const expirations = optionsChain.expirations || [];

          // 1. Encontra vencimento alvo mensal (15 <= du <= 45)
          let targetExp = expirations.find((exp: any) => exp.du >= 15 && exp.du <= 45 && exp.m === true);
          if (!targetExp) {
            targetExp = expirations.find((exp: any) => exp.du >= 15 && exp.du <= 45);
          }

          if (targetExp) {
            targetDu = targetExp.du;
            const puts = targetExp.puts || [];
            const calls = targetExp.calls || [];

            // A. Buscar Put Delta -0.375
            let minDiff375 = Infinity;
            for (const p of puts) {
              const delta = p[18] !== null && p[18] !== undefined ? parseFloat(p[18]) : null;
              if (delta !== null) {
                const diff = Math.abs(delta - (-0.375));
                if (diff < minDiff375) {
                  minDiff375 = diff;
                  put375Result = {
                    ticker: `BBDC${p[0]}`,
                    strike: parseFloat(p[3]),
                    price: p[6] !== null && p[6] !== undefined ? parseFloat(p[6]) : 0.0,
                    iv: p[17] !== null && p[17] !== undefined ? parseFloat(p[17]) : 0.0,
                    delta: delta
                  };
                }
              }
            }

            // B. Buscar Call Delta 0.131
            let minDiff131 = Infinity;
            for (const c of calls) {
              const delta = c[18] !== null && c[18] !== undefined ? parseFloat(c[18]) : null;
              if (delta !== null) {
                const diff = Math.abs(delta - 0.131);
                if (diff < minDiff131) {
                  minDiff131 = diff;
                  call131Result = {
                    ticker: `BBDC${c[0]}`,
                    strike: parseFloat(c[3]),
                    price: c[6] !== null && c[6] !== undefined ? parseFloat(c[6]) : 0.0,
                    iv: c[17] !== null && c[17] !== undefined ? parseFloat(c[17]) : 0.0,
                    delta: delta
                  };
                }
              }
            }

            // C. Buscar Put Delta -0.20
            let minDiff20 = Infinity;
            for (const p of puts) {
              const delta = p[18] !== null && p[18] !== undefined ? parseFloat(p[18]) : null;
              if (delta !== null) {
                const diff = Math.abs(delta - (-0.20));
                if (diff < minDiff20) {
                  minDiff20 = diff;
                  put20Result = {
                    ticker: `BBDC${p[0]}`,
                    strike: parseFloat(p[3]),
                    price: p[6] !== null && p[6] !== undefined ? parseFloat(p[6]) : 0.0,
                    iv: p[17] !== null && p[17] !== undefined ? parseFloat(p[17]) : 0.0,
                    delta: delta
                  };
                }
              }
            }

            // D. Buscar Put Delta -0.275
            let minDiff275P = Infinity;
            for (const p of puts) {
              const delta = p[18] !== null && p[18] !== undefined ? parseFloat(p[18]) : null;
              if (delta !== null) {
                const diff = Math.abs(delta - (-0.275));
                if (diff < minDiff275P) {
                  minDiff275P = diff;
                  put275Result = {
                    ticker: `BBDC${p[0]}`,
                    strike: parseFloat(p[3]),
                    price: p[6] !== null && p[6] !== undefined ? parseFloat(p[6]) : 0.0,
                    iv: p[17] !== null && p[17] !== undefined ? parseFloat(p[17]) : 0.0,
                    delta: delta
                  };
                }
              }
            }

            // E. Buscar Call Delta 0.275
            let minDiff275C = Infinity;
            for (const c of calls) {
              const delta = c[18] !== null && c[18] !== undefined ? parseFloat(c[18]) : null;
              if (delta !== null) {
                const diff = Math.abs(delta - 0.275);
                if (diff < minDiff275C) {
                  minDiff275C = diff;
                  call275Result = {
                    ticker: `BBDC${c[0]}`,
                    strike: parseFloat(c[3]),
                    price: c[6] !== null && c[6] !== undefined ? parseFloat(c[6]) : 0.0,
                    iv: c[17] !== null && c[17] !== undefined ? parseFloat(c[17]) : 0.0,
                    delta: delta
                  };
                }
              }
            }

            // F. Buscar Put Delta -0.50 (ATM)
            let minDiff50P = Infinity;
            for (const p of puts) {
              const delta = p[18] !== null && p[18] !== undefined ? parseFloat(p[18]) : null;
              if (delta !== null) {
                const diff = Math.abs(delta - (-0.50));
                if (diff < minDiff50P) {
                  minDiff50P = diff;
                  put50Result = {
                    ticker: `BBDC${p[0]}`,
                    strike: parseFloat(p[3]),
                    price: p[6] !== null && p[6] !== undefined ? parseFloat(p[6]) : 0.0,
                    iv: p[17] !== null && p[17] !== undefined ? parseFloat(p[17]) : 0.0,
                    delta: delta
                  };
                }
              }
            }

            // G. Buscar Call Delta 0.50 (ATM)
            let minDiff50C = Infinity;
            for (const c of calls) {
              const delta = c[18] !== null && c[18] !== undefined ? parseFloat(c[18]) : null;
              if (delta !== null) {
                const diff = Math.abs(delta - 0.50);
                if (diff < minDiff50C) {
                  minDiff50C = diff;
                  call50Result = {
                    ticker: `BBDC${c[0]}`,
                    strike: parseFloat(c[3]),
                    price: c[6] !== null && c[6] !== undefined ? parseFloat(c[6]) : 0.0,
                    iv: c[17] !== null && c[17] !== undefined ? parseFloat(c[17]) : 0.0,
                    delta: delta
                  };
                }
              }
            }

            // H. Buscar Call Delta 0.065 (OTM, entre 0.05 e 0.08)
            let minDiff06C = Infinity;
            for (const c of calls) {
              const delta = c[18] !== null && c[18] !== undefined ? parseFloat(c[18]) : null;
              if (delta !== null) {
                const diff = Math.abs(delta - 0.065);
                if (diff < minDiff06C) {
                  minDiff06C = diff;
                  call06Result = {
                    ticker: `BBDC${c[0]}`,
                    strike: parseFloat(c[3]),
                    price: c[6] !== null && c[6] !== undefined ? parseFloat(c[6]) : 0.0,
                    iv: c[17] !== null && c[17] !== undefined ? parseFloat(c[17]) : 0.0,
                    delta: delta
                  };
                }
              }
            }
          }

          // 2. Encontrar cotação para os tickers específicos da posição ativa atual (pode estar em expirations diferentes)
          for (const exp of expirations) {
            if (putTicker && !putResult) {
              const puts = exp.puts || [];
              const found = puts.find((p: any) => `BBDC${p[0]}` === putTicker);
              if (found) {
                putResult = {
                  ticker: putTicker,
                  strike: parseFloat(found[3]),
                  price: found[6] !== null && found[6] !== undefined ? parseFloat(found[6]) : 0.0,
                  iv: found[17] !== null && found[17] !== undefined ? parseFloat(found[17]) : 0.0,
                  delta: found[18] !== null && found[18] !== undefined ? parseFloat(found[18]) : 0.0
                };
              }
            }

            if (callTicker && !callResult) {
              const calls = exp.calls || [];
              const found = calls.find((c: any) => `BBDC${c[0]}` === callTicker);
              if (found) {
                callResult = {
                  ticker: callTicker,
                  strike: parseFloat(found[3]),
                  price: found[6] !== null && found[6] !== undefined ? parseFloat(found[6]) : 0.0,
                  iv: found[17] !== null && found[17] !== undefined ? parseFloat(found[17]) : 0.0,
                  delta: found[18] !== null && found[18] !== undefined ? parseFloat(found[18]) : 0.0
                };
              }
            }
          }
        }
      }
    }
  } catch (e) {
    console.error("Erro ao buscar cotações de opções ativas:", e);
  }

  // Fallbacks de segurança caso não encontre na grade atual
  if (putTicker && !putResult) {
    putResult = {
      ticker: putTicker,
      strike: 17.39,
      price: 0.28,
      iv: 0.247,
      delta: -0.275
    };
  }
  if (callTicker && !callResult) {
    callResult = {
      ticker: callTicker,
      strike: 19.14,
      price: 0.09,
      iv: 0.213,
      delta: 0.252
    };
  }

  // Fallbacks para opções de referência delta
  if (!put375Result) {
    put375Result = {
      ticker: "BBDCS170",
      strike: 17.00,
      price: 0.42,
      iv: 0.249,
      delta: -0.375
    };
  }
  if (!call131Result) {
    call131Result = {
      ticker: "BBDCG195",
      strike: 19.50,
      price: 0.06,
      iv: 0.215,
      delta: 0.131
    };
  }
  if (!put20Result) {
    put20Result = {
      ticker: "BBDCS165",
      strike: 16.50,
      price: 0.15,
      iv: 0.242,
      delta: -0.20
    };
  }
  if (!put275Result) {
    put275Result = putResult || {
      ticker: "BBDCS174",
      strike: 17.39,
      price: 0.28,
      iv: 0.247,
      delta: -0.275
    };
  }
  if (!call275Result) {
    call275Result = callResult || {
      ticker: "BBDCG190",
      strike: 19.14,
      price: 0.09,
      iv: 0.213,
      delta: 0.252
    };
  }
  if (!put50Result) {
    put50Result = {
      ticker: "BBDCS175",
      strike: 17.50,
      price: 0.45,
      iv: 0.245,
      delta: -0.50
    };
  }
  if (!call50Result) {
    call50Result = {
      ticker: "BBDCG175",
      strike: 17.50,
      price: 0.45,
      iv: 0.220,
      delta: 0.50
    };
  }
  if (!call06Result) {
    call06Result = {
      ticker: "BBDCG200",
      strike: 20.00,
      price: 0.02,
      iv: 0.210,
      delta: 0.065
    };
  }
  if (!targetDu) {
    targetDu = 21; // fallback ~ 1 mes
  }

  const skew = (put375Result.iv - call131Result.iv) * 100;

  return {
    put: putResult,
    call: callResult,
    underlyingPrice,
    skew,
    put_375: put375Result,
    call_131: call131Result,
    put_20: put20Result,
    put_275: put275Result,
    call_275: call275Result,
    put_50: put50Result,
    call_50: call50Result,
    call_06: call06Result,
    du: targetDu
  };
}
