import { requestLink } from "@/components/portal/actions";

export default async function PortalLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string; error?: string }>;
}) {
  const { sent, error } = await searchParams;

  return (
    <main className="mx-auto flex max-w-sm flex-col gap-6 px-6 py-16">
      <div>
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">Acessar meus projetos</h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Informe o e-mail cadastrado pelo estúdio — enviaremos um link de acesso.
        </p>
      </div>

      {sent === "1" && (
        <p className="rounded-md border border-zinc-200 bg-white p-3 text-sm text-zinc-700 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300">
          Se o e-mail estiver cadastrado, você receberá um link de acesso em instantes. Ele vale por 15 minutos.
        </p>
      )}

      {error && (
        <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      )}

      <form action={requestLink} className="flex flex-col gap-3">
        <input
          name="email"
          type="email"
          required
          placeholder="seu@email.com"
          className="rounded-md border border-zinc-300 bg-transparent px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:text-zinc-50"
        />
        <button
          type="submit"
          className="rounded-md bg-zinc-900 px-3 py-2 text-sm text-white dark:bg-zinc-50 dark:text-zinc-900"
        >
          Enviar link
        </button>
      </form>
    </main>
  );
}
