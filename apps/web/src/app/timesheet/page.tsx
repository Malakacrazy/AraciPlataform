import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { apiGet } from "@/lib/api";
import type { TimeEntry, Project, User } from "@/lib/types";
import { createTimeEntry, approveTimeEntry } from "@/components/timesheet/actions";

const STAGE_LABELS: Record<string, string> = {
  CAPTACAO_ALINHAMENTO: "Captação/Alinhamento",
  BRIEFING: "Briefing",
  CRIACAO_CONCEITO: "Criação de Conceito",
  DETALHAMENTO_ACABAMENTOS: "Detalhamento/Acabamentos",
  EXECUTIVO: "Executivo",
};

const ACTIVITY_LABELS: Record<string, string> = {
  projeto: "Projeto",
  administrativo: "Administrativo",
  comercial: "Comercial",
};

export default async function TimesheetPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    redirect("/api/auth/signin");
  }

  const [entries, projects, users] = await Promise.all([
    apiGet<TimeEntry[]>("time-entries"),
    apiGet<Project[]>("projects"),
    apiGet<User[]>("users"),
  ]);

  const projectById = new Map(projects.map((p) => [p.id, p]));
  const userById = new Map(users.map((u) => [u.id, u]));

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-6 px-6 py-12">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Timesheet</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Apontamento de horas por colaborador, projeto e fase.
        </p>
      </div>

      <section className="rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
        {entries.length === 0 ? (
          <p className="p-5 text-sm text-zinc-500 dark:text-zinc-400">Nenhum lançamento ainda.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                <th className="px-5 py-3 font-medium">Colaborador</th>
                <th className="px-5 py-3 font-medium">Projeto</th>
                <th className="px-5 py-3 font-medium">Fase</th>
                <th className="px-5 py-3 font-medium">Data</th>
                <th className="px-5 py-3 font-medium">Horas</th>
                <th className="px-5 py-3 font-medium">Atividade</th>
                <th className="px-5 py-3 font-medium">Faturável</th>
                <th className="px-5 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => {
                const project = projectById.get(entry.projectId);
                const phase = project?.phases.find((p) => p.id === entry.phaseId);
                return (
                  <tr key={entry.id} className="border-b border-zinc-100 last:border-0 dark:border-zinc-900">
                    <td className="px-5 py-3 text-zinc-900 dark:text-zinc-50">
                      {userById.get(entry.userId)?.name ?? "—"}
                    </td>
                    <td className="px-5 py-3 text-zinc-500 dark:text-zinc-400">{project?.name ?? "—"}</td>
                    <td className="px-5 py-3 text-zinc-500 dark:text-zinc-400">
                      {phase ? STAGE_LABELS[phase.stage] ?? phase.stage : "—"}
                    </td>
                    <td className="px-5 py-3 text-zinc-500 dark:text-zinc-400">
                      {new Date(entry.date).toLocaleDateString("pt-BR")}
                    </td>
                    <td className="px-5 py-3 font-mono text-zinc-500 dark:text-zinc-400">{entry.hours}h</td>
                    <td className="px-5 py-3 text-zinc-500 dark:text-zinc-400">
                      {ACTIVITY_LABELS[entry.activityType] ?? entry.activityType}
                    </td>
                    <td className="px-5 py-3 text-zinc-500 dark:text-zinc-400">{entry.billable ? "Sim" : "Não"}</td>
                    <td className="px-5 py-3">
                      {entry.approvedAt ? (
                        <span className="text-xs text-emerald-700 dark:text-emerald-400">Aprovado</span>
                      ) : (
                        <form action={approveTimeEntry.bind(null, entry.id)}>
                          <button
                            type="submit"
                            className="text-xs text-zinc-500 hover:underline dark:text-zinc-400"
                          >
                            Aprovar
                          </button>
                        </form>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      <section className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="font-medium text-zinc-900 dark:text-zinc-50">Lançar horas</h2>
        <form action={createTimeEntry} className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
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
            <span className="text-zinc-500 dark:text-zinc-400">Fase (opcional)</span>
            <select
              name="phaseId"
              defaultValue=""
              className="rounded-md border border-zinc-300 bg-transparent px-3 py-1.5 text-zinc-900 dark:border-zinc-700 dark:text-zinc-50"
            >
              <option value="">—</option>
              {projects.map((p) =>
                p.phases.map((phase) => (
                  <option key={phase.id} value={phase.id}>
                    {p.name} — {STAGE_LABELS[phase.stage] ?? phase.stage}
                  </option>
                )),
              )}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-zinc-500 dark:text-zinc-400">Data *</span>
            <input
              name="date"
              type="date"
              required
              className="rounded-md border border-zinc-300 bg-transparent px-3 py-1.5 text-zinc-900 dark:border-zinc-700 dark:text-zinc-50"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-zinc-500 dark:text-zinc-400">Horas *</span>
            <input
              name="hours"
              type="number"
              min="0"
              step="0.5"
              required
              className="rounded-md border border-zinc-300 bg-transparent px-3 py-1.5 text-zinc-900 dark:border-zinc-700 dark:text-zinc-50"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-zinc-500 dark:text-zinc-400">Tipo de atividade *</span>
            <select
              name="activityType"
              required
              defaultValue="projeto"
              className="rounded-md border border-zinc-300 bg-transparent px-3 py-1.5 text-zinc-900 dark:border-zinc-700 dark:text-zinc-50"
            >
              <option value="projeto">Projeto</option>
              <option value="administrativo">Administrativo</option>
              <option value="comercial">Comercial</option>
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input name="billable" type="checkbox" defaultChecked />
            <span className="text-zinc-500 dark:text-zinc-400">Faturável</span>
          </label>
          <button
            type="submit"
            className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm text-white sm:col-span-2 sm:w-fit dark:bg-zinc-50 dark:text-zinc-900"
          >
            Lançar
          </button>
        </form>
      </section>
    </main>
  );
}
