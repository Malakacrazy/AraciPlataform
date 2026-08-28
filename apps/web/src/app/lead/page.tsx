import { submitLead } from "@/components/leads/actions";

export default async function LeadPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string; error?: string }>;
}) {
  const { sent, error } = await searchParams;

  return (
    <main className="mx-auto flex max-w-sm flex-col gap-6 px-6 py-16">
      <div>
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">Solicitar um orçamento</h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Conte um pouco sobre o seu projeto — a equipe entra em contato em breve.
        </p>
      </div>

      {sent === "1" ? (
        <p className="rounded-md border border-zinc-200 bg-white p-3 text-sm text-zinc-700 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300">
          Recebemos sua mensagem — a equipe do Studio Araci entra em contato em breve.
        </p>
      ) : (
        <form action={submitLead} className="flex flex-col gap-3">
          {error && (
            <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
              {error}
            </p>
          )}
          <input
            name="name"
            required
            placeholder="Seu nome"
            className="rounded-md border border-zinc-300 bg-transparent px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:text-zinc-50"
          />
          <input
            name="email"
            type="email"
            required
            placeholder="seu@email.com"
            className="rounded-md border border-zinc-300 bg-transparent px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:text-zinc-50"
          />
          <input
            name="phone"
            placeholder="Telefone / WhatsApp (opcional)"
            className="rounded-md border border-zinc-300 bg-transparent px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:text-zinc-50"
          />
          <textarea
            name="message"
            rows={4}
            placeholder="Conte um pouco sobre o projeto (opcional)"
            className="rounded-md border border-zinc-300 bg-transparent px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:text-zinc-50"
          />
          <label className="flex items-start gap-2 text-xs text-zinc-500 dark:text-zinc-400">
            <input name="consent" type="checkbox" required className="mt-0.5" />
            <span>
              Li e concordo com o uso dos meus dados para contato, conforme a{" "}
              <a href="/privacidade" target="_blank" className="underline">
                Política de Privacidade
              </a>
              .
            </span>
          </label>
          <button
            type="submit"
            className="rounded-md bg-zinc-900 px-3 py-2 text-sm text-white dark:bg-zinc-50 dark:text-zinc-900"
          >
            Enviar
          </button>
        </form>
      )}
    </main>
  );
}
