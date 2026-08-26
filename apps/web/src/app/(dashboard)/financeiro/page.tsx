import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { apiGet, ApiError } from "@/lib/api";
import type { Account } from "@/lib/types";
import { updateTaxRegime, simulateFatorR } from "@/components/financeiro/actions";

export default async function FinanceiroPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    redirect("/api/auth/signin");
  }

  let account: Account;
  try {
    account = await apiGet<Account>("account");
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
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-6 py-12">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Financeiro & Fiscal</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Regime tributário do estúdio e simulador de Fator R (Simples Nacional).
        </p>
      </div>

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
