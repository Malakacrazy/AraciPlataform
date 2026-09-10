"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

// Achado §6.2 do plano de migração tldraw->Excalidraw: /present/[token] é
// alcançável por um cliente sem conta, sem sessão NextAuth -- cai fora do
// grupo (dashboard) e não tinha nenhum error.tsx dedicado, só o boundary
// genérico de app/error.tsx. BoardErrorBoundary (por prancha, ver
// collaborative-board.tsx no map desta rota) já cobre o caso mais
// provável (uma prancha de 0.x lançando no mount); este é o segundo net,
// pra qualquer outro throw nesta página (fora do editor) não derrubar o
// cliente direto na tela de erro genérica do Next sem reportar ao Sentry.
export default function PresentationError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error, { tags: { surface: "client" } });
  }, [error]);

  return (
    <main className="mx-auto flex max-w-md flex-col items-start gap-3 px-6 py-24">
      <h1 className="text-lg font-medium text-zinc-900 dark:text-zinc-50">Algo deu errado</h1>
      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        {error.message || "Um erro inesperado interrompeu esta página."}
      </p>
      <button
        type="button"
        onClick={reset}
        className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm text-white dark:bg-zinc-50 dark:text-zinc-900"
      >
        Tentar de novo
      </button>
    </main>
  );
}
