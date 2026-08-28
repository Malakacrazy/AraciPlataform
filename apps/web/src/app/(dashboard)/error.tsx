"use client";

// Achado A-01 da auditoria: não existia error.tsx em lugar nenhum de
// src/app, então qualquer throw não tratado numa das 20 rotas do
// dashboard caía na tela de erro genérica do Next (sem navegação, sem
// forma de voltar). Este arquivo cobre as páginas do grupo (dashboard) --
// não cobre um throw dentro do próprio (dashboard)/layout.tsx, que tem
// seu próprio try/catch agora; um erro ali sobe pro boundary do layout
// raiz.
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="mx-auto flex max-w-md flex-col items-start gap-3 px-6 py-24">
      <h1 className="text-lg font-medium text-zinc-900 dark:text-zinc-50">Algo deu errado</h1>
      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        {error.message || "Um erro inesperado interrompeu esta página."}
      </p>
      <div className="flex gap-4 text-sm">
        <button
          type="button"
          onClick={reset}
          className="rounded-md bg-zinc-900 px-3 py-1.5 text-white dark:bg-zinc-50 dark:text-zinc-900"
        >
          Tentar de novo
        </button>
        <a href="/" className="self-center text-zinc-500 hover:underline dark:text-zinc-400">
          Voltar ao início
        </a>
      </div>
    </main>
  );
}
