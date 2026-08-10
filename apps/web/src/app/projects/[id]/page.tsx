import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { apiGet, ApiError } from "@/lib/api";
import type { Project, OfficeLink, Invoice, ProjectMember, User } from "@/lib/types";
import { OfficeLinksSection } from "@/components/office-links/office-links-section";
import { CronogramaViews } from "@/components/projects/cronograma-views";
import { markInvoiceIssued, addMember, removeMember } from "@/components/projects/actions";

const INVOICE_STATUS_LABELS: Record<string, string> = {
  pendente: "Pendente",
  emitida: "Emitida",
  paga: "Paga",
};

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    redirect("/api/auth/signin");
  }

  const { id } = await params;

  let project: Project;
  let officeLinks: OfficeLink[];
  let invoices: Invoice[];
  let members: ProjectMember[];
  let users: User[];
  try {
    [project, officeLinks, invoices, members, users] = await Promise.all([
      apiGet<Project>(`projects/${id}`),
      apiGet<OfficeLink[]>(`projects/${id}/office-links`),
      apiGet<Invoice[]>(`invoices?projectId=${id}`),
      apiGet<ProjectMember[]>(`projects/${id}/members`),
      apiGet<User[]>("users"),
    ]);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      notFound();
    }
    throw err;
  }

  const memberUserIds = new Set(members.map((m) => m.userId));
  const availableUsers = users.filter((u) => !memberUserIds.has(u.id));
  const invoicedPhaseIds = invoices.map((inv) => inv.phaseId).filter((v): v is string => Boolean(v));

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-12">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">{project.name}</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          <Link href={`/clients/${project.client.id}`} className="hover:underline">
            {project.client.name}
          </Link>{" "}
          — {project.status} · {project.feeModel}
        </p>
        <Link href={`/projects/${id}/ffe`} className="mt-1 inline-block text-xs text-zinc-500 hover:underline dark:text-zinc-400">
          Ver FF&E →
        </Link>
      </div>

      <CronogramaViews projectId={id} phases={project.phases} invoicedPhaseIds={invoicedPhaseIds} />

      <section className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="font-medium text-zinc-900 dark:text-zinc-50">Financeiro</h2>
        {invoices.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">Nenhuma fatura ainda.</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {invoices.map((inv) => (
              <li
                key={inv.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-800"
              >
                <span className="font-mono text-zinc-900 dark:text-zinc-50">
                  R$ {Number(inv.amount).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                </span>
                <span className="text-xs text-zinc-500 dark:text-zinc-400">
                  {INVOICE_STATUS_LABELS[inv.status]}
                  {inv.nfseNumber ? ` · NFS-e ${inv.nfseNumber}` : ""}
                </span>
                {inv.status === "pendente" && (
                  <form action={markInvoiceIssued.bind(null, id, inv.id)} className="flex items-center gap-2">
                    <input
                      name="nfseNumber"
                      placeholder="nº NFS-e"
                      className="w-28 rounded border border-zinc-300 bg-transparent px-2 py-1 text-xs text-zinc-900 dark:border-zinc-700 dark:text-zinc-50"
                    />
                    <button type="submit" className="text-xs text-zinc-500 hover:underline dark:text-zinc-400">
                      Marcar emitida
                    </button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="font-medium text-zinc-900 dark:text-zinc-50">Equipe</h2>
        {members.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">Nenhum membro ainda.</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {members.map((m) => (
              <li
                key={m.id}
                className="flex items-center justify-between gap-3 rounded-md border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-800"
              >
                <span className="text-zinc-900 dark:text-zinc-50">
                  {m.user.name}
                  {m.roleOnProject ? ` — ${m.roleOnProject}` : ""}
                </span>
                <form action={removeMember.bind(null, id, m.userId)}>
                  <button type="submit" className="text-xs text-zinc-500 hover:text-red-600 dark:text-zinc-400">
                    Remover
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
        {availableUsers.length > 0 && (
          <form action={addMember.bind(null, id)} className="mt-3 flex flex-wrap items-center gap-2">
            <select
              name="userId"
              required
              defaultValue=""
              className="rounded border border-zinc-300 bg-transparent px-2 py-1 text-sm text-zinc-900 dark:border-zinc-700 dark:text-zinc-50"
            >
              <option value="" disabled>
                Colaborador…
              </option>
              {availableUsers.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
            <input
              name="roleOnProject"
              placeholder="papel no projeto (opcional)"
              className="rounded border border-zinc-300 bg-transparent px-2 py-1 text-sm text-zinc-900 dark:border-zinc-700 dark:text-zinc-50"
            />
            <button
              type="submit"
              className="rounded-md bg-zinc-900 px-3 py-1.5 text-xs text-white dark:bg-zinc-50 dark:text-zinc-900"
            >
              Adicionar
            </button>
          </form>
        )}
      </section>

      <OfficeLinksSection
        entityType="PROJECT"
        entityId={project.id}
        links={officeLinks}
        userEmail={session.user.email}
      />
    </main>
  );
}
