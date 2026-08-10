"use client";

import { useState } from "react";
import type { ProjectPhase } from "@/lib/types";
import { STAGE_LABELS } from "@/lib/pep-stages";
import { formatDateUTC } from "@/lib/format";
import { approveGate, createInvoice, updatePhaseDates } from "./actions";

type ViewMode = "lista" | "kanban" | "gantt" | "calendario";

const VIEW_LABELS: Record<ViewMode, string> = {
  lista: "Lista",
  kanban: "Kanban",
  gantt: "Gantt",
  calendario: "Calendário",
};

function statusOf(phase: ProjectPhase, previousApproved: boolean): "concluida" | "andamento" | "pendente" {
  if (phase.approvedAt) return "concluida";
  if (previousApproved) return "andamento";
  return "pendente";
}

export function CronogramaViews({
  projectId,
  phases,
  invoicedPhaseIds,
}: {
  projectId: string;
  phases: ProjectPhase[];
  invoicedPhaseIds: string[];
}) {
  const [view, setView] = useState<ViewMode>("lista");
  const invoiced = new Set(invoicedPhaseIds);
  const contracted = [...phases].filter((p) => p.contracted).sort((a, b) => a.order - b.order);

  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-medium text-zinc-900 dark:text-zinc-50">Cronograma</h2>
        <div className="flex gap-1 rounded-md border border-zinc-200 p-0.5 dark:border-zinc-800">
          {(Object.keys(VIEW_LABELS) as ViewMode[]).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setView(mode)}
              className={`rounded px-2 py-1 text-xs ${
                view === mode
                  ? "bg-zinc-900 text-white dark:bg-zinc-50 dark:text-zinc-900"
                  : "text-zinc-500 dark:text-zinc-400"
              }`}
            >
              {VIEW_LABELS[mode]}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4">
        {view === "lista" && (
          <ListaView projectId={projectId} contracted={contracted} invoiced={invoiced} />
        )}
        {view === "kanban" && <KanbanView contracted={contracted} />}
        {view === "gantt" && <GanttView contracted={contracted} />}
        {view === "calendario" && <CalendarioView contracted={contracted} />}
      </div>
    </section>
  );
}

function ListaView({
  projectId,
  contracted,
  invoiced,
}: {
  projectId: string;
  contracted: ProjectPhase[];
  invoiced: Set<string>;
}) {
  return (
    <div className="flex flex-col gap-3">
      {contracted.map((phase, index) => {
        const previousApproved = index === 0 || Boolean(contracted[index - 1].approvedAt);
        return (
          <div key={phase.id} className="rounded-md border border-zinc-200 p-3 text-sm dark:border-zinc-800">
            <div className="flex items-center justify-between">
              <span className="text-zinc-900 dark:text-zinc-50">{STAGE_LABELS[phase.stage] ?? phase.stage}</span>
              {phase.approvedAt ? (
                <span className="text-xs text-emerald-700 dark:text-emerald-400">
                  Aprovada ({phase.approvalChannel})
                </span>
              ) : (
                <span className="text-xs text-zinc-500 dark:text-zinc-400">Pendente</span>
              )}
            </div>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              {phase.startDate ? formatDateUTC(phase.startDate) : "sem início"} →{" "}
              {phase.dueDate ? formatDateUTC(phase.dueDate) : "sem prazo"}
              {phase.budget ? ` · orçamento R$ ${Number(phase.budget).toLocaleString("pt-BR")}` : ""}
            </p>

            {!phase.approvedAt && previousApproved && (
              <form action={approveGate.bind(null, projectId, phase.id)} className="mt-2 flex items-center gap-2">
                <select
                  name="approvalChannel"
                  required
                  defaultValue=""
                  className="rounded border border-zinc-300 bg-transparent px-2 py-1 text-xs text-zinc-900 dark:border-zinc-700 dark:text-zinc-50"
                >
                  <option value="" disabled>
                    Canal…
                  </option>
                  <option value="email">E-mail</option>
                  <option value="reuniao_presencial">Reunião presencial</option>
                </select>
                <button type="submit" className="text-xs text-zinc-500 hover:underline dark:text-zinc-400">
                  Aprovar gate
                </button>
              </form>
            )}
            {phase.approvedAt && !invoiced.has(phase.id) && (
              <form action={createInvoice.bind(null, projectId, phase.id)} className="mt-2 flex items-center gap-2">
                <input
                  name="amount"
                  type="number"
                  min="0"
                  step="0.01"
                  required
                  placeholder="valor R$"
                  className="w-28 rounded border border-zinc-300 bg-transparent px-2 py-1 text-xs text-zinc-900 dark:border-zinc-700 dark:text-zinc-50"
                />
                <button type="submit" className="text-xs text-zinc-500 hover:underline dark:text-zinc-400">
                  Faturar
                </button>
              </form>
            )}

            <details className="mt-2">
              <summary className="cursor-pointer text-xs text-zinc-500 hover:underline dark:text-zinc-400">
                Editar datas/orçamento
              </summary>
              <form
                action={updatePhaseDates.bind(null, projectId, phase.id)}
                className="mt-2 flex flex-wrap items-end gap-2"
              >
                <label className="flex flex-col gap-1 text-xs text-zinc-500 dark:text-zinc-400">
                  Início
                  <input
                    name="startDate"
                    type="date"
                    defaultValue={phase.startDate ? phase.startDate.slice(0, 10) : ""}
                    className="rounded border border-zinc-300 bg-transparent px-2 py-1 text-xs text-zinc-900 dark:border-zinc-700 dark:text-zinc-50"
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs text-zinc-500 dark:text-zinc-400">
                  Prazo
                  <input
                    name="dueDate"
                    type="date"
                    defaultValue={phase.dueDate ? phase.dueDate.slice(0, 10) : ""}
                    className="rounded border border-zinc-300 bg-transparent px-2 py-1 text-xs text-zinc-900 dark:border-zinc-700 dark:text-zinc-50"
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs text-zinc-500 dark:text-zinc-400">
                  Orçamento (R$)
                  <input
                    name="budget"
                    type="number"
                    min="0"
                    step="0.01"
                    defaultValue={phase.budget ?? ""}
                    className="w-28 rounded border border-zinc-300 bg-transparent px-2 py-1 text-xs text-zinc-900 dark:border-zinc-700 dark:text-zinc-50"
                  />
                </label>
                <button type="submit" className="text-xs text-zinc-500 hover:underline dark:text-zinc-400">
                  Salvar
                </button>
              </form>
            </details>
          </div>
        );
      })}
    </div>
  );
}

function KanbanView({ contracted }: { contracted: ProjectPhase[] }) {
  const columns: { key: "pendente" | "andamento" | "concluida"; label: string }[] = [
    { key: "pendente", label: "Pendente" },
    { key: "andamento", label: "Em andamento" },
    { key: "concluida", label: "Concluída" },
  ];
  return (
    <div className="flex gap-3 overflow-x-auto">
      {columns.map((col) => {
        const items = contracted.filter((phase, index) => {
          const previousApproved = index === 0 || Boolean(contracted[index - 1].approvedAt);
          return statusOf(phase, previousApproved) === col.key;
        });
        return (
          <div key={col.key} className="w-48 flex-shrink-0">
            <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              {col.label} <span className="text-zinc-400 dark:text-zinc-600">({items.length})</span>
            </h3>
            <div className="flex flex-col gap-2">
              {items.map((phase) => (
                <div
                  key={phase.id}
                  className="rounded-md border border-zinc-200 bg-white p-2 text-xs dark:border-zinc-800 dark:bg-zinc-950"
                >
                  {STAGE_LABELS[phase.stage] ?? phase.stage}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function GanttView({ contracted }: { contracted: ProjectPhase[] }) {
  const dated = contracted.filter((p) => p.startDate && p.dueDate);
  if (dated.length === 0) {
    return (
      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        Nenhuma fase com início e prazo definidos ainda — defina datas na Lista para ver o Gantt.
      </p>
    );
  }
  const starts = dated.map((p) => new Date(p.startDate!).getTime());
  const ends = dated.map((p) => new Date(p.dueDate!).getTime());
  const min = Math.min(...starts);
  const max = Math.max(...ends);
  const span = Math.max(max - min, 1);

  return (
    <div className="flex flex-col gap-2">
      {contracted.map((phase) => {
        const hasDates = phase.startDate && phase.dueDate;
        return (
          <div key={phase.id} className="flex items-center gap-2 text-xs">
            <span className="w-40 flex-shrink-0 text-zinc-700 dark:text-zinc-300">
              {STAGE_LABELS[phase.stage] ?? phase.stage}
            </span>
            <div className="relative h-5 flex-1 rounded bg-zinc-100 dark:bg-zinc-900">
              {hasDates ? (
                <div
                  className="absolute h-full rounded bg-zinc-900 dark:bg-zinc-50"
                  style={{
                    left: `${((new Date(phase.startDate!).getTime() - min) / span) * 100}%`,
                    width: `${Math.max(
                      ((new Date(phase.dueDate!).getTime() - new Date(phase.startDate!).getTime()) / span) * 100,
                      2,
                    )}%`,
                  }}
                />
              ) : (
                <span className="absolute inset-0 flex items-center px-2 text-zinc-400 dark:text-zinc-600">
                  sem data
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function CalendarioView({ contracted }: { contracted: ProjectPhase[] }) {
  // Tudo em UTC aqui, de propósito: startDate/dueDate chegam como meia-noite
  // UTC (data de calendário, não um momento), e getters locais (getDate(),
  // getMonth()...) deslocam um dia para trás em fusos negativos (BRT =
  // UTC-3). Ver lib/format.ts.
  const dated = contracted.filter((p) => p.dueDate);
  const now = new Date();
  const initialYear = dated.length > 0 ? new Date(dated[0].dueDate!).getUTCFullYear() : now.getUTCFullYear();
  const initialMonth = dated.length > 0 ? new Date(dated[0].dueDate!).getUTCMonth() : now.getUTCMonth();
  const [cursor, setCursor] = useState(new Date(Date.UTC(initialYear, initialMonth, 1)));

  const year = cursor.getUTCFullYear();
  const month = cursor.getUTCMonth();
  const firstWeekday = new Date(Date.UTC(year, month, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

  const dueByDay = new Map<number, ProjectPhase[]>();
  for (const phase of dated) {
    const d = new Date(phase.dueDate!);
    if (d.getUTCFullYear() === year && d.getUTCMonth() === month) {
      const list = dueByDay.get(d.getUTCDate()) ?? [];
      list.push(phase);
      dueByDay.set(d.getUTCDate(), list);
    }
  }

  const cells: (number | null)[] = [
    ...Array(firstWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <button
          type="button"
          onClick={() => setCursor(new Date(Date.UTC(year, month - 1, 1)))}
          className="text-xs text-zinc-500 hover:underline dark:text-zinc-400"
        >
          ← Anterior
        </button>
        <span className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
          {cursor.toLocaleDateString("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" })}
        </span>
        <button
          type="button"
          onClick={() => setCursor(new Date(Date.UTC(year, month + 1, 1)))}
          className="text-xs text-zinc-500 hover:underline dark:text-zinc-400"
        >
          Próximo →
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-xs text-zinc-400 dark:text-zinc-600">
        {["D", "S", "T", "Q", "Q", "S", "S"].map((d, i) => (
          <div key={i}>{d}</div>
        ))}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1">
        {cells.map((day, i) => (
          <div
            key={i}
            className={`min-h-14 rounded border p-1 text-xs ${
              day ? "border-zinc-200 dark:border-zinc-800" : "border-transparent"
            }`}
          >
            {day && (
              <>
                <div className="text-zinc-400 dark:text-zinc-600">{day}</div>
                {(dueByDay.get(day) ?? []).map((phase) => (
                  <div
                    key={phase.id}
                    className="mt-0.5 truncate rounded bg-zinc-900 px-1 text-[10px] text-white dark:bg-zinc-50 dark:text-zinc-900"
                    title={STAGE_LABELS[phase.stage] ?? phase.stage}
                  >
                    {STAGE_LABELS[phase.stage] ?? phase.stage}
                  </div>
                ))}
              </>
            )}
          </div>
        ))}
      </div>
      {dated.length === 0 && (
        <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
          Nenhuma fase com prazo definido ainda — defina datas na Lista para ver marcadores aqui.
        </p>
      )}
    </div>
  );
}
