"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

// Bloqueador 11 da auditoria: cobre o caso mais raro e mais grave -- um
// throw dentro do PRÓPRIO app/layout.tsx (raiz de tudo, inclusive
// present/[token]). Só global-error.tsx consegue capturar isso; um
// error.tsx comum (mesmo o de app/error.tsx) não alcança, porque o
// layout que ele mora dentro é exatamente o que quebrou. Por isso
// precisa renderizar <html>/<body> própria -- o layout raiz não vai
// rodar pra fornecer os dele. Reporta ao Sentry aqui também (bloqueador
// 09) -- é o ponto recomendado pela própria documentação do Sentry pra
// App Router, já que error.tsx comum não cobre este caso.
export default function GlobalError({
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
    <html lang="pt-BR">
      <body className="flex min-h-screen items-center justify-center bg-white px-6 dark:bg-black">
        <main className="flex max-w-md flex-col items-start gap-3">
          <h1 className="text-lg font-medium text-zinc-900 dark:text-zinc-50">Algo deu errado</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            {error.message || "Um erro inesperado interrompeu a aplicação."}
          </p>
          <button
            type="button"
            onClick={reset}
            className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm text-white dark:bg-zinc-50 dark:text-zinc-900"
          >
            Tentar de novo
          </button>
        </main>
      </body>
    </html>
  );
}
