import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { apiGet } from "@/lib/api";
import type { Client, Opportunity } from "@/lib/types";
import { OpportunitiesBoard } from "@/components/opportunities/opportunities-board";
import { createOpportunity } from "@/components/opportunities/actions";

export default async function OpportunitiesPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    redirect("/api/auth/signin");
  }

  const [opportunities, clients] = await Promise.all([
    apiGet<Opportunity[]>("opportunities"),
    apiGet<Client[]>("clients"),
  ]);

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 px-6 py-12">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Pipeline de Oportunidades</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">Arraste o cartão entre as colunas. Marcar como ganho converte em projeto automaticamente.</p>
      </div>

      <OpportunitiesBoard opportunities={opportunities} />

      <section className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="font-medium text-zinc-900 dark:text-zinc-50">Nova oportunidade</h2>
        {clients.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
            Cadastre um cliente antes de criar uma oportunidade.
          </p>
        ) : (
          <form action={createOpportunity} className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-zinc-500 dark:text-zinc-400">Cliente *</span>
              <select
                name="clientId"
                required
                defaultValue=""
                className="rounded-md border border-zinc-300 bg-transparent px-3 py-1.5 text-zinc-900 dark:border-zinc-700 dark:text-zinc-50"
              >
                <option value="" disabled>
                  Selecione…
                </option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-zinc-500 dark:text-zinc-400">Título *</span>
              <input
                name="title"
                required
                className="rounded-md border border-zinc-300 bg-transparent px-3 py-1.5 text-zinc-900 dark:border-zinc-700 dark:text-zinc-50"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-zinc-500 dark:text-zinc-400">Modelo de honorário *</span>
              <select
                name="feeModel"
                required
                defaultValue="hora_tecnica"
                className="rounded-md border border-zinc-300 bg-transparent px-3 py-1.5 text-zinc-900 dark:border-zinc-700 dark:text-zinc-50"
              >
                <option value="hora_tecnica">Hora técnica</option>
                <option value="percentual_cub">% sobre CUB</option>
                <option value="valor_m2">Valor por m²</option>
                <option value="fixo">Valor fixo</option>
                <option value="recorrente">Recorrente</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-zinc-500 dark:text-zinc-400">Valor estimado (R$)</span>
              <input
                name="estimatedValue"
                type="number"
                min="0"
                step="0.01"
                className="rounded-md border border-zinc-300 bg-transparent px-3 py-1.5 text-zinc-900 dark:border-zinc-700 dark:text-zinc-50"
              />
            </label>
            <button
              type="submit"
              className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm text-white sm:col-span-2 sm:w-fit dark:bg-zinc-50 dark:text-zinc-900"
            >
              Criar oportunidade
            </button>
          </form>
        )}
      </section>
    </main>
  );
}
