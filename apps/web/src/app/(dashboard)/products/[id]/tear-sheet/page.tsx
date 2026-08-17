import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { apiGet, ApiError } from "@/lib/api";
import type { Product } from "@/lib/types";
import { PrintButton } from "@/components/products/print-button";

function Field({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">{label}</span>
      <span className="text-zinc-900 dark:text-zinc-50">{value}</span>
    </div>
  );
}

export default async function TearSheetPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    redirect("/api/auth/signin");
  }

  const { id } = await params;

  let product: Product;
  try {
    product = await apiGet<Product>(`products/${id}`);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      notFound();
    }
    throw err;
  }

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-6 py-12 print:max-w-none print:px-0 print:py-0">
      <div className="flex items-center justify-between print:hidden">
        <Link href="/products" className="text-xs text-zinc-500 hover:underline dark:text-zinc-400">
          ← Catálogo de produtos
        </Link>
        <PrintButton />
      </div>

      <article className="flex flex-col gap-6 rounded-lg border border-zinc-200 bg-white p-8 dark:border-zinc-800 dark:bg-zinc-950 print:border-0 print:p-0">
        <header className="flex flex-col gap-1 border-b border-zinc-200 pb-4 dark:border-zinc-800">
          <span className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Ficha técnica</span>
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
            {product.name}
            {product.isGeneric && (
              <span className="ml-2 rounded-full border border-zinc-300 px-1.5 py-0.5 align-middle text-[10px] uppercase text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
                genérico
              </span>
            )}
          </h1>
        </header>

        {product.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={product.imageUrl}
            alt={product.name}
            className="max-h-96 w-full rounded-md border border-zinc-200 object-contain dark:border-zinc-800"
          />
        )}

        <div className="grid grid-cols-2 gap-4 text-sm">
          <Field label="Fornecedor" value={product.supplier ?? null} />
          <Field label="Preço" value={product.price ? `R$ ${Number(product.price).toLocaleString("pt-BR")}` : null} />
          <Field label="Dimensões" value={product.dimensions ?? null} />
          <Field label="Acabamento" value={product.finish ?? null} />
          <Field label="Prazo de entrega" value={product.leadTimeDays ? `${product.leadTimeDays} dias` : null} />
        </div>

        {product.sourceUrl && (
          <div className="flex flex-col gap-0.5 text-sm">
            <span className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Fonte</span>
            <a href={product.sourceUrl} className="text-zinc-900 underline dark:text-zinc-50">
              {product.sourceUrl}
            </a>
          </div>
        )}
      </article>
    </main>
  );
}
