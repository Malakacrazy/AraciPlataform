import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { apiGet, ApiError } from "@/lib/api";
import type { Account, Expense, Project } from "@/lib/types";
import { updateTaxRegime, simulateFatorR, createExpense, markExpensePaid, deleteExpense } from "@/components/financeiro/actions";

const EXPENSE_STATUS_LABELS: Record<string, string> = {
  pendente: "Pendente",
  paga: "Paga",
};

export default async function FinanceiroPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    redirect("/api/auth/signin");
  }

  let account: Account;
  let expenses: Expense[];
  let projects: Project[];
  try {
    [account, expenses, projects] = await Promise.all([
      apiGet<Account>("account"),
      apiGet<Expense[]>("expenses"),
      apiGet<Project[]>("projects"),
    ]);
  } catch (err) {
    if (err instanceof ApiError && err.status === 403) {
      return (
        <main className="mx-auto flex max-w-2xl flex-col gap-6 px-6 py-12">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Sua conta não tem permissão para ver o financeiro do estúdio.
          </p>
        </main>
      );
    }
    throw err;
  }
  const isMei = account.taxRegime === "MEI";

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-12">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Financeiro & Fiscal</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Regime tributário, simulador de Fator R e despesas do estúdio (o que sai do caixa).
        </p>
      </div>

      <section className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="font-medium text-zinc-900 dark:text-zinc-50">Despesas</h2>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          Pagamento a terceiros e estrutura do estúdio — sem projeto vinculado é despesa geral (aluguel, software).
        </p>
        {expenses.length === 0 ? (
          <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">Nenhuma despesa registrada ainda.</p>
        ) : (
          <table className="mt-3 w-full text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                <th className="py-2 pr-3 font-medium">Descrição</th>
                <th className="py-2 pr-3 font-medium">Categoria</th>
                <th className="py-2 pr-3 font-medium">Projeto</th>
                <th className="py-2 pr-3 text-right font-medium">Valor</th>
                <th className="py-2 pr-3 font-medium">Status</th>
                <th className="py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {expenses.map((e) => (
                <tr key={e.id} className="border-b border-zinc-100 last:border-0 dark:border-zinc-900">
                  <td className="py-2 pr-3 text-zinc-900 dark:text-zinc-50">{e.description}</td>
                  <td className="py-2 pr-3 text-zinc-500 dark:text-zinc-400">{e.category}</td>
                  <td className="py-2 pr-3 text-zinc-500 dark:text-zinc-400">{e.project?.name ?? "—"}</td>
                  <td className="py-2 pr-3 text-right font-mono text-zinc-900 dark:text-zinc-50">
                    R$ {Number(e.amount).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                  </td>
                  <td className="py-2 pr-3">
                    <span
                      className={
                        e.status === "paga"
                          ? "text-emerald-700 dark:text-emerald-400"
                          : "text-zinc-500 dark:text-zinc-400"
                      }
                    >
                      {EXPENSE_STATUS_LABELS[e.status]}
                    </span>
                  </td>
                  <td className="py-2 text-right text-xs">
                    <div className="flex items-center justify-end gap-2">
                      {e.status === "pendente" && (
                        <form action={markExpensePaid.bind(null, e.id)}>
                          <button type="submit" className="text-zinc-500 hover:underline dark:text-zinc-400">
                            Marcar paga
                          </button>
                        </form>
                      )}
                      <form action={deleteExpense.bind(null, e.id)}>
                        <button type="submit" className="text-zinc-500 hover:text-red-600 dark:text-zinc-400">
                          Remover
                        </button>
                      </form>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <form action={createExpense} className="mt-4 flex flex-wrap items-end gap-3 border-t border-zinc-100 pt-4 dark:border-zinc-900">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-zinc-500 dark:text-zinc-400">Descrição</span>
            <input
              name="description"
              required
              className="w-48 rounded-md border border-zinc-300 bg-transparent px-3 py-1.5 text-zinc-900 dark:border-zinc-700 dark:text-zinc-50"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-zinc-500 dark:text-zinc-400">Categoria</span>
            <input
              name="category"
              required
              placeholder="subcontratado, software, aluguel…"
              className="w-40 rounded-md border border-zinc-300 bg-transparent px-3 py-1.5 text-zinc-900 dark:border-zinc-700 dark:text-zinc-50"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-zinc-500 dark:text-zinc-400">Valor (R$)</span>
            <input
              name="amount"
              type="number"
              min="0"
              step="0.01"
              required
              className="w-32 rounded-md border border-zinc-300 bg-transparent px-3 py-1.5 text-zinc-900 dark:border-zinc-700 dark:text-zinc-50"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-zinc-500 dark:text-zinc-400">Projeto (opcional)</span>
            <select
              name="projectId"
              defaultValue=""
              className="w-40 rounded-md border border-zinc-300 bg-transparent px-3 py-1.5 text-zinc-900 dark:border-zinc-700 dark:text-zinc-50"
            >
              <option value="">— geral —</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-zinc-500 dark:text-zinc-400">Vencimento (opcional)</span>
            <input
              name="dueDate"
              type="date"
              className="rounded-md border border-zinc-300 bg-transparent px-3 py-1.5 text-zinc-900 dark:border-zinc-700 dark:text-zinc-50"
            />
          </label>
          <button
            type="submit"
            className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm text-white dark:bg-zinc-50 dark:text-zinc-900"
          >
            Registrar despesa
          </button>
        </form>
      </section>

      <section className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="font-medium text-zinc-900 dark:text-zinc-50">Regime tributário</h2>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          MEI paga um valor fixo mensal (DAS-MEI) — sem Fator R. Só depois de migrar para ME (Simples Nacional) o
          simulador abaixo passa a valer.
        </p>
        <form action={updateTaxRegime} className="mt-3 flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-zinc-500 dark:text-zinc-400">Regime atual</span>
            <select
              key={account.taxRegime}
              name="taxRegime"
              defaultValue={account.taxRegime}
              className="w-48 rounded-md border border-zinc-300 bg-transparent px-3 py-1.5 text-zinc-900 dark:border-zinc-700 dark:text-zinc-50"
            >
              <option value="MEI">MEI</option>
              <option value="ME">ME (Simples Nacional)</option>
            </select>
          </label>
          <button
            type="submit"
            className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm text-white dark:bg-zinc-50 dark:text-zinc-900"
          >
            Salvar
          </button>
        </form>
      </section>

      {isMei ? (
        <section className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
          <h2 className="font-medium text-zinc-900 dark:text-zinc-50">Simulador de Fator R</h2>
          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
            Não se aplica enquanto o estúdio estiver em MEI — MEI tributa por valor fixo mensal, sem essa conta.
            Mude o regime para ME acima quando a migração acontecer.
          </p>
        </section>
      ) : (
        <section className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
          <h2 className="font-medium text-zinc-900 dark:text-zinc-50">Simulador de Fator R</h2>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            Razão entre folha de pagamento e receita bruta, ambos nos últimos 12 meses. A partir de 28%, o Simples
            Nacional enquadra o estúdio no Anexo III (mais favorável para serviços); abaixo disso, Anexo V.
          </p>

          {account.taxRegimeAnexo && account.fatorRPercent && (
            <div className="mt-3 rounded-md border border-zinc-200 bg-zinc-50 p-3 text-sm dark:border-zinc-800 dark:bg-zinc-900">
              <span className="text-zinc-500 dark:text-zinc-400">Último cálculo:</span>{" "}
              <span className="font-mono text-zinc-900 dark:text-zinc-50">
                {(Number(account.fatorRPercent) * 100).toFixed(1)}%
              </span>{" "}
              — Anexo <strong className="text-zinc-900 dark:text-zinc-50">{account.taxRegimeAnexo}</strong>
            </div>
          )}

          <form action={simulateFatorR} className="mt-3 flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-zinc-500 dark:text-zinc-400">Folha de pagamento (12 meses, R$)</span>
              <input
                name="folhaPagamento12m"
                type="number"
                min="0"
                step="0.01"
                required
                className="w-48 rounded-md border border-zinc-300 bg-transparent px-3 py-1.5 text-zinc-900 dark:border-zinc-700 dark:text-zinc-50"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-zinc-500 dark:text-zinc-400">Receita bruta (12 meses, R$)</span>
              <input
                name="receitaBruta12m"
                type="number"
                min="0"
                step="0.01"
                required
                className="w-48 rounded-md border border-zinc-300 bg-transparent px-3 py-1.5 text-zinc-900 dark:border-zinc-700 dark:text-zinc-50"
              />
            </label>
            <button
              type="submit"
              className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm text-white dark:bg-zinc-50 dark:text-zinc-900"
            >
              Simular
            </button>
          </form>
        </section>
      )}
    </main>
  );
}
