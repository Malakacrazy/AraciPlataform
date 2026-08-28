import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { apiGet, ApiError } from "@/lib/api";
import type { RequiredDocumentType } from "@/lib/types";
import { PEP_STAGES, STAGE_LABELS } from "@/lib/pep-stages";
import { createRequiredDocumentType, deleteRequiredDocumentType } from "@/components/required-document-types/actions";

export default async function RequiredDocumentTypesPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    redirect("/api/auth/signin");
  }

  let requirements: RequiredDocumentType[];
  try {
    requirements = await apiGet<RequiredDocumentType[]>("required-document-types");
  } catch (err) {
    if (err instanceof ApiError && err.status === 403) {
      return (
        <main className="mx-auto flex max-w-2xl flex-col gap-6 px-6 py-12">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Sua conta não tem permissão para configurar documentos obrigatórios.
          </p>
        </main>
      );
    }
    throw err;
  }

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-6 py-12">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Documentos obrigatórios por estágio</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Configurado uma vez por estágio do PEP — vale pra todo projeto, não precisa repetir por projeto. Vazio
          (nada configurado) não muda nada: o gate continua aprovando exatamente como sempre. Quando configurado,
          aprovar o gate de um estágio exige um vínculo (Drive) classificado com aquele tipo de documento, ligado à
          fase e não quebrado.
        </p>
      </div>

      <section className="rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
        {requirements.length === 0 ? (
          <p className="p-5 text-sm text-zinc-500 dark:text-zinc-400">Nenhum documento obrigatório configurado ainda.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                <th className="px-5 py-3 font-medium">Estágio</th>
                <th className="px-5 py-3 font-medium">Tipo de documento</th>
                <th className="px-5 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {requirements.map((r) => (
                <tr key={r.id} className="border-b border-zinc-100 last:border-0 dark:border-zinc-900">
                  <td className="px-5 py-3 text-zinc-900 dark:text-zinc-50">{STAGE_LABELS[r.stage] ?? r.stage}</td>
                  <td className="px-5 py-3 text-zinc-700 dark:text-zinc-300">{r.documentType}</td>
                  <td className="px-5 py-3 text-right">
                    <form action={deleteRequiredDocumentType.bind(null, r.id)}>
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
        <h2 className="font-medium text-zinc-900 dark:text-zinc-50">Adicionar exigência</h2>
        <form action={createRequiredDocumentType} className="mt-3 flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-zinc-500 dark:text-zinc-400">Estágio</span>
            <select
              name="stage"
              required
              className="w-56 rounded-md border border-zinc-300 bg-transparent px-3 py-1.5 text-zinc-900 dark:border-zinc-700 dark:text-zinc-50"
            >
              {PEP_STAGES.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-zinc-500 dark:text-zinc-400">Tipo de documento</span>
            <input
              name="documentType"
              required
              placeholder="contrato, ART, memorial…"
              className="w-48 rounded-md border border-zinc-300 bg-transparent px-3 py-1.5 text-zinc-900 dark:border-zinc-700 dark:text-zinc-50"
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
    </main>
  );
}
