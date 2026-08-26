import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { apiGet, ApiError } from "@/lib/api";
import type { Project, Area, Product, ProductSpecification, Moodboard, PresentationLink } from "@/lib/types";
import { FfeCart } from "@/components/ffe/ffe-cart";
import { createArea, deleteArea, createSpecification, deleteSpecification } from "@/components/ffe/actions";
import { createMoodboard, deleteMoodboard, addMoodboardItem, removeMoodboardItem } from "@/components/moodboards/actions";
import { PresentationLinkPanel } from "@/components/moodboards/presentation-link-panel";

export default async function ProjectFfePage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    redirect("/api/auth/signin");
  }

  const { id } = await params;

  let project: Project;
  let areas: Area[];
  let products: Product[];
  let moodboards: Moodboard[];
  let presentationLink: PresentationLink | null;
  try {
    [project, areas, products, moodboards, presentationLink] = await Promise.all([
      apiGet<Project>(`projects/${id}`),
      apiGet<Area[]>(`projects/${id}/areas`),
      apiGet<Product[]>("products"),
      apiGet<Moodboard[]>(`projects/${id}/moodboards`),
      apiGet<PresentationLink | null>(`projects/${id}/presentation-link`),
    ]);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      notFound();
    }
    throw err;
  }

  const specsByArea = await Promise.all(
    areas.map((area) => apiGet<ProductSpecification[]>(`areas/${area.id}/specifications`)),
  );
  const allSpecs = specsByArea.flat();

  // Mesma fórmula de linha do checkout real (ver
  // SpecificationsService.approveCartToInvoiceDraft) -- só reaplicada
  // aqui pra somar por categoria em vez de por especificação. "Sem
  // categoria" agrupa specs cujo produto ainda não tem Product.category
  // preenchido (campo opcional, ver schema.prisma).
  const porCategoria = new Map<string, { aprovado: number; pendente: number }>();
  for (const spec of allSpecs) {
    if (spec.unitPrice === null || spec.unitPrice === undefined) continue;
    const categoria = spec.product.category ?? "Sem categoria";
    const entry = porCategoria.get(categoria) ?? { aprovado: 0, pendente: 0 };
    const valor = spec.quantity * Number(spec.unitPrice) * (1 + Number(spec.markupPercent ?? 0));
    if (spec.clientApproved) entry.aprovado += valor;
    else entry.pendente += valor;
    porCategoria.set(categoria, entry);
  }
  const categorias = [...porCategoria.entries()].sort((a, b) => b[1].aprovado + b[1].pendente - (a[1].aprovado + a[1].pendente));

  function productOptionLabel(p: Product) {
    return p.variantOf ? `${p.variantOf.name} — ${p.variantLabel}` : p.name;
  }

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-12">
      <div>
        <Link href={`/projects/${id}`} className="text-xs text-zinc-500 hover:underline dark:text-zinc-400">
          ← {project.name}
        </Link>
        <h1 className="mt-1 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">FF&E</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Especificação por ambiente e carrinho de aprovação do cliente.
        </p>
      </div>

      {categorias.length > 0 && (
        <section className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
          <h2 className="font-medium text-zinc-900 dark:text-zinc-50">Orçamento por categoria</h2>
          <table className="mt-3 w-full text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                <th className="py-2 pr-3 font-medium">Categoria</th>
                <th className="py-2 pr-3 font-medium">Aprovado</th>
                <th className="py-2 font-medium">Pendente</th>
              </tr>
            </thead>
            <tbody>
              {categorias.map(([categoria, valores]) => (
                <tr key={categoria} className="border-b border-zinc-100 last:border-0 dark:border-zinc-900">
                  <td className="py-2 pr-3 text-zinc-900 dark:text-zinc-50">{categoria}</td>
                  <td className="py-2 pr-3 font-mono text-zinc-500 dark:text-zinc-400">
                    R$ {valores.aprovado.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                  </td>
                  <td className="py-2 font-mono text-zinc-500 dark:text-zinc-400">
                    R$ {valores.pendente.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {areas.map((area, i) => (
        <section key={area.id} className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
          <div className="flex items-center justify-between">
            <h2 className="font-medium text-zinc-900 dark:text-zinc-50">{area.name}</h2>
            <form action={deleteArea.bind(null, id, area.id)}>
              <button type="submit" className="text-xs text-zinc-500 hover:text-red-600 dark:text-zinc-400">
                Remover ambiente
              </button>
            </form>
          </div>

          {specsByArea[i].length === 0 ? (
            <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">Nenhum produto especificado ainda.</p>
          ) : (
            <table className="mt-3 w-full text-left text-sm">
              <thead>
                <tr className="border-b border-zinc-200 text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                  <th className="py-2 pr-3 font-medium">Produto</th>
                  <th className="py-2 pr-3 font-medium">Fornecedor</th>
                  <th className="py-2 pr-3 font-medium">Qtd.</th>
                  <th className="py-2 pr-3 font-medium">Preço</th>
                  <th className="py-2 pr-3 font-medium">Status</th>
                  <th className="py-2 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {specsByArea[i].map((spec) => (
                  <tr key={spec.id} className="border-b border-zinc-100 last:border-0 dark:border-zinc-900">
                    <td className="py-2 pr-3 text-zinc-900 dark:text-zinc-50">
                      {spec.product.name}
                      {spec.product.isGeneric && (
                        <span className="ml-1 text-xs text-zinc-400 dark:text-zinc-600">(genérico)</span>
                      )}
                    </td>
                    <td className="py-2 pr-3 text-zinc-500 dark:text-zinc-400">{spec.product.supplier ?? "—"}</td>
                    <td className="py-2 pr-3 font-mono text-zinc-500 dark:text-zinc-400">{spec.quantity}</td>
                    <td className="py-2 pr-3 font-mono text-zinc-500 dark:text-zinc-400">
                      {spec.unitPrice ? `R$ ${Number(spec.unitPrice).toLocaleString("pt-BR")}` : "—"}
                    </td>
                    <td className="py-2 pr-3">
                      {spec.clientApproved ? (
                        <span className="text-xs text-emerald-700 dark:text-emerald-400">Aprovado</span>
                      ) : (
                        <span className="text-xs text-zinc-500 dark:text-zinc-400">Aguardando</span>
                      )}
                    </td>
                    <td className="py-2 text-right">
                      <Link
                        href={`/products/${spec.productId}/tear-sheet`}
                        className="mr-3 text-xs text-zinc-500 hover:underline dark:text-zinc-400"
                      >
                        Ficha técnica
                      </Link>
                      <form action={deleteSpecification.bind(null, id, spec.id)} className="inline">
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

          {products.length > 0 && (
            <form
              action={createSpecification.bind(null, id, area.id)}
              className="mt-3 flex flex-wrap items-end gap-2"
            >
              <label className="flex flex-col gap-1 text-xs text-zinc-500 dark:text-zinc-400">
                Produto
                <select
                  name="productId"
                  required
                  defaultValue=""
                  className="rounded border border-zinc-300 bg-transparent px-2 py-1 text-sm text-zinc-900 dark:border-zinc-700 dark:text-zinc-50"
                >
                  <option value="" disabled>
                    Selecione…
                  </option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {productOptionLabel(p)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs text-zinc-500 dark:text-zinc-400">
                Qtd.
                <input
                  name="quantity"
                  type="number"
                  min="1"
                  step="1"
                  defaultValue="1"
                  className="w-16 rounded border border-zinc-300 bg-transparent px-2 py-1 text-sm text-zinc-900 dark:border-zinc-700 dark:text-zinc-50"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-zinc-500 dark:text-zinc-400">
                Preço unit. (R$)
                <input
                  name="unitPrice"
                  type="number"
                  min="0"
                  step="0.01"
                  className="w-28 rounded border border-zinc-300 bg-transparent px-2 py-1 text-sm text-zinc-900 dark:border-zinc-700 dark:text-zinc-50"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-zinc-500 dark:text-zinc-400">
                Markup (%)
                <input
                  name="markupPercent"
                  type="number"
                  min="0"
                  step="1"
                  placeholder="ex.: 10"
                  className="w-20 rounded border border-zinc-300 bg-transparent px-2 py-1 text-sm text-zinc-900 dark:border-zinc-700 dark:text-zinc-50"
                />
              </label>
              <button type="submit" className="text-xs text-zinc-500 hover:underline dark:text-zinc-400">
                + Adicionar
              </button>
            </form>
          )}
        </section>
      ))}

      <section className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="font-medium text-zinc-900 dark:text-zinc-50">Novo ambiente</h2>
        <form action={createArea.bind(null, id)} className="mt-3 flex items-center gap-2">
          <input
            name="name"
            required
            placeholder="ex.: Sala de estar"
            className="w-64 rounded-md border border-zinc-300 bg-transparent px-3 py-1.5 text-sm text-zinc-900 dark:border-zinc-700 dark:text-zinc-50"
          />
          <button
            type="submit"
            className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm text-white dark:bg-zinc-50 dark:text-zinc-900"
          >
            Criar
          </button>
        </form>
      </section>

      <section className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="font-medium text-zinc-900 dark:text-zinc-50">Carrinho — Aprovação do Cliente</h2>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          Aprovar gera a fatura de FF&E no projeto — a compra em si (pedido ao fornecedor, entrega) acontece fora da
          plataforma.
        </p>
        <div className="mt-3">
          <FfeCart projectId={id} specs={allSpecs} />
        </div>
      </section>

      {moodboards.map((board) => (
        <section
          key={board.id}
          className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950"
        >
          <div className="flex items-center justify-between">
            <h2 className="font-medium text-zinc-900 dark:text-zinc-50">{board.name}</h2>
            <form action={deleteMoodboard.bind(null, id, board.id)}>
              <button type="submit" className="text-xs text-zinc-500 hover:text-red-600 dark:text-zinc-400">
                Remover prancha
              </button>
            </form>
          </div>

          {board.items.length === 0 ? (
            <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">Nenhum produto nesta prancha ainda.</p>
          ) : (
            <ul className="mt-3 flex flex-wrap gap-3">
              {board.items.map((item) => (
                <li
                  key={item.id}
                  className="flex items-center gap-2 rounded-md border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-800"
                >
                  <span className="text-zinc-900 dark:text-zinc-50">{item.product.name}</span>
                  <form action={removeMoodboardItem.bind(null, id, item.id)}>
                    <button type="submit" className="text-xs text-zinc-500 hover:text-red-600 dark:text-zinc-400">
                      ×
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          )}

          {products.length > 0 && (
            <form action={addMoodboardItem.bind(null, id, board.id)} className="mt-3 flex items-end gap-2">
              <label className="flex flex-col gap-1 text-xs text-zinc-500 dark:text-zinc-400">
                Produto
                <select
                  name="productId"
                  required
                  defaultValue=""
                  className="rounded border border-zinc-300 bg-transparent px-2 py-1 text-sm text-zinc-900 dark:border-zinc-700 dark:text-zinc-50"
                >
                  <option value="" disabled>
                    Selecione…
                  </option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {productOptionLabel(p)}
                    </option>
                  ))}
                </select>
              </label>
              <button type="submit" className="text-xs text-zinc-500 hover:underline dark:text-zinc-400">
                + Adicionar
              </button>
            </form>
          )}
        </section>
      ))}

      <section className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="font-medium text-zinc-900 dark:text-zinc-50">Nova prancha</h2>
        <form action={createMoodboard.bind(null, id)} className="mt-3 flex items-center gap-2">
          <input
            name="name"
            required
            placeholder="ex.: Sala de estar — Conceito 1"
            className="w-64 rounded-md border border-zinc-300 bg-transparent px-3 py-1.5 text-sm text-zinc-900 dark:border-zinc-700 dark:text-zinc-50"
          />
          <button
            type="submit"
            className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm text-white dark:bg-zinc-50 dark:text-zinc-900"
          >
            Criar
          </button>
        </form>
      </section>

      <section className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="font-medium text-zinc-900 dark:text-zinc-50">Apresentação para o cliente</h2>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          Link único, sem login — o cliente vê ambientes, pranchas e pode aprovar/comentar itens.
        </p>
        <div className="mt-3">
          <PresentationLinkPanel projectId={id} link={presentationLink} />
        </div>
      </section>
    </main>
  );
}
