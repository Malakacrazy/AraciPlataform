"use client";

import { useMemo, useState } from "react";
import type { Allocation, Project, User } from "@/lib/types";
import { peakHoursInWindow, peakHoursPerWeek } from "@/lib/allocations";
import { createAllocation } from "./actions";

export function AllocationForm({
  users,
  projects,
  allocations,
}: {
  users: User[];
  projects: Project[];
  allocations: Allocation[];
}) {
  const [specialtyQuery, setSpecialtyQuery] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const allocationsByUser = useMemo(() => {
    const map = new Map<string, Allocation[]>();
    for (const alloc of allocations) {
      map.set(alloc.userId, [...(map.get(alloc.userId) ?? []), alloc]);
    }
    return map;
  }, [allocations]);

  // Sugestão de quem alocar: ordena por disponibilidade (no período
  // escolhido, se as duas datas já foram preenchidas -- senão pela carga
  // geral atual) e, quando uma especialidade é buscada, prioriza quem
  // combina. Não esconde ninguém: "especialidade" é texto livre e pode
  // não bater por digitação/nomenclatura, não porque a pessoa não serve.
  const rankedUsers = useMemo(() => {
    const query = specialtyQuery.trim().toLowerCase();
    return users
      .map((user) => {
        const userAllocations = allocationsByUser.get(user.id) ?? [];
        const committed =
          startDate && endDate
            ? peakHoursInWindow(userAllocations, startDate, endDate)
            : peakHoursPerWeek(userAllocations);
        const availableHours = Math.round((Number(user.weeklyCapacityHours) - committed) * 10) / 10;
        const matchesSpecialty = query.length > 0 && (user.specialty ?? "").toLowerCase().includes(query);
        return { user, availableHours, matchesSpecialty };
      })
      .sort((a, b) => {
        if (a.matchesSpecialty !== b.matchesSpecialty) return a.matchesSpecialty ? -1 : 1;
        return b.availableHours - a.availableHours;
      });
  }, [users, allocationsByUser, startDate, endDate, specialtyQuery]);

  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
      <h2 className="font-medium text-zinc-900 dark:text-zinc-50">Nova alocação</h2>
      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
        A lista de colaboradores abaixo é ordenada por disponibilidade no período (e por especialidade, se buscada) — a
        escolha final é sua.
      </p>
      <form action={createAllocation} className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm sm:col-span-2">
          <span className="text-zinc-500 dark:text-zinc-400">Especialidade desejada (opcional)</span>
          <input
            type="text"
            value={specialtyQuery}
            onChange={(e) => setSpecialtyQuery(e.target.value)}
            placeholder="ex.: renderista, arquiteta sênior"
            className="rounded-md border border-zinc-300 bg-transparent px-3 py-1.5 text-zinc-900 dark:border-zinc-700 dark:text-zinc-50"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-zinc-500 dark:text-zinc-400">Colaborador *</span>
          <select
            name="userId"
            required
            defaultValue=""
            className="rounded-md border border-zinc-300 bg-transparent px-3 py-1.5 text-zinc-900 dark:border-zinc-700 dark:text-zinc-50"
          >
            <option value="" disabled>
              Selecione…
            </option>
            {rankedUsers.map(({ user, availableHours, matchesSpecialty }) => (
              <option key={user.id} value={user.id}>
                {user.name}
                {user.specialty ? ` — ${user.specialty}` : ""} · {availableHours}h livres
                {matchesSpecialty ? " ✓" : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-zinc-500 dark:text-zinc-400">Projeto *</span>
          <select
            name="projectId"
            required
            defaultValue=""
            className="rounded-md border border-zinc-300 bg-transparent px-3 py-1.5 text-zinc-900 dark:border-zinc-700 dark:text-zinc-50"
          >
            <option value="" disabled>
              Selecione…
            </option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-zinc-500 dark:text-zinc-400">Horas/semana *</span>
          <input
            name="hoursPerWeek"
            type="number"
            min="0.5"
            step="0.5"
            required
            className="rounded-md border border-zinc-300 bg-transparent px-3 py-1.5 text-zinc-900 dark:border-zinc-700 dark:text-zinc-50"
          />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-zinc-500 dark:text-zinc-400">Início *</span>
            <input
              name="startDate"
              type="date"
              required
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="rounded-md border border-zinc-300 bg-transparent px-3 py-1.5 text-zinc-900 dark:border-zinc-700 dark:text-zinc-50"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-zinc-500 dark:text-zinc-400">Fim *</span>
            <input
              name="endDate"
              type="date"
              required
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="rounded-md border border-zinc-300 bg-transparent px-3 py-1.5 text-zinc-900 dark:border-zinc-700 dark:text-zinc-50"
            />
          </label>
        </div>
        <button
          type="submit"
          className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm text-white sm:col-span-2 sm:w-fit dark:bg-zinc-50 dark:text-zinc-900"
        >
          Alocar
        </button>
      </form>
    </section>
  );
}
