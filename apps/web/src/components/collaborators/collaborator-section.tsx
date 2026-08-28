import type { ProjectCollaborator } from "@/lib/types";
import { inviteCollaborator, revokeCollaborator } from "./actions";

// Lacuna da matriz ("colaboração com consultores externos") -- server
// component simples (mesmo padrão de AbsenceSection): sem estado de
// cliente nenhum, só formulário + lista, cada ação já revalida a página.
export function CollaboratorSection({ projectId, collaborators }: { projectId: string; collaborators: ProjectCollaborator[] }) {
  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
      <h2 className="font-medium text-zinc-900 dark:text-zinc-50">Consultores externos</h2>
      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
        Acesso só-leitura a este projeto (cronograma, tarefas e notas — nunca financeiro), por magic link próprio em{" "}
        <code>/colaborador</code>, sem virar staff do estúdio.
      </p>

      {collaborators.length === 0 ? (
        <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">Nenhum consultor convidado ainda.</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2">
          {collaborators.map((c) => (
            <li
              key={c.id}
              className="flex items-center justify-between gap-3 rounded-md border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-800"
            >
              <span className="text-zinc-900 dark:text-zinc-50">
                {c.collaborator.name} <span className="text-xs text-zinc-500 dark:text-zinc-400">{c.collaborator.email}</span>
              </span>
              <form action={revokeCollaborator.bind(null, projectId, c.collaborator.id)}>
                <button type="submit" className="text-xs text-zinc-500 hover:text-red-600 dark:text-zinc-400">
                  Revogar
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}

      <form action={inviteCollaborator.bind(null, projectId)} className="mt-4 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-zinc-500 dark:text-zinc-400">Nome</span>
          <input
            name="name"
            required
            className="w-40 rounded-md border border-zinc-300 bg-transparent px-3 py-1.5 text-zinc-900 dark:border-zinc-700 dark:text-zinc-50"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-zinc-500 dark:text-zinc-400">E-mail</span>
          <input
            name="email"
            type="email"
            required
            className="w-52 rounded-md border border-zinc-300 bg-transparent px-3 py-1.5 text-zinc-900 dark:border-zinc-700 dark:text-zinc-50"
          />
        </label>
        <button
          type="submit"
          className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm text-white dark:bg-zinc-50 dark:text-zinc-900"
        >
          Convidar
        </button>
      </form>
    </section>
  );
}
