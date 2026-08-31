"use client";

import { useState } from "react";

// Lacuna da matriz (LGPD, "Meus dados" self-service) -- fetch client-side
// pra /portal/data-export (rota própria, não o proxy BFF genérico -- ver
// comentário lá), que já autentica pelo cookie client_session
// automaticamente (same-origin, httpOnly, enviado pelo navegador sozinho).
// Achado A44 da auditoria de 30 ago 2026: a rota vivia em
// /api/portal/data-export -- fora do path (Path=/portal) do cookie de
// sessão do cliente, então o navegador nunca o enviava e isto sempre
// devolvia 401 (ver o route.ts atual pra detalhe do RFC 6265).
export function MyDataButton() {
  const [error, setError] = useState<string | null>(null);

  async function handleExport() {
    setError(null);
    try {
      const res = await fetch("/portal/data-export");
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error?.message ?? "Não foi possível exportar seus dados.");
      }
      const body = await res.json();
      const blob = new Blob([JSON.stringify(body.data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "meus-dados.json";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro desconhecido.");
    }
  }

  return (
    <div>
      <button type="button" onClick={handleExport} className="text-xs text-zinc-500 hover:underline dark:text-zinc-400">
        Baixar meus dados
      </button>
      {error && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
