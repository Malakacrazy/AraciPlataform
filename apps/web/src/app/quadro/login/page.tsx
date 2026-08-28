// Login do convidado do quadro -- sem formulário de e-mail (diferente de
// /colaborador/login e /portal/login): a identidade é provada pelo
// Logto, não por magic link próprio. "Entrar" é um <a> de navegação de
// página inteira (não um fetch), mesmo motivo de GoogleSyncPanel: o
// fluxo OAuth precisa redirecionar o navegador de verdade.
export default async function QuadroLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; board?: string }>;
}) {
  const { error, board } = await searchParams;
  const authorizeHref = board ? `/api/quadro/authorize?board=${encodeURIComponent(board)}` : "/api/quadro/authorize";

  return (
    <main className="mx-auto flex max-w-sm flex-col gap-6 px-6 py-24">
      <div>
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">Entrar no quadro</h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Você foi convidado a colaborar num quadro do Studio Araci. Entre com sua conta pra continuar.
        </p>
      </div>

      {error && (
        <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      )}

      <a
        href={authorizeHref}
        className="rounded-md bg-zinc-900 px-4 py-2 text-center text-sm text-white dark:bg-zinc-50 dark:text-zinc-900"
      >
        Entrar
      </a>
    </main>
  );
}
