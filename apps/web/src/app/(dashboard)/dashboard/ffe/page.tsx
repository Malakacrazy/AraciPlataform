import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { apiGet } from "@/lib/api";
import type { DashboardFfe } from "@/lib/types";
import { DashboardTabs } from "@/components/dashboard/dashboard-tabs";

export default async function FfeDashboardPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    redirect("/api/auth/signin");
  }

  const data = await apiGet<DashboardFfe>("bi/ffe");
  const maiorQuantidade = Math.max(1, ...data.produtosMaisEspecificados.map((p) => p.quantidadeTotal));

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-6 px-6 py-12">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">FF&E</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Valor de carrinho aprovado × pendente por projeto, produtos mais especificados.
        </p>
      </div>

      <DashboardTabs active="/dashboard/ffe" />

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
          <p className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Markup médio</p>
          <p className="mt-1 font-mono text-xl text-zinc-900 dark:text-zinc-50">
            {data.markupMedioPercent !== null ? `${(data.markupMedioPercent * 100).toFixed(0)}%` : "—"}
          </p>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
          <p className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Especificações sem preço
          </p>
          <p className="mt-1 font-mono text-xl text-zinc-900 dark:text-zinc-50">{data.especificacoesSemPreco}</p>
        </div>
      </section>

      <section className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="font-medium text-zinc-900 dark:text-zinc-50">Carrinho por projeto</h2>
        {data.porProjeto.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
            Nenhuma especificação com preço definido ainda.
          </p>
        ) : (
          <table className="mt-3 w-full text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                <th className="py-2 pr-3 font-medium">Projeto</th>
                <th className="py-2 pr-3 text-right font-medium">Aprovado</th>
                <th className="py-2 text-right font-medium">Pendente</th>
              </tr>
            </thead>
            <tbody>
              {data.porProjeto.map((p) => (
                <tr key={p.projetoId} className="border-b border-zinc-100 last:border-0 dark:border-zinc-900">
                  <td className="py-2 pr-3 text-zinc-900 dark:text-zinc-50">{p.nome}</td>
                  <td className="py-2 pr-3 text-right font-mono text-emerald-700 dark:text-emerald-400">
                    R$ {p.valorAprovado.toLocaleString("pt-BR")}
                  </td>
                  <td className="py-2 text-right font-mono text-zinc-500 dark:text-zinc-400">
                    R$ {p.valorPendente.toLocaleString("pt-BR")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="font-medium text-zinc-900 dark:text-zinc-50">Produtos mais especificados</h2>
        {data.produtosMaisEspecificados.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">Nenhuma especificação ainda.</p>
        ) : (
          <div className="mt-3 flex flex-col gap-2">
            {data.produtosMaisEspecificados.map((p) => (
              <div key={p.productId} className="flex items-center gap-3 text-sm">
                <span className="w-48 shrink-0 truncate text-zinc-500 dark:text-zinc-400">{p.nome}</span>
                <div className="h-4 flex-1 overflow-hidden rounded bg-zinc-100 dark:bg-zinc-900">
                  <div
                    className="h-full rounded bg-zinc-900 dark:bg-zinc-50"
                    style={{ width: `${(p.quantidadeTotal / maiorQuantidade) * 100}%` }}
                  />
                </div>
                <span className="w-8 shrink-0 text-right font-mono text-zinc-900 dark:text-zinc-50">
                  {p.quantidadeTotal}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
