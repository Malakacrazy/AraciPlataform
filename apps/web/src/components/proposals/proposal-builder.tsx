"use client";

import { useState } from "react";
import { createProposal } from "./actions";
import type { PepStage, RoleRate } from "@/lib/types";
import { PEP_STAGES } from "@/lib/pep-stages";

// Extraído de docs/fase-0/Base_Precificacao (fazer cópia).xlsx, abas 03
// (horas base por papel/estágio, "Arquiteto Líder (RT)") e 06 (cenários
// comparativos — a matriz de estágios contratados por cenário, não a
// coluna de descrição textual: as duas divergem para o cenário D na
// planilha em algumas versões — matriz é o que realmente alimenta os
// valores calculados na aba, então é a fonte usada aqui). Complexidade
// 5/5/5 em todas as dimensões reproduz o multiplicador 1.5x que a aba 06
// assume para todos os cenários (calcularMultiplicadorComplexidade:
// 0.5 + 0.2 × média = 1.5 quando média = 5).
const BASELINE_HOURS_BY_STAGE_INDEX = [10, 10, 20, 20, 15];
const BASELINE_ROLE = "Arquiteto Líder (RT)";

const SCENARIOS: { key: string; label: string; stageIndexes: number[] }[] = [
  { key: "A", label: "A — Pacote Completo", stageIndexes: [0, 1, 2, 3, 4] },
  { key: "B", label: "B — Pacote sem Stage 0", stageIndexes: [1, 2, 3, 4] },
  { key: "C", label: "C — Conceito → Executivo", stageIndexes: [2, 3, 4] },
  { key: "D", label: "D — Conceito + Anteprojeto", stageIndexes: [0, 1, 2, 3] },
  { key: "E", label: "E — Anteprojeto + Executivo", stageIndexes: [3, 4] },
  { key: "F", label: "F — Só Executivo", stageIndexes: [4] },
];

const COMPLEXITY_DIMENSIONS = [
  { key: "tipologia", label: "Tipologia" },
  { key: "programaEscopo", label: "Programa/Escopo" },
  { key: "terreno", label: "Terreno" },
  { key: "regulatorio", label: "Regulatório" },
  { key: "ambicaoDesign", label: "Ambição de Design" },
] as const;

interface RoleHourRow {
  role: string;
  stage: PepStage;
  hours: string;
}

function emptyRow(defaultRole: string): RoleHourRow {
  return { role: defaultRole, stage: "CAPTACAO_ALINHAMENTO", hours: "" };
}

export function ProposalBuilder({ opportunityId, roleRates }: { opportunityId: string; roleRates: RoleRate[] }) {
  const defaultRole = roleRates[0]?.role ?? "";
  const [rows, setRows] = useState<RoleHourRow[]>([emptyRow(defaultRole)]);
  const [scores, setScores] = useState({
    tipologia: 3,
    programaEscopo: 3,
    terreno: 3,
    regulatorio: 3,
    ambicaoDesign: 3,
  });
  const [contractedStages, setContractedStages] = useState<Set<PepStage>>(
    new Set(PEP_STAGES.map((s) => s.key)),
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateRow(index: number, patch: Partial<RoleHourRow>) {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  function addRow() {
    setRows((prev) => [...prev, emptyRow(defaultRole)]);
  }

  function removeRow(index: number) {
    setRows((prev) => prev.filter((_, i) => i !== index));
  }

  function toggleStage(stage: PepStage) {
    setContractedStages((prev) => {
      const next = new Set(prev);
      if (next.has(stage)) next.delete(stage);
      else next.add(stage);
      return next;
    });
  }

  function applyScenario(scenario: (typeof SCENARIOS)[number]) {
    const role = roleRates.find((r) => r.role === BASELINE_ROLE)?.role ?? defaultRole;
    setRows(
      scenario.stageIndexes.map((idx) => ({
        role,
        stage: PEP_STAGES[idx].key,
        hours: String(BASELINE_HOURS_BY_STAGE_INDEX[idx]),
      })),
    );
    setScores({ tipologia: 5, programaEscopo: 5, terreno: 5, regulatorio: 5, ambicaoDesign: 5 });
    setContractedStages(new Set(scenario.stageIndexes.map((idx) => PEP_STAGES[idx].key)));
    setError(null);
  }

  async function handleSubmit() {
    setError(null);
    const roleHours = rows
      .filter((r) => r.role && r.hours)
      .map((r) => ({ role: r.role, stage: r.stage, hours: Number(r.hours) }));
    if (roleHours.length === 0) {
      setError("Adicione ao menos uma linha de horas por papel/estágio.");
      return;
    }
    if (contractedStages.size === 0) {
      setError("Selecione ao menos um estágio contratado.");
      return;
    }
    setIsSubmitting(true);
    try {
      await createProposal({
        opportunityId,
        roleHours,
        complexityScores: scores,
        contractedStages: Array.from(contractedStages),
      });
      setRows([emptyRow(defaultRole)]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao calcular proposta.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {error && <p className="text-sm text-red-600">{error}</p>}

      <div>
        <h3 className="text-sm font-medium text-zinc-900 dark:text-zinc-50">Cenários (aba 06)</h3>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          Preenche horas, complexidade e estágios contratados — tudo editável antes de calcular.
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {SCENARIOS.map((scenario) => (
            <button
              key={scenario.key}
              type="button"
              onClick={() => applyScenario(scenario)}
              className="rounded-md border border-zinc-300 px-2.5 py-1 text-xs text-zinc-700 hover:border-zinc-900 dark:border-zinc-700 dark:text-zinc-300 dark:hover:border-zinc-50"
            >
              {scenario.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <h3 className="text-sm font-medium text-zinc-900 dark:text-zinc-50">Horas por papel/estágio</h3>
        <div className="mt-2 flex flex-col gap-2">
          {rows.map((row, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2">
              <select
                value={row.role}
                onChange={(e) => updateRow(i, { role: e.target.value })}
                className="rounded border border-zinc-300 bg-transparent px-2 py-1 text-sm text-zinc-900 dark:border-zinc-700 dark:text-zinc-50"
              >
                {roleRates.map((r) => (
                  <option key={r.id} value={r.role}>
                    {r.role}
                  </option>
                ))}
              </select>
              <select
                value={row.stage}
                onChange={(e) => updateRow(i, { stage: e.target.value as PepStage })}
                className="rounded border border-zinc-300 bg-transparent px-2 py-1 text-sm text-zinc-900 dark:border-zinc-700 dark:text-zinc-50"
              >
                {PEP_STAGES.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label}
                  </option>
                ))}
              </select>
              <input
                type="number"
                min="0"
                step="0.5"
                placeholder="horas"
                value={row.hours}
                onChange={(e) => updateRow(i, { hours: e.target.value })}
                className="w-24 rounded border border-zinc-300 bg-transparent px-2 py-1 text-sm text-zinc-900 dark:border-zinc-700 dark:text-zinc-50"
              />
              <button
                type="button"
                onClick={() => removeRow(i)}
                className="text-xs text-zinc-500 hover:text-red-600 dark:text-zinc-400"
              >
                Remover
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={addRow}
          className="mt-2 text-xs text-zinc-500 hover:underline dark:text-zinc-400"
        >
          + Adicionar linha
        </button>
      </div>

      <div>
        <h3 className="text-sm font-medium text-zinc-900 dark:text-zinc-50">Complexidade (1-5)</h3>
        <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-5">
          {COMPLEXITY_DIMENSIONS.map((dim) => (
            <label key={dim.key} className="flex flex-col gap-1 text-xs text-zinc-500 dark:text-zinc-400">
              {dim.label}
              <input
                type="number"
                min="1"
                max="5"
                value={scores[dim.key]}
                onChange={(e) => setScores((prev) => ({ ...prev, [dim.key]: Number(e.target.value) }))}
                className="rounded border border-zinc-300 bg-transparent px-2 py-1 text-sm text-zinc-900 dark:border-zinc-700 dark:text-zinc-50"
              />
            </label>
          ))}
        </div>
      </div>

      <div>
        <h3 className="text-sm font-medium text-zinc-900 dark:text-zinc-50">Estágios contratados</h3>
        <div className="mt-2 flex flex-wrap gap-3">
          {PEP_STAGES.map((s) => (
            <label key={s.key} className="flex items-center gap-1.5 text-xs text-zinc-700 dark:text-zinc-300">
              <input type="checkbox" checked={contractedStages.has(s.key)} onChange={() => toggleStage(s.key)} />
              {s.label}
            </label>
          ))}
        </div>
      </div>

      <button
        type="button"
        onClick={handleSubmit}
        disabled={isSubmitting}
        className="w-fit rounded-md bg-zinc-900 px-3 py-1.5 text-sm text-white disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900"
      >
        {isSubmitting ? "Calculando…" : "Calcular proposta"}
      </button>
    </div>
  );
}
