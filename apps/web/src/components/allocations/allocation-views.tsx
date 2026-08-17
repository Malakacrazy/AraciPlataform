"use client";

import { useState } from "react";
import type { Allocation } from "@/lib/types";
import { formatDateUTC } from "@/lib/format";
import { allocationCost, formatCost } from "@/lib/allocations";
import { deleteAllocation } from "./actions";

type ViewMode = "lista" | "gantt" | "calendario";

const VIEW_LABELS: Record<ViewMode, string> = {
  lista: "Lista",
  gantt: "Gantt",
  calendario: "Calendário",
};

export function AllocationViews({ allocations }: { allocations: Allocation[] }) {
  const [view, setView] = useState<ViewMode>("lista");

  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-medium text-zinc-900 dark:text-zinc-50">Alocações ativas</h2>
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
        {allocations.length === 0 ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">Nenhuma alocação ainda.</p>
        ) : (
          <>
            {view === "lista" && <ListaView allocations={allocations} />}
            {view === "gantt" && <GanttView allocations={allocations} />}
            {view === "calendario" && <CalendarioView allocations={allocations} />}
          </>
        )}
      </div>
    </section>
  );
}

function ListaView({ allocations }: { allocations: Allocation[] }) {
  return (
    <table className="w-full text-left text-sm">
      <thead>
        <tr className="border-b border-zinc-200 text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
          <th className="py-2 pr-3 font-medium">Colaborador</th>
          <th className="py-2 pr-3 font-medium">Projeto</th>
          <th className="py-2 pr-3 font-medium">Horas/semana</th>
          <th className="py-2 pr-3 font-medium">Período</th>
          <th className="py-2 pr-3 font-medium">Custo total</th>
          <th className="py-2 font-medium"></th>
        </tr>
      </thead>
      <tbody>
        {allocations.map((alloc) => (
          <tr key={alloc.id} className="border-b border-zinc-100 last:border-0 dark:border-zinc-900">
            <td className="py-2 pr-3 text-zinc-900 dark:text-zinc-50">{alloc.user.name}</td>
            <td className="py-2 pr-3 text-zinc-500 dark:text-zinc-400">{alloc.project.name}</td>
            <td className="py-2 pr-3 font-mono text-zinc-500 dark:text-zinc-400">{alloc.hoursPerWeek}h</td>
            <td className="py-2 pr-3 text-zinc-500 dark:text-zinc-400">
              {formatDateUTC(alloc.startDate)} – {formatDateUTC(alloc.endDate)}
            </td>
            <td className="py-2 pr-3 font-mono text-zinc-500 dark:text-zinc-400">{formatCost(allocationCost(alloc))}</td>
            <td className="py-2 text-right">
              <form action={deleteAllocation.bind(null, alloc.id)}>
                <button type="submit" className="text-xs text-zinc-500 hover:text-red-600 dark:text-zinc-400">
                  Remover
                </button>
              </form>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function GanttView({ allocations }: { allocations: Allocation[] }) {
  const sorted = [...allocations].sort((a, b) => a.user.name.localeCompare(b.user.name) || a.startDate.localeCompare(b.startDate));
  const min = Math.min(...allocations.map((a) => Date.parse(a.startDate)));
  const max = Math.max(...allocations.map((a) => Date.parse(a.endDate)));
  const span = Math.max(max - min, 1);

  return (
    <div className="flex flex-col gap-2">
      {sorted.map((alloc) => (
        <div key={alloc.id} className="flex items-center gap-2 text-xs">
          <span className="w-48 flex-shrink-0 truncate text-zinc-700 dark:text-zinc-300" title={`${alloc.user.name} — ${alloc.project.name}`}>
            {alloc.user.name} — {alloc.project.name}
          </span>
          <div className="relative h-5 flex-1 rounded bg-zinc-100 dark:bg-zinc-900">
            <div
              className="absolute h-full rounded bg-zinc-900 dark:bg-zinc-50"
              style={{
                left: `${((Date.parse(alloc.startDate) - min) / span) * 100}%`,
                width: `${Math.max(((Date.parse(alloc.endDate) - Date.parse(alloc.startDate)) / span) * 100, 2)}%`,
              }}
              title={`${formatDateUTC(alloc.startDate)} – ${formatDateUTC(alloc.endDate)} · ${alloc.hoursPerWeek}h/semana`}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function CalendarioView({ allocations }: { allocations: Allocation[] }) {
  // Mesmo motivo de cronograma-views.tsx: startDate/endDate chegam como
  // meia-noite UTC (data de calendário, não um momento) -- getters locais
  // deslocariam um dia para trás em fusos negativos (BRT = UTC-3).
  const earliestStart = allocations.reduce((min, a) => Math.min(min, Date.parse(a.startDate)), Infinity);
  const now = new Date();
  const initial = Number.isFinite(earliestStart) ? new Date(earliestStart) : now;
  const [cursor, setCursor] = useState(new Date(Date.UTC(initial.getUTCFullYear(), initial.getUTCMonth(), 1)));

  const year = cursor.getUTCFullYear();
  const month = cursor.getUTCMonth();
  const firstWeekday = new Date(Date.UTC(year, month, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

  function activeOn(day: number): Allocation[] {
    const date = Date.UTC(year, month, day);
    return allocations.filter((a) => Date.parse(a.startDate) <= date && date <= Date.parse(a.endDate));
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
            className={`min-h-16 rounded border p-1 text-xs ${day ? "border-zinc-200 dark:border-zinc-800" : "border-transparent"}`}
          >
            {day && (
              <>
                <div className="text-zinc-400 dark:text-zinc-600">{day}</div>
                {activeOn(day).map((alloc) => (
                  <div
                    key={alloc.id}
                    className="mt-0.5 truncate rounded bg-zinc-900 px-1 text-[10px] text-white dark:bg-zinc-50 dark:text-zinc-900"
                    title={`${alloc.user.name} — ${alloc.project.name} (${alloc.hoursPerWeek}h/semana)`}
                  >
                    {alloc.user.name}
                  </div>
                ))}
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
