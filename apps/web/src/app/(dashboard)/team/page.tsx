import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { apiGet } from "@/lib/api";
import type { User, TimeEntry, Project, Me } from "@/lib/types";
import { updateUser } from "@/components/team/actions";
import { ApiKeyPanel } from "@/components/team/api-key-panel";

const DAY_MS = 24 * 60 * 60 * 1000;

// Carga recente é derivada de TimeEntry (retrospectivo: o que já foi
// lançado) -- diferente do planejamento de alocação em /team/planning
// (prospectivo: o que está previsto pra frente, via Allocation). Isto só
// soma os últimos N dias corridos (janela rolante, não mês-calendário --
// mais simples e sem ambiguidade de fuso).
function workloadByUser(entries: TimeEntry[], projectById: Map<string, Project>) {
  const now = Date.now();
  const byUser = new Map<string, { hours7d: number; hours30d: number; projectNames: Set<string> }>();

  for (const entry of entries) {
    const ageMs = now - Date.parse(entry.date);
    const hours = Number(entry.hours);
    const bucket = byUser.get(entry.userId) ?? { hours7d: 0, hours30d: 0, projectNames: new Set<string>() };

    if (ageMs <= 30 * DAY_MS) {
      bucket.hours30d += hours;
      const projectName = projectById.get(entry.projectId)?.name;
      if (projectName) bucket.projectNames.add(projectName);
    }
    if (ageMs <= 7 * DAY_MS) {
      bucket.hours7d += hours;
    }

    byUser.set(entry.userId, bucket);
  }

  return byUser;
}

export default async function TeamPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    redirect("/api/auth/signin");
  }

  const [me, users, entries, projects] = await Promise.all([
    apiGet<Me>("me"),
    apiGet<User[]>("users"),
    apiGet<TimeEntry[]>("time-entries"),
    apiGet<Project[]>("projects"),
  ]);
  const isAdmin = me.accessLevel === "admin";
  const projectById = new Map(projects.map((p) => [p.id, p]));
  const workload = workloadByUser(entries, projectById);

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-12">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Equipe</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Cadastro de equipe com papel, especialidade e custo-hora. Colaboradores entram via login SSO — sem
          cadastro manual aqui.
        </p>
        <Link href="/team/planning" className="mt-1 inline-block text-xs text-zinc-500 hover:underline dark:text-zinc-400">
          Ver planejamento de alocação →
        </Link>
      </div>

      <div className="flex flex-col gap-3">
        {users.map((user) => {
          const load = workload.get(user.id);
          return (
            <section
              key={user.id}
              className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950"
            >
              <h2 className="font-medium text-zinc-900 dark:text-zinc-50">{user.name}</h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">{user.email}</p>

              {!load || load.hours30d === 0 ? (
                <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">Sem horas lançadas nos últimos 30 dias.</p>
              ) : (
                <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                  <span className="font-mono text-zinc-700 dark:text-zinc-300">{load.hours7d}h</span> nos últimos 7 dias
                  · <span className="font-mono text-zinc-700 dark:text-zinc-300">{load.hours30d}h</span> nos últimos 30
                  {load.projectNames.size > 0 && <> — {Array.from(load.projectNames).join(", ")}</>}
                </p>
              )}

              <form action={updateUser.bind(null, user.id)} className="mt-3 flex flex-wrap items-end gap-3">
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-zinc-500 dark:text-zinc-400">Papel</span>
                  <input
                    name="role"
                    defaultValue={user.role}
                    className="w-48 rounded-md border border-zinc-300 bg-transparent px-3 py-1.5 text-zinc-900 dark:border-zinc-700 dark:text-zinc-50"
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-zinc-500 dark:text-zinc-400">Especialidade</span>
                  <input
                    name="specialty"
                    defaultValue={user.specialty ?? ""}
                    className="w-40 rounded-md border border-zinc-300 bg-transparent px-3 py-1.5 text-zinc-900 dark:border-zinc-700 dark:text-zinc-50"
                  />
                </label>
                {isAdmin && (
                  <label className="flex flex-col gap-1 text-sm">
                    <span className="text-zinc-500 dark:text-zinc-400">Custo-hora (R$)</span>
                    <input
                      name="costPerHour"
                      type="number"
                      min="0"
                      step="0.01"
                      defaultValue={user.costPerHour ?? ""}
                      className="w-32 rounded-md border border-zinc-300 bg-transparent px-3 py-1.5 text-zinc-900 dark:border-zinc-700 dark:text-zinc-50"
                    />
                  </label>
                )}
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-zinc-500 dark:text-zinc-400">Capacidade (h/semana)</span>
                  <input
                    name="weeklyCapacityHours"
                    type="number"
                    min="0"
                    step="0.5"
                    defaultValue={user.weeklyCapacityHours}
                    className="w-32 rounded-md border border-zinc-300 bg-transparent px-3 py-1.5 text-zinc-900 dark:border-zinc-700 dark:text-zinc-50"
                  />
                </label>
                {isAdmin && (
                  <label className="flex flex-col gap-1 text-sm">
                    <span className="text-zinc-500 dark:text-zinc-400">Acesso</span>
                    <select
                      name="accessLevel"
                      key={user.accessLevel}
                      defaultValue={user.accessLevel}
                      disabled={user.id === me.userId}
                      title={user.id === me.userId ? "Você não pode alterar seu próprio nível de acesso." : undefined}
                      className="w-32 rounded-md border border-zinc-300 bg-transparent px-3 py-1.5 text-zinc-900 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-50"
                    >
                      <option value="staff">Staff</option>
                      <option value="admin">Admin</option>
                    </select>
                  </label>
                )}
                <button
                  type="submit"
                  className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm text-white dark:bg-zinc-50 dark:text-zinc-900"
                >
                  Salvar
                </button>
              </form>

              <ApiKeyPanel userId={user.id} hasKey={Boolean(user.apiKeyHash)} />
            </section>
          );
        })}
      </div>
    </main>
  );
}
