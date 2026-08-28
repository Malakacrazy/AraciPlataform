"use client";

import type { Area, ProductSpecification } from "@/lib/types";

// Lacuna da matriz ("exportação para CAD/Revit/Excel") -- só a parte
// Excel, por decisão da própria auditoria: CAD/Revit exige decisão de
// formato (IFC? schedule do Revit? bloco DWG?) e um spike antes de
// qualquer código, então fica de fora. O Excel reaproveita exatamente o
// padrão já usado no export do financeiro
// (components/dashboard/export-projetos-csv.tsx) -- separador ";",
// decimal com vírgula, BOM.
function csvNumber(value: number): string {
  return value.toFixed(2).replace(".", ",");
}

function csvField(value: string): string {
  if (/[";\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function lineTotal(spec: ProductSpecification): number {
  if (spec.unitPrice === null || spec.unitPrice === undefined) return 0;
  return spec.quantity * Number(spec.unitPrice) * (1 + Number(spec.markupPercent ?? 0));
}

function buildCsv(areas: Area[], specsByArea: ProductSpecification[][]): string {
  const header = [
    "Ambiente",
    "Produto",
    "Fornecedor",
    "Categoria",
    "Quantidade",
    "Preço unitário",
    "Markup (%)",
    "Total da linha",
    "Status",
  ];
  const rows = areas.flatMap((area, i) =>
    specsByArea[i].map((spec) => [
      csvField(area.name),
      csvField(spec.product.name),
      csvField(spec.product.supplier ?? ""),
      csvField(spec.product.category ?? ""),
      String(spec.quantity),
      spec.unitPrice ? csvNumber(Number(spec.unitPrice)) : "",
      spec.markupPercent ? csvNumber(Number(spec.markupPercent) * 100) : "0",
      csvNumber(lineTotal(spec)),
      spec.clientApproved ? "Aprovado" : "Aguardando",
    ]),
  );
  // ﻿ (BOM) -- sem isso o Excel no Windows abre acento como lixo, já que
  // CSV puro não declara o encoding em lugar nenhum.
  return "﻿" + [header, ...rows].map((row) => row.join(";")).join("\r\n");
}

export function ExportFfeCsv({
  areas,
  specsByArea,
  projectName,
}: {
  areas: Area[];
  specsByArea: ProductSpecification[][];
  projectName: string;
}) {
  const totalSpecs = specsByArea.reduce((sum, specs) => sum + specs.length, 0);

  function handleExport() {
    const csv = buildCsv(areas, specsByArea);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `ffe_${projectName.replace(/[^\w-]+/g, "_")}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  return (
    <button
      type="button"
      onClick={handleExport}
      disabled={totalSpecs === 0}
      className="text-xs text-zinc-500 hover:underline disabled:opacity-50 dark:text-zinc-400"
    >
      Exportar planilha (CSV)
    </button>
  );
}
