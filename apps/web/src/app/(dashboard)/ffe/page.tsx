import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { apiGet } from "@/lib/api";
import type { Project } from "@/lib/types";

// FF&E é por projeto (não existe um catálogo/carrinho global) -- esta
// página só lista os projetos e leva para /projects/:id/ffe, igual ao
// link "Ver FF&E →" que já existe na página de detalhe do projeto. Existe
// só para dar à seção um item de primeiro nível na navbar.
export default async function FfeIndexPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    redirect("/api/auth/signin");
  }

  const projects = await apiGet<Project[]>("projects");

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-6 px-6 py-12">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">FF&E</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Escolha um projeto para especificar ambientes, montar pranchas e gerar o link de apresentação.
        </p>
      </div>

      <section className="rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
        {projects.length === 0 ? (
          <p className="p-5 text-sm text-zinc-500 dark:text-zinc-400">Nenhum projeto ainda.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                <th className="px-5 py-3 font-medium">Projeto</th>
                <th className="px-5 py-3 font-medium">Cliente</th>
                <th className="px-5 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {projects.map((project) => (
                <tr key={project.id} className="border-b border-zinc-100 last:border-0 dark:border-zinc-900">
                  <td className="px-5 py-3 text-zinc-900 dark:text-zinc-50">{project.name}</td>
                  <td className="px-5 py-3 text-zinc-500 dark:text-zinc-400">{project.client.name}</td>
                  <td className="px-5 py-3 text-right">
                    <Link href={`/projects/${project.id}/ffe`} className="text-xs text-zinc-500 hover:underline dark:text-zinc-400">
                      Ver FF&E →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}
