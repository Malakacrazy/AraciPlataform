import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { apiGet } from "@/lib/api";
import type { RoleRate } from "@/lib/types";
import { upsertRoleRate, deleteRoleRate } from "@/components/role-rates/actions";

// Lista canônica espelhada de apps/api/src/roles.ts (CANONICAL_ROLES) —
// apps/web não importa de apps/api (ADR 0002), então é uma cópia
// deliberada, não uma referência viva. Usada só como sugestão no
// datalist; RoleRate.role continua string livre no backend.
const CANONICAL_ROLES = [
  "Arquiteto Líder (RT)",
  "Coordenador de Projeto",
  "Arquiteto Sênior",
  "Arquiteto Pleno",
  "Arquiteto Júnior",
  "Estagiário",
  "Lead 3D / Visualização",
];

export default async function RoleRatesPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    redirect("/api/auth/signin");
  }

  const roleRates = await apiGet<RoleRate[]>("role-rates");

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-6 py-12">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Tarifas por Papel</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Custo-hora por papel — alimenta o motor de precificação de propostas.
        </p>
      </div>

      <section className="rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
        {roleRates.length === 0 ? (
          <p className="p-5 text-sm text-zinc-500 dark:text-zinc-400">Nenhuma tarifa cadastrada ainda.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                <th className="px-5 py-3 font-medium">Papel</th>
                <th className="px-5 py-3 font-medium">R$/hora</th>
                <th className="px-5 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {roleRates.map((rate) => (
                <tr key={rate.id} className="border-b border-zinc-100 last:border-0 dark:border-zinc-900">
                  <td className="px-5 py-3 text-zinc-900 dark:text-zinc-50">{rate.role}</td>
                  <td className="px-5 py-3 font-mono text-zinc-500 dark:text-zinc-400">
                    R$ {Number(rate.hourlyRate).toFixed(2)}
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
        <form action={upsertRoleRate} className="mt-3 flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-zinc-500 dark:text-zinc-400">Papel</span>
            <input
              name="role"
              required
              list="canonical-roles"
              className="w-64 rounded-md border border-zinc-300 bg-transparent px-3 py-1.5 text-zinc-900 dark:border-zinc-700 dark:text-zinc-50"
            />
            <datalist id="canonical-roles">
              {CANONICAL_ROLES.map((role) => (
                <option key={role} value={role} />
              ))}
            </datalist>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-zinc-500 dark:text-zinc-400">R$/hora</span>
            <input
              name="hourlyRate"
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
            Salvar
          </button>
        </form>
      </section>
    </main>
  );
}
