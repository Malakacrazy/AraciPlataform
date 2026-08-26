"use client";

import type { ProjetoResumoFinanceiro } from "@/lib/types";

// Separador ";" e decimal com vírgula, não "," e ponto -- é o que o Excel
// em pt-BR (locale desta plataforma inteira) espera abrir corretamente
// sem passar por "Dados > Texto para colunas". CSV puro, sem lib nova: a
// tabela já é só texto e número, não precisa de biblioteca de planilha
// pra isso.
function csvNumber(value: number): string {
  return value.toFixed(2).replace(".", ",");
}

function csvField(value: string): string {
  if (/[";\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function buildCsv(projetos: ProjetoResumoFinanceiro[]): string {
  const header = ["Projeto", "Cliente", "Status", "Orçado", "Realizado", "Recebido", "Despesas", "Margem"];
  const rows = projetos.map((p) => [
    csvField(p.nome),
    csvField(p.clienteNome),
    csvField(p.status),
    csvNumber(p.orcado),
    csvNumber(p.realizado),
    csvNumber(p.recebido),
    csvNumber(p.despesas),
    csvNumber(p.margem),
  ]);
  // ﻿ (BOM) -- sem isso o Excel no Windows abre acento como lixo,
  // já que CSV puro não declara o encoding em lugar nenhum.
  return "﻿" + [header, ...rows].map((row) => row.join(";")).join("\r\n");
}

export function ExportProjetosCsv({
  projetos,
  periodo,
}: {
  projetos: ProjetoResumoFinanceiro[];
  periodo: { from: string; to: string };
}) {
  function handleExport() {
    const csv = buildCsv(projetos);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `financeiro-por-projeto_${periodo.from}_a_${periodo.to}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  return (
    <button
      type="button"
      onClick={handleExport}
      disabled={projetos.length === 0}
      className="text-xs text-zinc-500 hover:underline disabled:opacity-50 dark:text-zinc-400"
    >
      Exportar CSV
    </button>
  );
}
