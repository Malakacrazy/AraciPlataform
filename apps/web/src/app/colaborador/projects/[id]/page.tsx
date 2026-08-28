import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { cookies } from "next/headers";
import { getCollaboratorProject, CollaboratorPortalApiError, SESSION_COOKIE } from "@/lib/collaboratorPortalApi";
import { STAGE_LABELS } from "@/lib/pep-stages";

const TASK_STATUS_LABELS: Record<string, string> = {
  a_fazer: "A fazer",
  em_andamento: "Em andamento",
  concluida: "Concluída",
};

export default async function CollaboratorProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const sessionToken = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!sessionToken) {
    redirect("/colaborador/login");
  }

  const { id } = await params;

  let project: Awaited<ReturnType<typeof getCollaboratorProject>>;
  try {
    project = await getCollaboratorProject(sessionToken, id);
  } catch (err) {
    if (err instanceof CollaboratorPortalApiError) {
      if (err.status === 401) redirect("/colaborador/login");
      if (err.status === 404) notFound();
      if (err.status === 403) {
        return (
          <main className="mx-auto flex max-w-2xl flex-col gap-4 px-6 py-12">
            <Link href="/colaborador" className="text-xs text-zinc-500 hover:underline dark:text-zinc-400">
              ← Meus projetos
            </Link>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">{err.message}</p>
          </main>
        );
      }
    }
    throw err;
  }

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-6 py-12">
      <div>
        <Link href="/colaborador" className="text-xs text-zinc-500 hover:underline dark:text-zinc-400">
          ← Meus projetos
        </Link>
        <h1 className="mt-1 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">{project.name}</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">{project.client.name}</p>
      </div>

      <section className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="font-medium text-zinc-900 dark:text-zinc-50">Cronograma</h2>
        <ul className="mt-3 flex flex-col gap-3">
          {project.phases
            .filter((phase) => phase.contracted)
            .map((phase) => (
              <li key={phase.id} className="rounded-md border border-zinc-200 p-3 dark:border-zinc-800">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
                    {STAGE_LABELS[phase.stage] ?? phase.stage}
                  </span>
                  <span
                    className={
                      phase.approvedAt
                        ? "text-xs text-emerald-700 dark:text-emerald-400"
                        : "text-xs text-zinc-500 dark:text-zinc-400"
                    }
                  >
                    {phase.approvedAt ? "Aprovada" : "Pendente"}
                  </span>
                </div>
                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                  {phase.startDate ? new Date(phase.startDate).toLocaleDateString("pt-BR") : "sem início"} →{" "}
                  {phase.dueDate ? new Date(phase.dueDate).toLocaleDateString("pt-BR") : "sem prazo"}
                </p>
                {phase.tasks.length > 0 && (
                  <ul className="mt-2 flex flex-col gap-1 border-t border-zinc-100 pt-2 dark:border-zinc-900">
                    {phase.tasks.map((task) => (
                      <li key={task.id} className="flex items-center justify-between text-xs">
                        <span className="text-zinc-700 dark:text-zinc-300">
                          {task.title}
                          {task.assignee && (
                            <span className="ml-1.5 text-zinc-400 dark:text-zinc-500">— {task.assignee.name}</span>
                          )}
                        </span>
                        <span className="text-zinc-500 dark:text-zinc-400">
                          {TASK_STATUS_LABELS[task.status] ?? task.status}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
        </ul>
      </section>

      <section className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="font-medium text-zinc-900 dark:text-zinc-50">Notas</h2>
        {project.activities.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">Nenhuma nota ainda.</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-3">
            {project.activities.map((activity) => (
              <li key={activity.id} className="text-sm">
                <p className="whitespace-pre-wrap text-zinc-700 dark:text-zinc-300">{activity.body}</p>
                <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                  {activity.author.name} · {new Date(activity.createdAt).toLocaleString("pt-BR")}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
