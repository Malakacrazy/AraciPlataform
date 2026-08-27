import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { apiGet, ApiError } from "@/lib/api";
import type { Account, RoleRate, StudioFixedCost } from "@/lib/types";
import { deleteRoleRate, createStudioFixedCost, deleteStudioFixedCost, updatePricingConfig } from "@/components/role-rates/actions";
import { RoleRateForm } from "@/components/role-rates/role-rate-form";

export default async function RoleRatesPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    redirect("/api/auth/signin");
  }

  let roleRates: RoleRate[];
  let account: Account;
  let fixedCosts: StudioFixedCost[];
  try {
    [roleRates, account, fixedCosts] = await Promise.all([
      apiGet<RoleRate[]>("role-rates"),
      apiGet<Account>("account"),
      apiGet<StudioFixedCost[]>("studio-fixed-costs"),
    ]);
  } catch (err) {
    if (err instanceof ApiError && err.status === 403) {
      return (
        <main className="mx-auto flex max-w-2xl flex-col gap-6 px-6 py-12">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Sua conta não tem permissão para ver tarifas por papel.
          </p>
        </main>
      );
    }
    throw err;
  }

  // Mesma fórmula de crm/pricing.ts (calcularOverheadPorHora), duplicada
  // aqui em JS puro só pra prévia — apps/web não importa de apps/api
  // (ADR 0002). A tarifa de verdade é sempre calculada no backend.
  const totalMonthlyFixedCosts = fixedCosts.reduce((sum, c) => sum + Number(c.monthlyAmount), 0);
  const studioBillableHoursPerMonth =
    account.pricingBusinessDaysPerMonth *
    Number(account.pricingBillableHoursPerDay) *
    Number(account.pricingActiveStaffCount);
  const overheadPorHora = studioBillableHoursPerMonth > 0 ? totalMonthlyFixedCosts / studioBillableHoursPerMonth : 0;

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-12">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Tarifas por Papel</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Custo-hora por papel — alimenta o motor de precificação de propostas. Preencha os custos fixos do estúdio e
          o salário de cada papel abaixo pra calcular a tarifa, em vez de ter que já saber o número final.
        </p>
      </div>

      <section className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="font-medium text-zinc-900 dark:text-zinc-50">Custos fixos do estúdio</h2>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          Aluguel, software, contador, etc. — rateados sobre as horas faturáveis do estúdio (abaixo) pra virar
          overhead/hora, somado ao custo de cada papel antes da margem.
        </p>
        {fixedCosts.length === 0 ? (
          <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">Nenhum custo fixo cadastrado ainda.</p>
        ) : (
          <table className="mt-3 w-full text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                <th className="py-2 pr-3 font-medium">Item</th>
                <th className="py-2 pr-3 text-right font-medium">R$/mês</th>
                <th className="py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {fixedCosts.map((c) => (
                <tr key={c.id} className="border-b border-zinc-100 last:border-0 dark:border-zinc-900">
                  <td className="py-2 pr-3 text-zinc-900 dark:text-zinc-50">{c.description}</td>
                  <td className="py-2 pr-3 text-right font-mono text-zinc-500 dark:text-zinc-400">
                    R$ {Number(c.monthlyAmount).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                  </td>
                  <td className="py-2 text-right">
                    <form action={deleteStudioFixedCost.bind(null, c.id)}>
                      <button type="submit" className="text-xs text-zinc-500 hover:text-red-600 dark:text-zinc-400">
                        Remover
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
              <tr>
                <td className="py-2 pr-3 font-medium text-zinc-900 dark:text-zinc-50">TOTAL CUSTO FIXO MENSAL</td>
                <td className="py-2 pr-3 text-right font-mono font-medium text-zinc-900 dark:text-zinc-50">
                  R$ {totalMonthlyFixedCosts.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                </td>
                <td />
              </tr>
            </tbody>
          </table>
        )}
        <form action={createStudioFixedCost} className="mt-4 flex flex-wrap items-end gap-3 border-t border-zinc-100 pt-4 dark:border-zinc-900">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-zinc-500 dark:text-zinc-400">Item</span>
            <input
              name="description"
              required
              placeholder="Aluguel, software, contador…"
              className="w-48 rounded-md border border-zinc-300 bg-transparent px-3 py-1.5 text-zinc-900 dark:border-zinc-700 dark:text-zinc-50"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-zinc-500 dark:text-zinc-400">R$/mês</span>
            <input
              name="monthlyAmount"
              type="number"
              min="0"
              step="0.01"
              required
              className="w-32 rounded-md border border-zinc-300 bg-transparent px-3 py-1.5 text-zinc-900 dark:border-zinc-700 dark:text-zinc-50"
            />
          </label>
          <button
            type="submit"
            className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm text-white dark:bg-zinc-50 dark:text-zinc-900"
          >
            Adicionar
          </button>
        </form>
      </section>

      <section className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="font-medium text-zinc-900 dark:text-zinc-50">Capacidade produtiva e fórmula</h2>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          Define as horas faturáveis do estúdio (pra ratear o custo fixo acima) e a margem/impostos aplicados sobre o
          custo de cada papel pra chegar na tarifa/hora.
        </p>
        <form action={updatePricingConfig} className="mt-3 flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-zinc-500 dark:text-zinc-400">Dias úteis/mês</span>
            <input
              name="pricingBusinessDaysPerMonth"
              type="number"
              min="1"
              max="31"
              required
              defaultValue={account.pricingBusinessDaysPerMonth}
              className="w-24 rounded-md border border-zinc-300 bg-transparent px-3 py-1.5 text-zinc-900 dark:border-zinc-700 dark:text-zinc-50"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-zinc-500 dark:text-zinc-400">Horas faturáveis/dia</span>
            <input
              name="pricingBillableHoursPerDay"
              type="number"
              min="0"
              step="0.5"
              required
              defaultValue={account.pricingBillableHoursPerDay}
              className="w-24 rounded-md border border-zinc-300 bg-transparent px-3 py-1.5 text-zinc-900 dark:border-zinc-700 dark:text-zinc-50"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-zinc-500 dark:text-zinc-400">Pessoas ativas (média)</span>
            <input
              name="pricingActiveStaffCount"
              type="number"
              min="0"
              step="0.5"
              required
              defaultValue={account.pricingActiveStaffCount}
              className="w-24 rounded-md border border-zinc-300 bg-transparent px-3 py-1.5 text-zinc-900 dark:border-zinc-700 dark:text-zinc-50"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-zinc-500 dark:text-zinc-400">Margem-alvo (%)</span>
            <input
              name="pricingMarginPercent"
              type="number"
              min="0"
              step="0.1"
              required
              defaultValue={Number(account.pricingMarginPercent) * 100}
              className="w-24 rounded-md border border-zinc-300 bg-transparent px-3 py-1.5 text-zinc-900 dark:border-zinc-700 dark:text-zinc-50"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-zinc-500 dark:text-zinc-400">Carga tributária (%)</span>
            <input
              name="pricingTaxBurdenPercent"
              type="number"
              min="0"
              step="0.1"
              required
              defaultValue={Number(account.pricingTaxBurdenPercent) * 100}
              className="w-24 rounded-md border border-zinc-300 bg-transparent px-3 py-1.5 text-zinc-900 dark:border-zinc-700 dark:text-zinc-50"
            />
          </label>
          <button
            type="submit"
            className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm text-white dark:bg-zinc-50 dark:text-zinc-900"
          >
            Salvar
          </button>
        </form>
        <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">
          Horas faturáveis do estúdio/mês:{" "}
          <span className="font-mono text-zinc-900 dark:text-zinc-50">{studioBillableHoursPerMonth}</span> — Overhead
          por hora:{" "}
          <span className="font-mono text-zinc-900 dark:text-zinc-50">
            R$ {overheadPorHora.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
          </span>
        </p>
      </section>

      <section className="rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
        {roleRates.length === 0 ? (
          <p className="p-5 text-sm text-zinc-500 dark:text-zinc-400">Nenhuma tarifa cadastrada ainda.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                <th className="px-5 py-3 font-medium">Papel</th>
                <th className="px-5 py-3 text-right font-medium">R$/hora</th>
                <th className="px-5 py-3 font-medium">Origem</th>
                <th className="px-5 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {roleRates.map((rate) => (
                <tr key={rate.id} className="border-b border-zinc-100 last:border-0 dark:border-zinc-900">
                  <td className="px-5 py-3 text-zinc-900 dark:text-zinc-50">{rate.role}</td>
                  <td className="px-5 py-3 text-right font-mono text-zinc-500 dark:text-zinc-400">
                    R$ {Number(rate.hourlyRate).toFixed(2)}
                  </td>
                  <td className="px-5 py-3 text-xs text-zinc-500 dark:text-zinc-400">
                    {rate.grossSalary != null
                      ? `Calculada (salário R$ ${Number(rate.grossSalary).toLocaleString("pt-BR")}, encargos ${(Number(rate.payrollBurdenPercent) * 100).toFixed(0)}%)`
                      : "Digitada direto"}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <form action={deleteRoleRate.bind(null, rate.id)}>
                      <button type="submit" className="text-xs text-zinc-500 hover:text-red-600 dark:text-zinc-400">
                        Remover
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="font-medium text-zinc-900 dark:text-zinc-50">Definir tarifa</h2>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          Reenviar o mesmo papel atualiza a tarifa em vez de duplicar.
        </p>
        <RoleRateForm
          overheadPorHora={overheadPorHora}
          marginPercent={Number(account.pricingMarginPercent)}
          taxBurdenPercent={Number(account.pricingTaxBurdenPercent)}
        />
      </section>
    </main>
  );
}
