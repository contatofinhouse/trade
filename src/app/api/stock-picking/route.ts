import { NextRequest, NextResponse } from "next/server";
import { exec } from "child_process";
import path from "path";
import fs from "fs";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    // Janela padrão de 5 dias úteis para encontrar sinais
    const lookback = searchParams.get("lookback") || "5";
    
    // Validação básica do parâmetro
    const lookbackVal = parseInt(lookback, 10);
    if (isNaN(lookbackVal) || lookbackVal <= 0 || lookbackVal > 250) {
      return NextResponse.json(
        { error: "Parâmetro lookback inválido. Deve ser um número entre 1 e 250." },
        { status: 400 }
      );
    }

    const scriptPath = path.join(process.cwd(), "stock_picking_scan.py");

    if (!fs.existsSync(scriptPath)) {
      return NextResponse.json(
        { error: `Python scan script not found at path: ${scriptPath}` },
        { status: 500 }
      );
    }

    // Função auxiliar para chamar o script Python com parâmetro
    const executePython = (cmd: string): Promise<string> => {
      return new Promise((resolve, reject) => {
        exec(cmd, (error, stdout, stderr) => {
          if (error) {
            reject({ error, stderr });
          } else {
            resolve(stdout);
          }
        });
      });
    };

    let output = "";
    try {
      // Tenta rodar com 'python'
      output = await executePython(`python "${scriptPath}" ${lookbackVal}`);
    } catch (err: any) {
      console.warn("Falha ao executar com 'python', tentando 'python3'...", err.stderr || err.error?.message);
      try {
        // Tenta rodar com 'python3' como fallback
        output = await executePython(`python3 "${scriptPath}" ${lookbackVal}`);
      } catch (err3: any) {
        console.error("Falha ao executar com 'python3' também:", err3.stderr || err3.error?.message);
        return NextResponse.json(
          { 
            error: "Falha ao executar o script quantitativo de scan.", 
            details: err3.stderr || err3.error?.message || String(err3)
          },
          { status: 500 }
        );
      }
    }

    // Parse do JSON de saída do stdout
    try {
      const results = JSON.parse(output.trim());
      return NextResponse.json({
        success: true,
        timestamp: new Date().toISOString(),
        lookback: lookbackVal,
        count: results.length,
        data: results
      });
    } catch (parseError: any) {
      console.error("Falha ao fazer parse do output do script Python:", output);
      return NextResponse.json(
        { 
          error: "Erro de formatação nos dados quantitativos.", 
          details: parseError.message,
          rawOutput: output 
        },
        { status: 500 }
      );
    }
  } catch (error: any) {
    console.error("Erro interno na rota /api/stock-picking:", error);
    return NextResponse.json(
      { error: "Erro interno no servidor.", details: error.message },
      { status: 500 }
    );
  }
}
