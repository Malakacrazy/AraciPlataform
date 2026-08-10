"use client";

import { useEffect, useState } from "react";
import type { Project } from "@/lib/types";
import { STAGE_LABELS } from "@/lib/pep-stages";
import { createTimeEntry } from "./actions";

function formatElapsed(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const h = String(Math.floor(totalSeconds / 3600)).padStart(2, "0");
  const m = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, "0");
  const s = String(totalSeconds % 60).padStart(2, "0");
  return `${h}:${m}:${s}`;
}

export function Timer({ projects }: { projects: Project[] }) {
  const [projectId, setProjectId] = useState(projects[0]?.id ?? "");
  const [phaseId, setPhaseId] = useState("");
  const [activityType, setActivityType] = useState("projeto");
  const [billable, setBillable] = useState(true);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (startedAt === null) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [startedAt]);

  const selectedProject = projects.find((p) => p.id === projectId);

  function handleStart() {
    if (!projectId) {
      setError("Selecione um projeto antes de iniciar.");
      return;
    }
    setError(null);
    setStartedAt(Date.now());
    setNow(Date.now());
  }

  async function handleStop() {
    if (startedAt === null) return;
    const elapsedHours = Math.max(0.25, Math.round(((Date.now() - startedAt) / 3600000) * 4) / 4);
    const formData = new FormData();
    formData.set("projectId", projectId);
    if (phaseId) formData.set("phaseId", phaseId);
    formData.set("date", new Date().toISOString().slice(0, 10));
    formData.set("hours", String(elapsedHours));
    formData.set("activityType", activityType);
    if (billable) formData.set("billable", "on");

    setIsSubmitting(true);
    setError(null);
    try {
      await createTimeEntry(formData);
      setStartedAt(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao lançar as horas do cronômetro.");
    } finally {
      setIsSubmitting(false);
    }
  }

  const running = startedAt !== null;

  return (
    <div className="flex flex-col gap-3">
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-zinc-500 dark:text-zinc-400">Projeto</span>
          <select
            value={projectId}
            disabled={running}
            onChange={(e) => {
              setProjectId(e.target.value);
              setPhaseId("");
            }}
            className="rounded-md border border-zinc-300 bg-transparent px-3 py-1.5 text-zinc-900 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-50"
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-zinc-500 dark:text-zinc-400">Fase (opcional)</span>
          <select
            value={phaseId}
            disabled={running}
            onChange={(e) => setPhaseId(e.target.value)}
            className="rounded-md border border-zinc-300 bg-transparent px-3 py-1.5 text-zinc-900 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-50"
          >
            <option value="">—</option>
            {selectedProject?.phases.map((phase) => (
              <option key={phase.id} value={phase.id}>
                {STAGE_LABELS[phase.stage] ?? phase.stage}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-zinc-500 dark:text-zinc-400">Tipo</span>
          <select
            value={activityType}
            disabled={running}
            onChange={(e) => setActivityType(e.target.value)}
            className="rounded-md border border-zinc-300 bg-transparent px-3 py-1.5 text-zinc-900 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-50"
          >
            <option value="projeto">Projeto</option>
            <option value="administrativo">Administrativo</option>
            <option value="comercial">Comercial</option>
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={billable}
            disabled={running}
            onChange={(e) => setBillable(e.target.checked)}
          />
          <span className="text-zinc-500 dark:text-zinc-400">Faturável</span>
        </label>
      </div>

      <div className="flex items-center gap-3">
        <span className="font-mono text-2xl text-zinc-900 dark:text-zinc-50">
          {running ? formatElapsed(now - startedAt!) : "00:00:00"}
        </span>
        {running ? (
          <button
            type="button"
            onClick={handleStop}
            disabled={isSubmitting}
            className="rounded-md bg-red-600 px-3 py-1.5 text-sm text-white disabled:opacity-50"
          >
            {isSubmitting ? "Lançando…" : "Parar e lançar"}
          </button>
        ) : (
          <button
            type="button"
            onClick={handleStart}
            className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm text-white dark:bg-zinc-50 dark:text-zinc-900"
          >
            Iniciar
          </button>
        )}
      </div>
      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        Ao parar, arredonda para o quarto de hora mais próximo (mínimo 0,25h) e lança automaticamente.
      </p>
    </div>
  );
}
