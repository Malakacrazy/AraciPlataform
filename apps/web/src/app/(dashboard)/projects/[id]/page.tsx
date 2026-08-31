import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { apiGet, ApiError } from "@/lib/api";
import type { Project, OfficeLink, Invoice, ProjectMember, User, Activity, Task, ProjectCollaborator, RequiredDocumentType, DocumentChecklistItem, Me } from "@/lib/types";
import { OfficeLinksSection } from "@/components/office-links/office-links-section";
import { CronogramaViews } from "@/components/projects/cronograma-views";
import {
  markInvoiceIssued,
  emitirNfse,
  cancelarNfse,
  substituirNfse,
  chargeInvoice,
  addMember,
  removeMember,
} from "@/components/projects/actions";
import { ActivityTimeline } from "@/components/activities/activity-timeline";
import { TaskList } from "@/components/tasks/task-list";
import { CollaboratorSection } from "@/components/collaborators/collaborator-section";

const INVOICE_STATUS_LABELS: Record<string, string> = {
  pendente: "Pendente",
  emitida: "Emitida",
  paga: "Paga",
};

// Lacuna da matriz (NFS-e: cancelamento/substituição) -- código fechado
// da SEFIN Nacional pro evento e101101, não texto livre.
const NFSE_MOTIVO_LABELS: Record<number, string> = {
  1: "Erro na emissão",
  2: "Serviço não prestado",
  9: "Outros",
};

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    redirect("/api/auth/signin");
  }

  const { id } = await params;

  let project: Project;
  let officeLinks: OfficeLink[];
  let members: ProjectMember[];
  let users: User[];
  let tasks: Task[];
  let me: Me;
  try {
    [project, officeLinks, members, users, tasks, me] = await Promise.all([
      apiGet<Project>(`projects/${id}`),
      apiGet<OfficeLink[]>(`projects/${id}/office-links`),
      apiGet<ProjectMember[]>(`projects/${id}/members`),
      apiGet<User[]>("users"),
      apiGet<Task[]>(`projects/${id}/tasks`),
      apiGet<Me>("me"),
    ]);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      notFound();
    }
    throw err;
  }
  // ProjectMembersController agora exige admin em add/remove (mesmo achado
  // de revisão que já gatilhou isAdmin em team/planning/page.tsx) --
  // esconder aqui evita mostrar formulário/botão que só resultariam em 403.
  const isAdmin = me.accessLevel === "admin";

  let invoices: Invoice[] = [];
  let canSeeFinanceiro = true;
  try {
    invoices = await apiGet<Invoice[]>(`invoices?projectId=${id}`);
  } catch (err) {
    if (err instanceof ApiError && err.status === 403) {
      canSeeFinanceiro = false;
    } else {
      throw err;
    }
  }

  const activities = await apiGet<Activity[]>(`projects/${id}/activities`);

  let collaborators: ProjectCollaborator[] = [];
  let canManageCollaborators = true;
  try {
    collaborators = await apiGet<ProjectCollaborator[]>(`projects/${id}/collaborators`);
  } catch (err) {
    if (err instanceof ApiError && err.status === 403) {
      canManageCollaborators = false;
    } else {
      throw err;
    }
  }

  // Lacuna da matriz ("checklist de documentos obrigatórios") -- 403 aqui
  // só significa staff sem acesso a essa config; degrada pra datalist
  // vazio (o input de tipo de documento continua livre), não quebra a
  // tela.
  let requiredDocumentTypeSuggestions: string[] = [];
  try {
    const requirements = await apiGet<RequiredDocumentType[]>("required-document-types");
    requiredDocumentTypeSuggestions = [...new Set(requirements.map((r) => r.documentType))];
  } catch (err) {
    if (!(err instanceof ApiError && err.status === 403)) {
      throw err;
    }
  }

  const memberUserIds = new Set(members.map((m) => m.userId));
  const availableUsers = users.filter((u) => !memberUserIds.has(u.id));
  const invoicedPhaseIds = invoices.map((inv) => inv.phaseId).filter((v): v is string => Boolean(v));

  // Lacuna da matriz ("checklist de documentos obrigatórios") -- só pras
  // fases contratadas e ainda não aprovadas (as únicas onde o checklist
  // importa de verdade); vazio quando nada está configurado pro estágio
  // (ver PhasesService.getDocumentChecklist), então não pesa em conta sem
  // nada cadastrado.
  const unapprovedContractedPhases = project.phases.filter((p) => p.contracted && !p.approvedAt);
  const documentChecklistEntries = await Promise.all(
    unapprovedContractedPhases.map(async (phase) => [
      phase.id,
      await apiGet<DocumentChecklistItem[]>(`projects/${id}/phases/${phase.id}/document-checklist`),
    ] as const),
  );
  const documentChecklists = Object.fromEntries(documentChecklistEntries);

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

      <CronogramaViews
        projectId={id}
        phases={project.phases}
        invoicedPhaseIds={invoicedPhaseIds}
        feeModel={project.feeModel}
        documentChecklists={documentChecklists}
        isAdmin={isAdmin}
      />

      <TaskList projectId={id} phases={project.phases} tasks={tasks} users={users} />

      <section className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="font-medium text-zinc-900 dark:text-zinc-50">Financeiro</h2>
        {!canSeeFinanceiro ? (
          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
            Sua conta não tem permissão para ver o financeiro deste projeto.
          </p>
        ) : invoices.length === 0 ? (
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
                  {inv.nfseNumber
                    ? ` · NFS-e ${inv.nfseNumber}${inv.nfseChaveAcesso ? " (emitida automaticamente)" : ""}`
                    : inv.nfseChaveAcesso && inv.nfseAmbienteEmissao === "homologacao"
                      ? // Achado A28 da auditoria de 30 ago 2026: emissão em
                        // homologação não grava nfseNumber (não é uma emissão
                        // de verdade) -- mostra a chave de teste separada,
                        // deixando claro que não tem validade fiscal.
                        ` · NFS-e de TESTE ${inv.nfseChaveAcesso} — sem validade fiscal`
                      : inv.status === "paga"
                        ? " · aguardando emissão de NFS-e"
                        : ""}
                  {inv.nfseCanceladaEm && " · NFS-e cancelada"}
                </span>
                {/* Achado A28: além de !chaveAcesso/cancelada, reabre também
                    quando a chave atual é só um teste de homologação -- sem
                    isto, testar em homologação bloqueava emitir de verdade
                    depois de trocar pra produção. */}
                {(!inv.nfseChaveAcesso ||
                  inv.nfseCanceladaEm ||
                  inv.nfseAmbienteEmissao === "homologacao") &&
                  (inv.status === "pendente" || inv.status === "paga") && (
                    <form action={emitirNfse.bind(null, id, inv.id)}>
                      <button type="submit" className="text-xs text-zinc-500 hover:underline dark:text-zinc-400">
                        {inv.nfseCanceladaEm ? "Emitir nova NFS-e" : "Emitir NFS-e"}
                      </button>
                    </form>
                  )}
                {(inv.status === "pendente" || (inv.status === "paga" && !inv.nfseNumber)) && (
                  <form
                    action={markInvoiceIssued.bind(null, id, inv.id, inv.status)}
                    className="flex items-center gap-2"
                  >
                    <input
                      name="nfseNumber"
                      placeholder="nº NFS-e"
                      className="w-28 rounded border border-zinc-300 bg-transparent px-2 py-1 text-xs text-zinc-900 dark:border-zinc-700 dark:text-zinc-50"
                    />
                    <button type="submit" className="text-xs text-zinc-500 hover:underline dark:text-zinc-400">
                      {inv.status === "paga" ? "Registrar NFS-e" : "Marcar emitida"}
                    </button>
                  </form>
                )}
                {inv.nfseRejectionReason && (
                  <p className="w-full text-xs text-red-600 dark:text-red-400">
                    NFS-e rejeitada pela SEFIN: {inv.nfseRejectionReason}
                  </p>
                )}
                {inv.nfseXmlArchiveError && (
                  <p className="w-full text-xs text-amber-600 dark:text-amber-400">
                    Falha ao arquivar o XML no Drive: {inv.nfseXmlArchiveError}
                  </p>
                )}
                {inv.nfseCanceladaEm && (
                  <p className="w-full text-xs text-zinc-500 dark:text-zinc-400">
                    Cancelada em {new Date(inv.nfseCanceladaEm).toLocaleDateString("pt-BR")}
                    {inv.nfseMotivoCancelamento && ` — ${NFSE_MOTIVO_LABELS[inv.nfseMotivoCancelamento]}`}
                    {inv.nfseJustificativaCancelamento && `: ${inv.nfseJustificativaCancelamento}`}
                  </p>
                )}
                {inv.nfseChaveAcesso && !inv.nfseCanceladaEm && (
                  <>
                    <form action={cancelarNfse.bind(null, id, inv.id)} className="flex w-full flex-wrap items-center gap-2">
                      <select
                        name="motivo"
                        defaultValue={1}
                        className="rounded border border-zinc-300 bg-transparent px-2 py-1 text-xs text-zinc-900 dark:border-zinc-700 dark:text-zinc-50"
                      >
                        <option value={1}>Erro na emissão</option>
                        <option value={2}>Serviço não prestado</option>
                        <option value={9}>Outros</option>
                      </select>
                      <input
                        name="justificativa"
                        placeholder="Justificativa"
                        required
                        className="w-40 rounded border border-zinc-300 bg-transparent px-2 py-1 text-xs text-zinc-900 dark:border-zinc-700 dark:text-zinc-50"
                      />
                      <button type="submit" className="text-xs text-zinc-500 hover:text-red-600 dark:text-zinc-400">
                        Cancelar NFS-e
                      </button>
                    </form>
                    <form action={substituirNfse.bind(null, id, inv.id)} className="flex w-full flex-wrap items-center gap-2">
                      <input
                        name="justificativa"
                        placeholder="O que foi corrigido"
                        required
                        className="w-48 rounded border border-zinc-300 bg-transparent px-2 py-1 text-xs text-zinc-900 dark:border-zinc-700 dark:text-zinc-50"
                      />
                      <button type="submit" className="text-xs text-zinc-500 hover:underline dark:text-zinc-400">
                        Substituir NFS-e (emite corrigida e cancela esta)
                      </button>
                    </form>
                  </>
                )}
                {inv.status !== "paga" &&
                  (inv.asaasInvoiceUrl ? (
                    <a
                      href={inv.asaasInvoiceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-zinc-500 hover:underline dark:text-zinc-400"
                    >
                      Ver cobrança (Boleto/Pix) →
                    </a>
                  ) : (
                    <form action={chargeInvoice.bind(null, id, inv.id)}>
                      <button type="submit" className="text-xs text-zinc-500 hover:underline dark:text-zinc-400">
                        Cobrar (Boleto/Pix)
                      </button>
                    </form>
                  ))}
                {inv.lines.length > 0 && (
                  <ul className="w-full border-t border-zinc-100 pt-1.5 text-xs text-zinc-500 dark:border-zinc-900 dark:text-zinc-400">
                    {inv.lines.map((line) => (
                      <li key={line.id} className="flex justify-between">
                        <span>
                          {line.role} — {Number(line.hours).toLocaleString("pt-BR")}h × R${" "}
                          {Number(line.hourlyRate).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                        </span>
                        <span className="font-mono">
                          R$ {Number(line.amount).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                        </span>
                      </li>
                    ))}
                  </ul>
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
                {isAdmin && (
                  <form action={removeMember.bind(null, id, m.userId)}>
                    <button type="submit" className="text-xs text-zinc-500 hover:text-red-600 dark:text-zinc-400">
                      Remover
                    </button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
        {isAdmin && availableUsers.length > 0 && (
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
        contactEmail={project.client.email}
        phases={project.phases}
        documentTypeSuggestions={requiredDocumentTypeSuggestions}
      />

      {canManageCollaborators && <CollaboratorSection projectId={project.id} collaborators={collaborators} />}

      <ActivityTimeline
        entityType="PROJECT"
        entityId={project.id}
        activities={activities}
        currentUserEmail={session.user.email}
      />
    </main>
  );
}
