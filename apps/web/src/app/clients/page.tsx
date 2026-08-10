import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { apiGet } from "@/lib/api";
import type { Client } from "@/lib/types";
import { createClient } from "@/components/clients/actions";

export default async function ClientsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    redirect("/api/auth/signin");
  }

  const clients = await apiGet<Client[]>("clients");

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-12">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Clientes</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">Captação e relacionamento — CRM.</p>
      </div>

      <section className="rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
        {clients.length === 0 ? (
          <p className="p-5 text-sm text-zinc-500 dark:text-zinc-400">Nenhum cliente ainda.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                <th className="px-5 py-3 font-medium">Nome</th>
                <th className="px-5 py-3 font-medium">Contato</th>
                <th className="px-5 py-3 font-medium">Origem</th>
              </tr>
            </thead>
            <tbody>
              {clients.map((client) => (
                <tr key={client.id} className="border-b border-zinc-100 last:border-0 dark:border-zinc-900">
                  <td className="px-5 py-3">
                    <Link href={`/clients/${client.id}`} className="text-zinc-900 hover:underline dark:text-zinc-50">
                      {client.name}
                    </Link>
                  </td>
                  <td className="px-5 py-3 text-zinc-500 dark:text-zinc-400">
                    {[client.email, client.phone].filter(Boolean).join(" — ") || "—"}
                  </td>
                  <td className="px-5 py-3 text-zinc-500 dark:text-zinc-400">{client.source ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="font-medium text-zinc-900 dark:text-zinc-50">Novo cliente</h2>
        <form action={createClient} className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm sm:col-span-2">
            <span className="text-zinc-500 dark:text-zinc-400">Nome *</span>
            <input
              name="name"
              required
              className="rounded-md border border-zinc-300 bg-transparent px-3 py-1.5 text-zinc-900 dark:border-zinc-700 dark:text-zinc-50"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-zinc-500 dark:text-zinc-400">E-mail</span>
            <input
              name="email"
              type="email"
              className="rounded-md border border-zinc-300 bg-transparent px-3 py-1.5 text-zinc-900 dark:border-zinc-700 dark:text-zinc-50"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-zinc-500 dark:text-zinc-400">Telefone</span>
            <input
              name="phone"
              className="rounded-md border border-zinc-300 bg-transparent px-3 py-1.5 text-zinc-900 dark:border-zinc-700 dark:text-zinc-50"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-zinc-500 dark:text-zinc-400">CPF/CNPJ</span>
            <input
              name="document"
              className="rounded-md border border-zinc-300 bg-transparent px-3 py-1.5 text-zinc-900 dark:border-zinc-700 dark:text-zinc-50"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-zinc-500 dark:text-zinc-400">Origem</span>
            <select
              name="source"
              defaultValue=""
              className="rounded-md border border-zinc-300 bg-transparent px-3 py-1.5 text-zinc-900 dark:border-zinc-700 dark:text-zinc-50"
            >
              <option value="">—</option>
              <option value="site">Site</option>
              <option value="whatsapp">WhatsApp</option>
              <option value="instagram">Instagram</option>
              <option value="indicacao">Indicação</option>
              <option value="email">E-mail</option>
              <option value="telefone">Telefone</option>
            </select>
          </label>
          <button
            type="submit"
            className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm text-white sm:col-span-2 sm:w-fit dark:bg-zinc-50 dark:text-zinc-900"
          >
            Criar cliente
          </button>
        </form>
      </section>
    </main>
  );
}
