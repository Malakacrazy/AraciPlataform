import { notFound } from "next/navigation";
import { getPresentation, PublicApiError } from "@/lib/publicApi";
import type { PresentationData } from "@/lib/types";
import { setSpecificationApproval, submitSpecificationComment } from "@/components/presentation/actions";

// Rota pública -- sem getServerSession/redirect. Quem abre este link não
// tem conta: a única "autenticação" é possuir o token da URL (ver
// lib/publicApi.ts e PublicPresentationController em apps/api).
export default async function PresentationPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  let data: PresentationData;
  try {
    data = await getPresentation(token);
  } catch (err) {
    if (err instanceof PublicApiError && err.status === 404) {
      notFound();
    }
    throw err;
  }

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-8 px-6 py-12">
      <div>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">{data.client.name}</p>
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">{data.name}</h1>
      </div>

      {data.moodboards.length > 0 && (
        <section className="flex flex-col gap-4">
          <h2 className="text-lg font-medium text-zinc-900 dark:text-zinc-50">Pranchas</h2>
          {data.moodboards.map((board) => (
            <div
              key={board.id}
              className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950"
            >
              <h3 className="font-medium text-zinc-900 dark:text-zinc-50">{board.name}</h3>
              {board.items.length === 0 ? (
                <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">Nenhum produto ainda.</p>
              ) : (
                <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {board.items.map((item) => (
                    <div key={item.id} className="flex flex-col gap-1">
                      {item.product.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={item.product.imageUrl}
                          alt={item.product.name}
                          className="aspect-square w-full rounded-md border border-zinc-200 object-cover dark:border-zinc-800"
                        />
                      ) : (
                        <div className="aspect-square w-full rounded-md border border-zinc-200 dark:border-zinc-800" />
                      )}
                      <span className="text-xs text-zinc-700 dark:text-zinc-300">{item.product.name}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </section>
      )}

      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-medium text-zinc-900 dark:text-zinc-50">Especificações por ambiente</h2>
        {data.areas.length === 0 && (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">Nenhum ambiente especificado ainda.</p>
        )}
        {data.areas.map((area) => (
          <div
            key={area.id}
            className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950"
          >
            <h3 className="font-medium text-zinc-900 dark:text-zinc-50">{area.name}</h3>
            {area.specifications.length === 0 ? (
              <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">Nenhum produto especificado ainda.</p>
            ) : (
              <ul className="mt-3 flex flex-col gap-4">
                {area.specifications.map((spec) => (
                  <li key={spec.id} className="flex flex-col gap-2 border-t border-zinc-100 pt-3 dark:border-zinc-900 first:border-0 first:pt-0">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm text-zinc-900 dark:text-zinc-50">
                          {spec.product.name} <span className="text-zinc-500 dark:text-zinc-400">× {spec.quantity}</span>
                        </p>
                        {spec.product.supplier && (
                          <p className="text-xs text-zinc-500 dark:text-zinc-400">{spec.product.supplier}</p>
                        )}
                        {spec.unitPrice && (
                          <p className="mt-1 font-mono text-xs text-zinc-500 dark:text-zinc-400">
                            R$ {Number(spec.unitPrice).toLocaleString("pt-BR")}
                          </p>
                        )}
                      </div>
                      <form action={setSpecificationApproval.bind(null, token, spec.id, !spec.clientApproved)}>
                        <button
                          type="submit"
                          className={
                            spec.clientApproved
                              ? "rounded-md border border-emerald-600 px-3 py-1 text-xs text-emerald-700 dark:text-emerald-400"
                              : "rounded-md bg-zinc-900 px-3 py-1 text-xs text-white dark:bg-zinc-50 dark:text-zinc-900"
                          }
                        >
                          {spec.clientApproved ? "Aprovado ✓ (desfazer)" : "Aprovar"}
                        </button>
                      </form>
                    </div>
                    <form
                      action={submitSpecificationComment.bind(null, token, spec.id)}
                      className="flex items-center gap-2"
                    >
                      <input
                        name="comment"
                        defaultValue={spec.clientComment ?? ""}
                        placeholder="Deixe um comentário…"
                        className="w-full rounded border border-zinc-300 bg-transparent px-2 py-1 text-sm text-zinc-900 dark:border-zinc-700 dark:text-zinc-50"
                      />
                      <button type="submit" className="text-xs text-zinc-500 hover:underline dark:text-zinc-400">
                        Salvar
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </section>
    </main>
  );
}
