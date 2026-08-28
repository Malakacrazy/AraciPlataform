import Link from "next/link";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { listCollaboratorProjects, CollaboratorPortalApiError, SESSION_COOKIE } from "@/lib/collaboratorPortalApi";
import { logoutCollaborator } from "@/components/collaborator-portal/actions";

const STATUS_LABELS: Record<string, string> = {
  ativo: "Ativo",
  pausado: "Pausado",
  encerrado: "Encerrado",
};

export default async function CollaboratorHomePage() {
  const sessionToken = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!sessionToken) {
    redirect("/colaborador/login");
  }

  let collaboratorName: string;
  let projects: Awaited<ReturnType<typeof listCollaboratorProjects>>["projects"];
  try {
    ({ collaboratorName, projects } = await listCollaboratorProjects(sessionToken));
  } catch (err) {
    if (err instanceof CollaboratorPortalApiError && err.status === 401) {
      redirect("/colaborador/login");
    }
    throw err;
  }

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-6 py-12">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">Olá, {collaboratorName}</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">Projetos em que você foi convidado como consultor.</p>
        </div>
        <form action={logoutCollaborator}>
          <button type="submit" className="text-xs text-zinc-500 hover:underline dark:text-zinc-400">
            Sair
          </button>
        </form>
      </div>

      {projects.length === 0 ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">Nenhum projeto ainda.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {projects.map((p) => (
            <li
              key={p.id}
              className="flex items-center justify-between gap-3 rounded-md border border-zinc-200 bg-white px-4 py-3 text-sm dark:border-zinc-800 dark:bg-zinc-950"
            >
              <div>
                <span className="text-zinc-900 dark:text-zinc-50">{p.name}</span>
                <span className="ml-2 text-xs text-zinc-500 dark:text-zinc-400">{p.clientName}</span>
              </div>
              <span className="flex items-center gap-3">
                <span className="text-xs text-zinc-500 dark:text-zinc-400">{STATUS_LABELS[p.status] ?? p.status}</span>
                <Link href={`/colaborador/projects/${p.id}`} className="text-xs text-zinc-500 hover:underline dark:text-zinc-400">
                  Ver projeto →
                </Link>
              </span>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
