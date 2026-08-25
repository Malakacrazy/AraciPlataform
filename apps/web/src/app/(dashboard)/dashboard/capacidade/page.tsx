import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { apiGet } from "@/lib/api";
import type { DashboardCapacidade } from "@/lib/types";
import { DashboardTabs } from "@/components/dashboard/dashboard-tabs";

export default async function CapacidadePage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    redirect("/api/auth/signin");
  }

  const data = await apiGet<DashboardCapacidade>("bi/capacidade");
  const maiorHoras = Math.max(
    1,
    ...data.porPessoa.flatMap((p) => [p.capacidadeSemanal, p.horasAlocadasAtualmente]),
  );

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-6 px-6 py-12">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Capacidade da equipe</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Alocado agora × capacidade semanal, e horas de fato apontadas nos últimos 7/30 dias.
        </p>
      </div>

      <DashboardTabs active="/dashboard/capacidade" />

      <section className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
        {data.porPessoa.length === 0 ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">Nenhum colaborador cadastrado ainda.</p>
        ) : (
          <div className="flex flex-col gap-4">
            {data.porPessoa.map((p) => (
              <div key={p.userId} className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium text-zinc-900 dark:text-zinc-50">{p.nome}</span>
                  <span className="flex items-center gap-2">
                    {p.sobrecarregado && (
                      <span className="rounded bg-red-100 px-1.5 py-0.5 text-xs font-medium text-red-700 dark:bg-red-950 dark:text-red-400">
                        Sobrecarregado
                      </span>
                    )}
                    <span className="font-mono text-zinc-500 dark:text-zinc-400">
                      {p.horasAlocadasAtualmente}h / {p.capacidadeSemanal}h semana
                    </span>
                  </span>
                </div>
                <div className="flex h-3 overflow-hidden rounded bg-zinc-100 dark:bg-zinc-900">
                  <div
                    className={`h-full rounded ${p.sobrecarregado ? "bg-red-600" : "bg-zinc-900 dark:bg-zinc-50"}`}
                    style={{ width: `${Math.min((p.horasAlocadasAtualmente / maiorHoras) * 100, 100)}%` }}
                  />
                </div>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  Apontado: {p.horasApontadas7d}h nos últimos 7 dias · {p.horasApontadas30d}h nos últimos 30
                </p>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
