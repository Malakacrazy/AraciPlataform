import Link from "next/link";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { listPortalProjects, PortalApiError, SESSION_COOKIE } from "@/lib/portalApi";
import { logoutPortal } from "@/components/portal/actions";

const STATUS_LABELS: Record<string, string> = {
  ativo: "Ativo",
  pausado: "Pausado",
  encerrado: "Encerrado",
};

export default async function PortalHomePage() {
  const sessionToken = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!sessionToken) {
    redirect("/portal/login");
  }

  let clientName: string;
  let projects: Awaited<ReturnType<typeof listPortalProjects>>["projects"];
  try {
    ({ clientName, projects } = await listPortalProjects(sessionToken));
  } catch (err) {
    if (err instanceof PortalApiError && err.status === 401) {
      redirect("/portal/login");
    }
    throw err;
  }

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-6 py-12">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">Olá, {clientName}</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">Seus projetos com o estúdio.</p>
        </div>
        <form action={logoutPortal}>
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
              <span className="text-zinc-900 dark:text-zinc-50">{p.name}</span>
              <span className="flex items-center gap-3">
                <span className="text-xs text-zinc-500 dark:text-zinc-400">
                  {STATUS_LABELS[p.status] ?? p.status}
                </span>
                <Link
                  href={`/present/${p.presentationToken}`}
                  className="text-xs text-zinc-500 hover:underline dark:text-zinc-400"
                >
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
