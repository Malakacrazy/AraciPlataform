import type { ProjectPhase, Task, User } from "@/lib/types";
import { STAGE_LABELS } from "@/lib/pep-stages";
import { createTask, updateTaskStatus, deleteTask } from "@/components/projects/actions";

const STATUS_LABELS: Record<string, string> = {
  a_fazer: "A fazer",
  em_andamento: "Em andamento",
  concluida: "Concluída",
};

const NEXT_STATUS: Record<string, string> = {
  a_fazer: "em_andamento",
  em_andamento: "concluida",
};

// Nenhum lugar da plataforma expunha o Task model antes disso -- existia
// no schema desde o início, sem controller, sem service, sem tela
// (achado da auditoria: "dead code"). Agrupado por fase (não uma lista
// solta) porque é assim que o resto da página já organiza o projeto
// (Cronograma), e uma tarefa sempre nasce dentro de uma fase específica.
export function TaskList({
  projectId,
  phases,
  tasks,
  users,
}: {
  projectId: string;
  phases: ProjectPhase[];
  tasks: Task[];
  users: User[];
}) {
  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
      <h2 className="font-medium text-zinc-900 dark:text-zinc-50">Tarefas</h2>
      <div className="mt-3 flex flex-col gap-5">
        {phases.map((phase) => {
          const phaseTasks = tasks.filter((t) => t.phase.id === phase.id);
          // Dependência pode apontar pra qualquer fase do projeto (uma
          // tarefa de uma fase posterior pode depender de algo de uma
          // fase anterior) -- por isso as opções do seletor são todas as
          // tarefas do projeto, não só as desta fase.
          const dependencyOptions = tasks;

          return (
            <div key={phase.id}>
              <h3 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                {STAGE_LABELS[phase.stage] ?? phase.stage}
              </h3>
              {phaseTasks.length === 0 ? (
                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">Nenhuma tarefa ainda.</p>
              ) : (
                <ul className="mt-2 flex flex-col gap-1.5">
                  {phaseTasks.map((task) => {
                    const incompleteDeps = task.dependsOn.filter((d) => d.status !== "concluida");
                    const blocked = incompleteDeps.length > 0;
                    const nextStatus = NEXT_STATUS[task.status];
                    return (
                      <li
                        key={task.id}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-800"
                      >
                        <div>
                          <span
                            className={
                              task.status === "concluida"
                                ? "text-zinc-500 line-through dark:text-zinc-400"
                                : "text-zinc-900 dark:text-zinc-50"
                            }
                          >
                            {task.title}
                          </span>
                          {task.assignee && (
                            <span className="ml-2 text-xs text-zinc-500 dark:text-zinc-400">{task.assignee.name}</span>
                          )}
                          {task.dueDate && (
                            <span className="ml-2 text-xs text-zinc-400 dark:text-zinc-600">
                              até {new Date(task.dueDate).toLocaleDateString("pt-BR")}
                            </span>
                          )}
                          {blocked && (
                            <span className="ml-2 text-xs text-amber-600 dark:text-amber-400">
                              bloqueada por {incompleteDeps.map((d) => d.title).join(", ")}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-xs">
                          <span className="text-zinc-500 dark:text-zinc-400">{STATUS_LABELS[task.status]}</span>
                          {nextStatus && (
                            <form action={updateTaskStatus.bind(null, projectId, task.id, nextStatus)}>
                              <button
                                type="submit"
                                disabled={nextStatus === "concluida" && blocked}
                                className="text-zinc-500 hover:underline disabled:cursor-not-allowed disabled:opacity-40 dark:text-zinc-400"
                                title={nextStatus === "concluida" && blocked ? "Conclua as dependências primeiro" : undefined}
                              >
                                {nextStatus === "em_andamento" ? "Iniciar" : "Concluir"}
                              </button>
                            </form>
                          )}
                          <form action={deleteTask.bind(null, projectId, task.id)}>
                            <button type="submit" className="text-zinc-500 hover:text-red-600 dark:text-zinc-400">
                              Remover
                            </button>
                          </form>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}

              <form action={createTask.bind(null, projectId, phase.id)} className="mt-2 flex flex-wrap items-end gap-2">
                <input
                  name="title"
                  required
                  placeholder="Nova tarefa…"
                  className="w-48 rounded border border-zinc-300 bg-transparent px-2 py-1 text-sm text-zinc-900 dark:border-zinc-700 dark:text-zinc-50"
                />
                <select
                  name="assigneeId"
                  defaultValue=""
                  className="rounded border border-zinc-300 bg-transparent px-2 py-1 text-sm text-zinc-900 dark:border-zinc-700 dark:text-zinc-50"
                >
                  <option value="">— responsável —</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
                <input
                  name="dueDate"
                  type="date"
                  className="rounded border border-zinc-300 bg-transparent px-2 py-1 text-sm text-zinc-900 dark:border-zinc-700 dark:text-zinc-50"
                />
                {dependencyOptions.length > 0 && (
                  <select
                    name="dependsOnIds"
                    multiple
                    size={Math.min(4, dependencyOptions.length)}
                    className="w-48 rounded border border-zinc-300 bg-transparent px-2 py-1 text-xs text-zinc-900 dark:border-zinc-700 dark:text-zinc-50"
                  >
                    {dependencyOptions.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.title}
                      </option>
                    ))}
                  </select>
                )}
                <button
                  type="submit"
                  className="rounded-md bg-zinc-900 px-3 py-1.5 text-xs text-white dark:bg-zinc-50 dark:text-zinc-900"
                >
                  Adicionar
                </button>
              </form>
            </div>
          );
        })}
      </div>
    </section>
  );
}
