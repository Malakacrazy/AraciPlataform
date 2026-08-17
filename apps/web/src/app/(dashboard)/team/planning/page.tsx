import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { apiGet } from "@/lib/api";
import type { User, Project, Allocation } from "@/lib/types";
import { formatDateUTC } from "@/lib/format";
import { allocationCost, peakHoursPerWeek, phasesBudget, groupBy } from "@/lib/allocations";
import { AllocationForm } from "@/components/allocations/allocation-form";
import { AllocationViews } from "@/components/allocations/allocation-views";

export default async function AllocationPlanningPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    redirect("/api/auth/signin");
  }

  const [users, projects, allocations] = await Promise.all([
    apiGet<User[]>("users"),
    apiGet<Project[]>("projects"),
    apiGet<Allocation[]>("allocations"),
  ]);

  const allocationsByUser = groupBy(allocations, (a) => a.userId);
  const allocationsByProject = groupBy(allocations, (a) => a.projectId);
  const projectsWithAllocations = projects.filter((p) => allocationsByProject.has(p.id));

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-6 px-6 py-12">
      <div>
        <Link href="/team" className="text-xs text-zinc-500 hover:underline dark:text-zinc-400">
          ← Equipe
        </Link>
        <h1 className="mt-1 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Planejamento de alocação</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Quem está previsto para trabalhar em qual projeto, quanto tempo, e o custo disso frente ao orçamento.
        </p>
      </div>

      <AllocationForm users={users} projects={projects} allocations={allocations} />

      <AllocationViews allocations={allocations} />

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium text-zinc-900 dark:text-zinc-50">Carga por pessoa</h2>
        {users.map((user) => {
          const userAllocations = allocationsByUser.get(user.id) ?? [];
          const peak = peakHoursPerWeek(userAllocations);
          const capacity = Number(user.weeklyCapacityHours);
          const overloaded = peak > capacity;
          return (
            <div
              key={user.id}
              className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950"
            >
              <div className="flex items-center justify-between">
                <span className="font-medium text-zinc-900 dark:text-zinc-50">{user.name}</span>
                <span
                  className={
                    overloaded ? "text-xs text-red-600 dark:text-red-400" : "text-xs text-zinc-500 dark:text-zinc-400"
                  }
                >
                  {peak}h / {capacity}h por semana no pico{overloaded && " — sobrecarregado"}
                </span>
              </div>
              {userAllocations.length > 0 && (
                <ul className="mt-2 flex flex-col gap-1 text-xs text-zinc-500 dark:text-zinc-400">
                  {userAllocations.map((a) => (
                    <li key={a.id}>
                      {a.project.name}: {a.hoursPerWeek}h/semana ({formatDateUTC(a.startDate)} – {formatDateUTC(a.endDate)})
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </section>

      {projectsWithAllocations.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-medium text-zinc-900 dark:text-zinc-50">Custo por projeto</h2>
          {projectsWithAllocations.map((project) => {
            const projectAllocations = allocationsByProject.get(project.id) ?? [];
            const costs = projectAllocations.map(allocationCost);
            const knownCost = costs.reduce((sum: number, c) => sum + (c ?? 0), 0);
            const hasUnknownCost = costs.some((c) => c === null);
            const budget = phasesBudget(project);
            const overBudget = budget > 0 && knownCost > budget;
            return (
              <div
                key={project.id}
                className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950"
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium text-zinc-900 dark:text-zinc-50">{project.name}</span>
                  <span
                    className={
                      overBudget ? "text-xs text-red-600 dark:text-red-400" : "text-xs text-zinc-500 dark:text-zinc-400"
                    }
                  >
                    {budget > 0 ? (
                      <>
                        R$ {knownCost.toLocaleString("pt-BR", { maximumFractionDigits: 0 })} alocado de R${" "}
                        {budget.toLocaleString("pt-BR", { maximumFractionDigits: 0 })} orçado
                        {overBudget && " — acima do orçamento"}
                      </>
                    ) : (
                      <>R$ {knownCost.toLocaleString("pt-BR", { maximumFractionDigits: 0 })} alocado — sem orçamento definido nas fases</>
                    )}
                    {hasUnknownCost && " (parcial — falta custo-hora de alguém)"}
                  </span>
                </div>
              </div>
            );
          })}
        </section>
      )}
    </main>
  );
}
