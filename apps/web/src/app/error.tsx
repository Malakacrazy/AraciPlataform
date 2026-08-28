"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

// Bloqueador 11 da auditoria: (dashboard)/error.tsx (achado A-01) só
// cobre as rotas do grupo (dashboard) -- as 4 rotas públicas (portal,
// present/[token], lead, projects/.../print) não tinham nenhum error.tsx
// acima delas, então qualquer throw não tratado caía direto na tela de
// erro genérica do Next. Mesmo texto/layout do (dashboard)/error.tsx,
// duplicado (não importado de lá) porque cada error.tsx é isolado por
// segmento de rota no App Router -- não dá pra reaproveitar um
// Client Component de outro segmento como boundary. Reporta ao Sentry
// (bloqueador 09) -- este é o boundary que a maioria dos erros reais
// vai bater, bem mais frequente que global-error.tsx.
export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

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
