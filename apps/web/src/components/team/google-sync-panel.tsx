"use client";

import { useState, useTransition } from "react";
import { disconnectGoogleSync } from "./actions";

// "Conectar" é um <a> de navegação de página inteira, não um fetch --
// precisa ser assim porque o fluxo OAuth (response_type=code) exige
// redirecionar o navegador de verdade pro Google e depois de volta pro
// callback (ver apps/api/google/authorize/route.ts). Diferente do picker
// de Drive/Calendar/Gmail em office-links-section.tsx (que roda inteiro
// em JS, sem navegação), porque aquele fluxo não precisa nem consegue
// devolver um refresh_token -- só este fluxo aqui consegue.
export function GoogleSyncPanel({
  connected,
  scope,
  updatedAt,
}: {
  connected: boolean;
  scope?: string;
  updatedAt?: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [disconnected, setDisconnected] = useState(false);

  function handleDisconnect() {
    setError(null);
    startTransition(async () => {
      try {
        await disconnectGoogleSync();
        setDisconnected(true);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erro desconhecido.");
      }
    });
  }

  const isConnected = connected && !disconnected;

  return (
    <div className="mt-3 border-t border-zinc-100 pt-3 dark:border-zinc-900">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
          Sincronização Google (fundação — ainda não sincroniza nada sozinho)
        </span>
        <span className="text-xs text-zinc-400 dark:text-zinc-600">
          {isConnected ? "Conectada" : "Desconectada"}
        </span>
      </div>

      {isConnected && updatedAt && (
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          Conectado desde {new Date(updatedAt).toLocaleDateString("pt-BR")}
          {scope ? ` — permissões: ${scope.split(" ").pop()}` : ""}
        </p>
      )}

      {error && <p className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</p>}

      <div className="mt-2 flex gap-2">
        {isConnected ? (
          <button
            type="button"
            onClick={handleDisconnect}
            disabled={isPending}
            className="rounded-md border border-zinc-300 px-2 py-1 text-xs text-red-600 disabled:opacity-50 dark:border-zinc-700 dark:text-red-400"
          >
            Desconectar
          </button>
        ) : (
          <a
            href="/api/google/authorize"
            className="rounded-md border border-zinc-300 px-2 py-1 text-xs text-zinc-700 dark:border-zinc-700 dark:text-zinc-300"
          >
            Conectar
          </a>
        )}
      </div>
    </div>
  );
}
