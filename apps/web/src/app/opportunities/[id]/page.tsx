import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { apiGet, ApiError } from "@/lib/api";
import type { Opportunity, Proposal, RoleRate } from "@/lib/types";
import { ProposalBuilder } from "@/components/proposals/proposal-builder";
import { updateProposalStatus } from "@/components/proposals/actions";

const STAGE_LABELS: Record<string, string> = {
  CAPTACAO_ALINHAMENTO: "Captação/Alinhamento",
  BRIEFING: "Briefing",
  CRIACAO_CONCEITO: "Criação de Conceito",
  DETALHAMENTO_ACABAMENTOS: "Detalhamento/Acabamentos",
  EXECUTIVO: "Executivo",
};

const STATUS_LABELS: Record<string, string> = {
  draft: "Rascunho",
  sent: "Enviada",
  signed: "Assinada",
  expired: "Expirada",
};

export default async function OpportunityDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    redirect("/api/auth/signin");
  }

  const { id } = await params;

  let opportunity: Opportunity;
  try {
    opportunity = await apiGet<Opportunity>(`opportunities/${id}`);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      notFound();
    }
    throw err;
  }

  const [roleRates, proposals] = await Promise.all([
    apiGet<RoleRate[]>("role-rates"),
    apiGet<Proposal[]>(`proposals?opportunityId=${id}`),
  ]);

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-12">
      <div>
        <Link href="/opportunities" className="text-xs text-zinc-500 hover:underline dark:text-zinc-400">
          ← Pipeline
        </Link>
        <h1 className="mt-1 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">{opportunity.title}</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          <Link href={`/clients/${opportunity.client.id}`} className="hover:underline">
            {opportunity.client.name}
          </Link>{" "}
          · {opportunity.feeModel}
        </p>
      </div>

      <section className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="font-medium text-zinc-900 dark:text-zinc-50">Propostas</h2>
        {proposals.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">Nenhuma proposta calculada ainda.</p>
        ) : (
          <div className="mt-3 flex flex-col gap-4">
            {proposals.map((proposal) => (
              <div key={proposal.id} className="rounded-md border border-zinc-200 p-3 dark:border-zinc-800">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-mono text-sm text-zinc-900 dark:text-zinc-50">
                    R$ {Number(proposal.value).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                  </p>
                  <div className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
                    <span>{STATUS_LABELS[proposal.status]}</span>
                    {proposal.status === "draft" && (
                      <form action={updateProposalStatus.bind(null, proposal.id, id, "sent")}>
                        <button type="submit" className="text-zinc-500 hover:underline dark:text-zinc-400">
                          Marcar como enviada
                        </button>
                      </form>
                    )}
                    {proposal.status === "sent" && (
                      <form action={updateProposalStatus.bind(null, proposal.id, id, "signed")}>
                        <button type="submit" className="text-emerald-700 hover:underline dark:text-emerald-400">
                          Marcar como assinada
                        </button>
                      </form>
                    )}
                  </div>
                </div>
                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                  Multiplicador de complexidade {Number(proposal.complexityMultiplier).toFixed(2)}× · desconto de
                  pacote {(Number(proposal.packageDiscountPercent) * 100).toFixed(0)}%
                </p>
                <div className="mt-2 overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="text-zinc-500 dark:text-zinc-400">
                        <th className="py-1 pr-3 font-medium">Estágio</th>
                        <th className="py-1 pr-3 font-medium">Contratado</th>
                        <th className="py-1 pr-3 font-medium">Horas</th>
                        <th className="py-1 font-medium">Custo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {proposal.stages.map((stage) => (
                        <tr key={stage.id} className="text-zinc-700 dark:text-zinc-300">
                          <td className="py-1 pr-3">{STAGE_LABELS[stage.stage] ?? stage.stage}</td>
                          <td className="py-1 pr-3">{stage.contracted ? "Sim" : "Não"}</td>
                          <td className="py-1 pr-3 font-mono">{Number(stage.adjustedHours).toFixed(1)}h</td>
                          <td className="py-1 font-mono">
                            R$ {Number(stage.adjustedCost).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="font-medium text-zinc-900 dark:text-zinc-50">Nova proposta</h2>
        {roleRates.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
            Cadastre pelo menos uma{" "}
            <Link href="/role-rates" className="underline">
              tarifa de papel
            </Link>{" "}
            antes de calcular uma proposta.
          </p>
        ) : (
          <div className="mt-3">
            <ProposalBuilder opportunityId={id} roleRates={roleRates} />
          </div>
        )}
      </section>
    </main>
  );
}
