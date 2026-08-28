"use client";

import { useState } from "react";
import Link from "next/link";
import type { Opportunity } from "@/lib/types";
import { updateStage, markWon, markLost, reopen } from "./actions";

const STAGE_COLUMNS = [
  { key: "novo_lead", label: "Novo Lead" },
  { key: "qualificacao", label: "Qualificação" },
  { key: "proposta_enviada", label: "Proposta Enviada" },
  { key: "negociacao", label: "Negociação" },
] as const;

const STAGE_KEYS = new Set<string>(STAGE_COLUMNS.map((s) => s.key));

// Achado da auditoria: uma Opportunity com stage fora da lista acima
// desaparecia do board inteiro -- nenhuma coluna batia com ela em
// columnFor/filter. Esta coluna extra garante que ela sempre aparece em
// algum lugar, mesmo que o valor seja desconhecido (Opportunity.stage é
// string livre, não um enum travado no banco).
const OTHER_COLUMN = { key: "__outro__", label: "Outro" } as const;

// Mesmo espírito do approvalChannel de gate de fase: a razão só existe
// pra alimentar uma análise futura de "por que perdemos", não é um enum
// fechado no banco (Opportunity.lostReason é string livre) -- só as
// opções mais comuns, com "Outro" como fallback.
const LOST_REASONS = [
  { value: "preco", label: "Preço" },
  { value: "outro_escritorio", label: "Escolheu outro escritório" },
  { value: "projeto_cancelado", label: "Projeto cancelado pelo cliente" },
  { value: "sem_retorno", label: "Não retornou contato" },
  { value: "fora_do_escopo", label: "Fora do escopo do estúdio" },
  { value: "outro", label: "Outro" },
] as const;

function columnFor(opp: Opportunity): string {
  if (opp.wonAt) return "ganho";
  if (opp.lostAt) return "perdido";
  if (STAGE_KEYS.has(opp.stage)) return opp.stage;
  return OTHER_COLUMN.key;
}

function formatMoney(value: number): string {
  return value > 0 ? `R$ ${value.toLocaleString("pt-BR")}` : "—";
}

export function OpportunitiesBoard({ opportunities }: { opportunities: Opportunity[] }) {
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lostReasonDraft, setLostReasonDraft] = useState<Record<string, string>>({});
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);

  async function run(id: string, action: () => Promise<void>) {
    setError(null);
    setPendingId(id);
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao atualizar.");
    } finally {
      setPendingId(null);
    }
  }

  // Arrastar entre colunas de estágio move direto; soltar em "Ganho"
  // marca ganho (não precisa de dado extra, igual ao botão já existente).
  // "Perdido" fica de fora do arrastar de propósito -- exige motivo, que
  // um simples drop não capturaria; continua só pelo select+botão abaixo,
  // pra não perder essa informação.
  function handleDrop(targetKey: string, oppId: string) {
    setDragOverColumn(null);
    if (targetKey === "ganho") {
      run(oppId, () => markWon(oppId));
    } else if (STAGE_KEYS.has(targetKey)) {
      run(oppId, () => updateStage(oppId, targetKey));
    }
  }

  const columns = [
    ...STAGE_COLUMNS,
    { key: "ganho", label: "Ganho" },
    { key: "perdido", label: "Perdido" },
    OTHER_COLUMN,
  ];

  return (
    <div className="flex flex-col gap-3">
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-3 overflow-x-auto pb-2">
        {columns.map((col) => {
          const items = opportunities.filter((o) => columnFor(o) === col.key);
          if (col.key === OTHER_COLUMN.key && items.length === 0) return null;
          const total = items.reduce((sum, o) => sum + (o.estimatedValue ? Number(o.estimatedValue) : 0), 0);
          const isDroppable = col.key === "ganho" || STAGE_KEYS.has(col.key);
          return (
            <div
              key={col.key}
              id={`stage-${col.key}`}
              className={`w-64 flex-shrink-0 scroll-mt-4 rounded-md ${
                dragOverColumn === col.key && isDroppable ? "bg-zinc-100 dark:bg-zinc-900" : ""
              }`}
              onDragOver={(e) => {
                if (!isDroppable) return;
                e.preventDefault();
                setDragOverColumn(col.key);
              }}
              onDragLeave={() => setDragOverColumn((prev) => (prev === col.key ? null : prev))}
              onDrop={(e) => {
                if (!isDroppable) return;
                e.preventDefault();
                const oppId = e.dataTransfer.getData("text/plain");
                if (oppId) handleDrop(col.key, oppId);
              }}
            >
              <h3 className="mb-2 flex items-center justify-between text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                <span>
                  {col.label} <span className="text-zinc-400 dark:text-zinc-600">({items.length})</span>
                </span>
                <span className="font-mono normal-case tracking-normal text-zinc-400 dark:text-zinc-600">
                  {formatMoney(total)}
                </span>
              </h3>
              <div className="flex flex-col gap-2">
                {items.map((opp) => (
                  <div
                    key={opp.id}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData("text/plain", opp.id);
                      e.dataTransfer.effectAllowed = "move";
                    }}
                    className="cursor-grab rounded-md border border-zinc-200 bg-white p-3 text-sm active:cursor-grabbing dark:border-zinc-800 dark:bg-zinc-950"
                  >
                    <Link
                      href={`/opportunities/${opp.id}`}
                      className="font-medium text-zinc-900 hover:underline dark:text-zinc-50"
                    >
                      {opp.title}
                    </Link>
                    <br />
                    <Link
                      href={`/clients/${opp.client.id}`}
                      className="text-xs text-zinc-500 hover:underline dark:text-zinc-400"
                    >
                      {opp.client.name}
                    </Link>
                    <p className="mt-1 font-mono text-xs text-zinc-500 dark:text-zinc-400">
                      {opp.estimatedValue ? `R$ ${Number(opp.estimatedValue).toLocaleString("pt-BR")}` : "—"} ·{" "}
                      {opp.feeModel}
                    </p>

                    {opp.project ? (
                      <Link
                        href={`/projects/${opp.project.id}`}
                        className="mt-2 inline-block text-xs text-zinc-500 hover:underline dark:text-zinc-400"
                      >
                        Ver projeto →
                      </Link>
                    ) : col.key !== "perdido" && col.key !== "ganho" ? (
                      <div className="mt-2 flex flex-col gap-1.5">
                        <select
                          value={STAGE_KEYS.has(opp.stage) ? opp.stage : ""}
                          disabled={pendingId === opp.id}
                          onChange={(e) => run(opp.id, () => updateStage(opp.id, e.target.value))}
                          className="rounded border border-zinc-300 bg-transparent px-1.5 py-1 text-xs text-zinc-900 dark:border-zinc-700 dark:text-zinc-50"
                        >
                          {!STAGE_KEYS.has(opp.stage) && (
                            <option value="" disabled>
                              {opp.stage} (desconhecido)
                            </option>
                          )}
                          {STAGE_COLUMNS.map((s) => (
                            <option key={s.key} value={s.key}>
                              {s.label}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          disabled={pendingId === opp.id}
                          onClick={() => run(opp.id, () => markWon(opp.id))}
                          className="text-left text-xs text-emerald-700 hover:underline disabled:opacity-50 dark:text-emerald-400"
                        >
                          Marcar ganho
                        </button>
                        <div className="flex items-center gap-1.5">
                          <select
                            value={lostReasonDraft[opp.id] ?? ""}
                            disabled={pendingId === opp.id}
                            onChange={(e) => setLostReasonDraft((prev) => ({ ...prev, [opp.id]: e.target.value }))}
                            className="rounded border border-zinc-300 bg-transparent px-1.5 py-1 text-xs text-zinc-900 dark:border-zinc-700 dark:text-zinc-50"
                          >
                            <option value="">Motivo…</option>
                            {LOST_REASONS.map((r) => (
                              <option key={r.value} value={r.value}>
                                {r.label}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            disabled={pendingId === opp.id || !lostReasonDraft[opp.id]}
                            onClick={() => run(opp.id, () => markLost(opp.id, lostReasonDraft[opp.id]))}
                            className="text-xs text-red-600 hover:underline disabled:opacity-50 dark:text-red-400"
                          >
                            Marcar perdido
                          </button>
                        </div>
                      </div>
                    ) : col.key === "perdido" ? (
                      <div className="mt-2 flex flex-col gap-1">
                        {opp.lostReason && (
                          <p className="text-xs text-red-600 dark:text-red-400">Motivo: {opp.lostReason}</p>
                        )}
                        <button
                          type="button"
                          disabled={pendingId === opp.id}
                          onClick={() => run(opp.id, () => reopen(opp.id))}
                          className="text-left text-xs text-zinc-500 hover:underline disabled:opacity-50 dark:text-zinc-400"
                        >
                          Reabrir
                        </button>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
