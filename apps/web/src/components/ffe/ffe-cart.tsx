"use client";

import { useState } from "react";
import type { ProductSpecification } from "@/lib/types";
import { checkoutCart } from "./actions";

function lineTotal(spec: ProductSpecification): number {
  if (spec.unitPrice === null || spec.unitPrice === undefined) return 0;
  return spec.quantity * Number(spec.unitPrice) * (1 + Number(spec.markupPercent ?? 0));
}

export function FfeCart({ projectId, specs }: { projectId: string; specs: ProductSpecification[] }) {
  const pending = specs.filter((s) => !s.clientApproved);
  const pendingIds = pending
    .map((s) => s.id)
    .sort()
    .join(",");

  const [selected, setSelected] = useState<Set<string>>(new Set(pending.map((s) => s.id)));
  // FfeCart não remonta quando o Server Action de criar/remover
  // especificação revalida a página -- só re-renderiza com specs novo. O
  // inicializador do useState só roda no mount, então sem isto a seleção
  // ficava travada no estado de quando o carrinho estava vazio (achado
  // clicando de verdade no navegador, não só typecheck). Padrão
  // documentado do React para resetar estado quando uma prop muda:
  // ajustar durante o render, guardado por comparação com o valor
  // anterior, em vez de useEffect (evita um frame com a seleção errada).
  const [lastPendingIds, setLastPendingIds] = useState(pendingIds);
  if (pendingIds !== lastPendingIds) {
    setLastPendingIds(pendingIds);
    setSelected(new Set(pending.map((s) => s.id)));
  }

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const total = pending.filter((s) => selected.has(s.id)).reduce((sum, s) => sum + lineTotal(s), 0);
  const hasMissingPrice = pending.some((s) => selected.has(s.id) && (s.unitPrice === null || s.unitPrice === undefined));

  async function handleCheckout() {
    setError(null);
    if (selected.size === 0) {
      setError("Selecione ao menos um item.");
      return;
    }
    setIsSubmitting(true);
    try {
      await checkoutCart(projectId, Array.from(selected));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao aprovar o carrinho.");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (pending.length === 0) {
    return <p className="text-sm text-zinc-500 dark:text-zinc-400">Nenhum item pendente de aprovação.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {error && <p className="text-sm text-red-600">{error}</p>}
      <ul className="flex flex-col gap-2">
        {pending.map((spec) => (
          <li
            key={spec.id}
            className="flex items-center justify-between gap-3 rounded-md border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-800"
          >
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={selected.has(spec.id)} onChange={() => toggle(spec.id)} />
              <span className="text-zinc-900 dark:text-zinc-50">
                {spec.product.name} <span className="text-zinc-500 dark:text-zinc-400">× {spec.quantity}</span>
              </span>
            </label>
            <span className="font-mono text-xs text-zinc-500 dark:text-zinc-400">
              {spec.unitPrice ? `R$ ${lineTotal(spec).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "sem preço"}
            </span>
          </li>
        ))}
      </ul>
      <div className="flex items-center justify-between border-t border-zinc-200 pt-3 dark:border-zinc-800">
        <span className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
          Total selecionado: R$ {total.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
        </span>
        <button
          type="button"
          onClick={handleCheckout}
          disabled={isSubmitting || hasMissingPrice}
          className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm text-white disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900"
        >
          {isSubmitting ? "Aprovando…" : "Aprovar selecionados"}
        </button>
      </div>
      {hasMissingPrice && (
        <p className="text-xs text-amber-600 dark:text-amber-400">
          Itens sem preço definido não podem ser aprovados — remova a seleção deles ou defina o preço.
        </p>
      )}
    </div>
  );
}
