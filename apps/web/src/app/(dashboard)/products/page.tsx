import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { apiGet } from "@/lib/api";
import type { Product } from "@/lib/types";
import { createProduct, deleteProduct } from "@/components/products/actions";

export default async function ProductsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    redirect("/api/auth/signin");
  }

  const products = await apiGet<Product[]>("products");

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-6 px-6 py-12">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Catálogo de Produtos</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Biblioteca do escritório — reaproveitável entre projetos.
        </p>
      </div>

      <section className="rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
        {products.length === 0 ? (
          <p className="p-5 text-sm text-zinc-500 dark:text-zinc-400">Nenhum produto ainda.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                <th className="px-5 py-3 font-medium">Produto</th>
                <th className="px-5 py-3 font-medium">Fornecedor</th>
                <th className="px-5 py-3 font-medium">Preço</th>
                <th className="px-5 py-3 font-medium">Dimensões</th>
                <th className="px-5 py-3 font-medium">Acabamento</th>
                <th className="px-5 py-3 font-medium">Prazo</th>
                <th className="px-5 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.id} className="border-b border-zinc-100 last:border-0 dark:border-zinc-900">
                  <td className="px-5 py-3 text-zinc-900 dark:text-zinc-50">
                    {p.name}
                    {p.isGeneric && (
                      <span className="ml-2 rounded-full border border-zinc-300 px-1.5 py-0.5 text-[10px] uppercase text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
                        genérico
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-zinc-500 dark:text-zinc-400">{p.supplier ?? "—"}</td>
                  <td className="px-5 py-3 font-mono text-zinc-500 dark:text-zinc-400">
                    {p.price ? `R$ ${Number(p.price).toLocaleString("pt-BR")}` : "—"}
                  </td>
                  <td className="px-5 py-3 text-zinc-500 dark:text-zinc-400">{p.dimensions ?? "—"}</td>
                  <td className="px-5 py-3 text-zinc-500 dark:text-zinc-400">{p.finish ?? "—"}</td>
                  <td className="px-5 py-3 text-zinc-500 dark:text-zinc-400">
                    {p.leadTimeDays ? `${p.leadTimeDays} dias` : "—"}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <form action={deleteProduct.bind(null, p.id)} className="inline">
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
        <h2 className="font-medium text-zinc-900 dark:text-zinc-50">Novo produto</h2>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          Cadastro manual — captura via web scraper (Captura) integra depois, mesmo formato.
        </p>
        <form action={createProduct} className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm sm:col-span-2">
            <span className="text-zinc-500 dark:text-zinc-400">Nome *</span>
            <input
              name="name"
              required
              className="rounded-md border border-zinc-300 bg-transparent px-3 py-1.5 text-zinc-900 dark:border-zinc-700 dark:text-zinc-50"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-zinc-500 dark:text-zinc-400">Fornecedor</span>
            <input
              name="supplier"
              className="rounded-md border border-zinc-300 bg-transparent px-3 py-1.5 text-zinc-900 dark:border-zinc-700 dark:text-zinc-50"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-zinc-500 dark:text-zinc-400">Preço (R$)</span>
            <input
              name="price"
              type="number"
              min="0"
              step="0.01"
              className="rounded-md border border-zinc-300 bg-transparent px-3 py-1.5 text-zinc-900 dark:border-zinc-700 dark:text-zinc-50"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-zinc-500 dark:text-zinc-400">Dimensões</span>
            <input
              name="dimensions"
              placeholder="ex.: 2,80 × 1,60m"
              className="rounded-md border border-zinc-300 bg-transparent px-3 py-1.5 text-zinc-900 dark:border-zinc-700 dark:text-zinc-50"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-zinc-500 dark:text-zinc-400">Acabamento</span>
            <input
              name="finish"
              className="rounded-md border border-zinc-300 bg-transparent px-3 py-1.5 text-zinc-900 dark:border-zinc-700 dark:text-zinc-50"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-zinc-500 dark:text-zinc-400">Prazo (dias)</span>
            <input
              name="leadTimeDays"
              type="number"
              min="0"
              step="1"
              className="rounded-md border border-zinc-300 bg-transparent px-3 py-1.5 text-zinc-900 dark:border-zinc-700 dark:text-zinc-50"
            />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input name="isGeneric" type="checkbox" />
            <span className="text-zinc-500 dark:text-zinc-400">Genérico (SKU ainda não definido)</span>
          </label>
          <button
            type="submit"
            className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm text-white sm:col-span-2 sm:w-fit dark:bg-zinc-50 dark:text-zinc-900"
          >
            Criar produto
          </button>
        </form>
      </section>
    </main>
  );
}
