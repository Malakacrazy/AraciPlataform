import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { apiGet } from "@/lib/api";
import type { VisaoExecutiva } from "@/lib/types";

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    redirect("/api/auth/signin");
  }

  const data = await apiGet<VisaoExecutiva>("bi/executivo");

  const maiorEstagio = Math.max(1, ...data.pipeline.porEstagio.map((e) => e.quantidade));

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-6 px-6 py-12">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Visão executiva</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Pipeline, faturamento e orçado × realizado por projeto.
        </p>
      </div>

      <section className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="font-medium text-zinc-900 dark:text-zinc-50">Pipeline</h2>
        {data.pipeline.taxaConversao !== null && (
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Taxa de conversão (ganho/resolvidas): {(data.pipeline.taxaConversao * 100).toFixed(0)}%
          </p>
        )}
        <div className="mt-3 flex flex-col gap-2">
          {data.pipeline.porEstagio.map((e) => (
            <div key={e.estagio} className="flex items-center gap-3 text-sm">
              <span className="w-36 shrink-0 text-zinc-500 dark:text-zinc-400">{e.label}</span>
              <div className="h-4 flex-1 overflow-hidden rounded bg-zinc-100 dark:bg-zinc-900">
                <div
                  className="h-full rounded bg-zinc-900 dark:bg-zinc-50"
                  style={{ width: `${(e.quantidade / maiorEstagio) * 100}%` }}
                />
              </div>
              <span className="w-8 shrink-0 text-right font-mono text-zinc-900 dark:text-zinc-50">
                {e.quantidade}
              </span>
              <span className="w-28 shrink-0 text-right font-mono text-xs text-zinc-500 dark:text-zinc-400">
                R$ {e.valorEstimado.toLocaleString("pt-BR")}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="font-medium text-zinc-900 dark:text-zinc-50">Faturamento</h2>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {data.faturamento.map((f) => (
            <div key={f.status} className="rounded-md border border-zinc-200 p-3 dark:border-zinc-800">
              <p className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">{f.label}</p>
              <p className="mt-1 font-mono text-lg text-zinc-900 dark:text-zinc-50">
                R$ {f.valorTotal.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
              </p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">{f.quantidade} fatura(s)</p>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="font-medium text-zinc-900 dark:text-zinc-50">Orçado × realizado por projeto</h2>
        {data.projetos.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">Nenhum projeto ainda.</p>
        ) : (
          <table className="mt-3 w-full text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                <th className="py-2 pr-3 font-medium">Projeto</th>
                <th className="py-2 pr-3 font-medium">Cliente</th>
                <th className="py-2 pr-3 text-right font-medium">Orçado</th>
                <th className="py-2 pr-3 text-right font-medium">Realizado</th>
                <th className="py-2 text-right font-medium">Diferença</th>
              </tr>
            </thead>
            <tbody>
              {data.projetos.map((p) => {
                const diferenca = p.orcado - p.realizado;
                return (
                  <tr key={p.projetoId} className="border-b border-zinc-100 last:border-0 dark:border-zinc-900">
                    <td className="py-2 pr-3 text-zinc-900 dark:text-zinc-50">{p.nome}</td>
                    <td className="py-2 pr-3 text-zinc-500 dark:text-zinc-400">{p.clienteNome}</td>
                    <td className="py-2 pr-3 text-right font-mono text-zinc-900 dark:text-zinc-50">
                      R$ {p.orcado.toLocaleString("pt-BR")}
                    </td>
                    <td className="py-2 pr-3 text-right font-mono text-zinc-900 dark:text-zinc-50">
                      R$ {p.realizado.toLocaleString("pt-BR")}
                    </td>
                    <td
                      className={`py-2 text-right font-mono ${
                        diferenca < 0 ? "text-red-600 dark:text-red-400" : "text-emerald-700 dark:text-emerald-400"
                      }`}
                    >
                      {diferenca < 0 ? "-" : "+"}R$ {Math.abs(diferenca).toLocaleString("pt-BR")}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}
