"use client";

import { useState, useTransition } from "react";
import { generateApiKey, revokeApiKey } from "./actions";

export function ApiKeyPanel({ userId, hasKey }: { userId: string; hasKey: boolean }) {
  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleGenerate() {
    setError(null);
    startTransition(async () => {
      try {
        const key = await generateApiKey(userId);
        setRevealedKey(key);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erro desconhecido.");
      }
    });
  }

  function handleRevoke() {
    setError(null);
    startTransition(async () => {
      try {
        await revokeApiKey(userId);
        setRevealedKey(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erro desconhecido.");
      }
    });
  }

  async function copyKey() {
    if (!revealedKey) return;
    try {
      await navigator.clipboard.writeText(revealedKey);
    } catch {
      // Sem acesso à área de transferência (ex.: contexto não seguro) —
      // a chave continua visível na tela para cópia manual.
    }
  }

  return (
    <div className="mt-3 border-t border-zinc-100 pt-3 dark:border-zinc-900">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
          Chave de API (extensão Captura)
        </span>
        <span className="text-xs text-zinc-400 dark:text-zinc-600">
          {hasKey ? "Chave ativa" : "Nenhuma chave"}
        </span>
      </div>

      {revealedKey && (
        <div className="mt-2 rounded-md border border-amber-300 bg-amber-50 p-2 dark:border-amber-900 dark:bg-amber-950">
          <p className="text-xs text-amber-800 dark:text-amber-300">
            Copie agora — essa chave não pode ser exibida de novo. Cole em Studio Araci · Orçamento FF&E →
            Configurações.
          </p>
          <div className="mt-1 flex items-center gap-2">
            <code className="flex-1 truncate rounded bg-white px-2 py-1 text-xs text-zinc-900 dark:bg-zinc-900 dark:text-zinc-50">
              {revealedKey}
            </code>
            <button
              type="button"
              onClick={copyKey}
              className="rounded-md bg-zinc-900 px-2 py-1 text-xs text-white dark:bg-zinc-50 dark:text-zinc-900"
            >
              Copiar
            </button>
          </div>
        </div>
      )}

      {error && <p className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</p>}

      <div className="mt-2 flex gap-2">
        <button
          type="button"
          onClick={handleGenerate}
          disabled={isPending}
          className="rounded-md border border-zinc-300 px-2 py-1 text-xs text-zinc-700 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300"
        >
          {hasKey ? "Regenerar" : "Gerar chave"}
        </button>
        {hasKey && (
          <button
            type="button"
            onClick={handleRevoke}
            disabled={isPending}
            className="rounded-md border border-zinc-300 px-2 py-1 text-xs text-red-600 disabled:opacity-50 dark:border-zinc-700 dark:text-red-400"
          >
            Remover
          </button>
        )}
      </div>
    </div>
  );
}
