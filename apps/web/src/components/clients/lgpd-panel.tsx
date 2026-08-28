"use client";

import { useState, useTransition } from "react";
import { anonymizeClient } from "./actions";

// Lacuna da matriz (LGPD) -- admin-only (a página que renderiza isto já
// checa accessLevel antes de montar o componente, mesmo padrão de
// ApiKeyPanel/GoogleSyncPanel só aparecendo condicionalmente). Exportar
// não precisa de server action: é GET, a sessão já autentica via cookie
// no proxy BFF (api/v1/[...path]/route.ts), então um fetch client-side
// direto + download basta, mesmo espírito do export de CSV do
// financeiro/FF&E.
export function LgpdPanel({ clientId, anonymizedAt }: { clientId: string; anonymizedAt?: string | null }) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function handleExport() {
    setError(null);
    try {
      const res = await fetch(`/api/v1/clients/${clientId}/data-export`);
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error?.message ?? "Não foi possível exportar os dados.");
      }
      const body = await res.json();
      const blob = new Blob([JSON.stringify(body.data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `dados-cliente_${clientId}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro desconhecido.");
    }
  }

  function handleAnonymize() {
    setError(null);
    startTransition(async () => {
      try {
        await anonymizeClient(clientId);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erro desconhecido.");
      }
    });
  }

  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
      <h2 className="font-medium text-zinc-900 dark:text-zinc-50">Dados pessoais (LGPD)</h2>
      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
        Exportação e anonimização a pedido do titular. Anonimizar remove nome, e-mail, telefone e documento — o
        histórico de projetos e faturas permanece, sem identificar mais este cliente.
      </p>
      {error && <p className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</p>}
      {anonymizedAt ? (
        <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">
          Anonimizado em {new Date(anonymizedAt).toLocaleDateString("pt-BR")}.
        </p>
      ) : (
        <div className="mt-3 flex gap-3">
          <button
            type="button"
            onClick={handleExport}
            className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs text-zinc-700 dark:border-zinc-700 dark:text-zinc-300"
          >
            Exportar dados (JSON)
          </button>
          <button
            type="button"
            onClick={handleAnonymize}
            disabled={isPending}
            className="rounded-md border border-red-300 px-3 py-1.5 text-xs text-red-600 disabled:opacity-50 dark:border-red-900 dark:text-red-400"
          >
            Anonimizar cliente
          </button>
        </div>
      )}
    </section>
  );
}
