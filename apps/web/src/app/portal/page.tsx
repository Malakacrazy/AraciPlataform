import Link from "next/link";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { listPortalProjects, listPendingProposals, PortalApiError, SESSION_COOKIE } from "@/lib/portalApi";
import { logoutPortal, declineProposalAction, submitProspectCommentAction } from "@/components/portal/actions";
import { MyDataButton } from "@/components/portal/my-data-button";
import { STAGE_LABELS } from "@/lib/pep-stages";

const PROPOSAL_STATUS_LABELS: Record<string, string> = {
  sent: "Aguardando sua decisão",
  signed: "Assinado",
  expired: "Expirado",
};

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
  let pendingProposals: Awaited<ReturnType<typeof listPendingProposals>>;
  try {
    [{ clientName, projects }, pendingProposals] = await Promise.all([
      listPortalProjects(sessionToken),
      listPendingProposals(sessionToken),
    ]);
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

      {pendingProposals.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-medium text-zinc-900 dark:text-zinc-50">Propostas em aberto</h2>
          {pendingProposals.map((opp) => {
            const contractedStages = opp.proposal.stages.filter((s) => s.contracted);
            return (
              <div
                key={opp.id}
                className="flex flex-col gap-2 rounded-md border border-zinc-200 bg-white p-4 text-sm dark:border-zinc-800 dark:bg-zinc-950"
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium text-zinc-900 dark:text-zinc-50">{opp.title}</span>
                  <span className="text-xs text-zinc-500 dark:text-zinc-400">
                    {PROPOSAL_STATUS_LABELS[opp.proposal.status] ?? opp.proposal.status}
                  </span>
                </div>
                <p className="font-mono text-xs text-zinc-500 dark:text-zinc-400">
                  R$ {Number(opp.proposal.value).toLocaleString("pt-BR")}
                </p>
                {contractedStages.length > 0 && (
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    Etapas: {contractedStages.map((s) => STAGE_LABELS[s.stage] ?? s.stage).join(", ")}
                  </p>
                )}

                {opp.proposal.status === "sent" && (
                  <div className="mt-1 flex items-center gap-3">
                    {opp.proposal.zapsignSignUrl && (
                      <a
                        href={opp.proposal.zapsignSignUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-md bg-zinc-900 px-3 py-1.5 text-xs text-white dark:bg-zinc-50 dark:text-zinc-900"
                      >
                        Assinar contrato
                      </a>
                    )}
                    <form action={declineProposalAction.bind(null, opp.id)}>
                      <button type="submit" className="text-xs text-red-600 hover:underline dark:text-red-400">
                        Recusar
                      </button>
                    </form>
                  </div>
                )}

                <form action={submitProspectCommentAction.bind(null, opp.id)} className="mt-2 flex items-center gap-2">
                  <input
                    name="comment"
                    defaultValue={opp.prospectComment ?? ""}
                    placeholder="Alguma dúvida sobre esta proposta?"
                    className="w-full rounded border border-zinc-300 bg-transparent px-2 py-1 text-xs text-zinc-900 dark:border-zinc-700 dark:text-zinc-50"
                  />
                  <button type="submit" className="text-xs text-zinc-500 hover:underline dark:text-zinc-400">
                    Enviar
                  </button>
                </form>
              </div>
            );
          })}
        </section>
      )}

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

      <div className="border-t border-zinc-100 pt-4 dark:border-zinc-900">
        <MyDataButton />
      </div>
    </main>
  );
}
