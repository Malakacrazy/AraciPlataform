import { notFound, redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { apiGet, ApiError } from "@/lib/api";
import type { Project, OfficeLink } from "@/lib/types";
import { OfficeLinksSection } from "@/components/office-links/office-links-section";

// Página mínima de propósito único: existe para dar um lugar para o
// OfficeLinksSection viver (Picker precisa de uma página no navegador
// para abrir a partir dela). Não é o dashboard de projeto completo — sem
// fases/equipe/financeiro aqui, isso é escopo de outra tarefa.
export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    redirect("/api/auth/signin");
  }

  const { id } = await params;

  let project: Project;
  let officeLinks: OfficeLink[];
  try {
    [project, officeLinks] = await Promise.all([
      apiGet<Project>(`projects/${id}`),
      apiGet<OfficeLink[]>(`projects/${id}/office-links`),
    ]);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      notFound();
    }
    throw err;
  }

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-6 py-12">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">{project.name}</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          {project.client.name} — {project.status}
        </p>
      </div>
      <OfficeLinksSection
        entityType="PROJECT"
        entityId={project.id}
        links={officeLinks}
        userEmail={session.user.email}
      />
    </main>
  );
}
