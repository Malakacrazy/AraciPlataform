"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import type { Moodboard, MoodboardItem, Product } from "@/lib/types";
import {
  addMoodboardItem,
  addSwatchItem,
  removeMoodboardItem,
  updateMoodboardItemLayout,
} from "./actions";
import { MOODBOARD_CANVAS_HEIGHT, MOODBOARD_CANVAS_WIDTH, MoodboardItemVisual } from "./moodboard-canvas-shared";

const MIN_ITEM_WIDTH = 60;
const MAX_ITEM_WIDTH = MOODBOARD_CANVAS_WIDTH;

// Duplicado de projects/[id]/ffe/page.tsx (não importado de lá): Server
// Components não podem passar função como prop pra um Client Component
// (RSC exige props serializáveis) -- então em vez de receber a função
// pronta, este componente refaz a mesma formatação de uma linha.
function productOptionLabel(p: Product): string {
  return p.variantOf ? `${p.variantOf.name} — ${p.variantLabel}` : p.name;
}

// Arrastar/redimensionar sem lib nova (o resto do app não usa nenhuma pra
// interação) -- pointer capture nativo, estado local otimista durante o
// gesto, e só persiste (updateMoodboardItemLayout) no pointerup. Trazer
// pra frente acontece automaticamente ao começar a arrastar, não precisa
// de um botão à parte.
export function MoodboardCanvas({
  projectId,
  moodboard,
  products,
}: {
  projectId: string;
  moodboard: Moodboard;
  products: Product[];
}) {
  const [items, setItems] = useState<MoodboardItem[]>(moodboard.items);
  const [error, setError] = useState<string | null>(null);
  const dragState = useRef<{
    itemId: string;
    mode: "move" | "resize";
    startClientX: number;
    startClientY: number;
    startX: number;
    startY: number;
    startWidth: number;
  } | null>(null);

  function updateLocal(itemId: string, patch: Partial<MoodboardItem>) {
    setItems((prev) => prev.map((it) => (it.id === itemId ? { ...it, ...patch } : it)));
  }

  function bringToFrontLocal(itemId: string) {
    const maxOrder = Math.max(0, ...items.map((it) => it.order));
    updateLocal(itemId, { order: maxOrder + 1 });
  }

  function handlePointerDown(e: React.PointerEvent, item: MoodboardItem, mode: "move" | "resize") {
    e.preventDefault();
    e.stopPropagation();
    // dragState precisa ser setado mesmo se o capture falhar -- sem isso,
    // um throw aqui (setPointerCapture pode lançar NotFoundError em casos
    // raros, ex.: sessão de pointer já encerrada) quebraria o arrastar
    // inteiro silenciosamente, já que o resto da função nunca rodaria.
    // Capture é otimização (manter recebendo eventos se o cursor sair do
    // elemento no meio do gesto), não pré-requisito -- funciona sem ele.
    dragState.current = {
      itemId: item.id,
      mode,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startX: item.x,
      startY: item.y,
      startWidth: item.width,
    };
    try {
      (e.target as Element).setPointerCapture(e.pointerId);
    } catch {
      // ignorado de propósito -- ver comentário acima.
    }
    bringToFrontLocal(item.id);
  }

  function handlePointerMove(e: React.PointerEvent) {
    const drag = dragState.current;
    if (!drag) return;
    const dx = e.clientX - drag.startClientX;
    const dy = e.clientY - drag.startClientY;
    if (drag.mode === "move") {
      const x = Math.max(0, Math.min(MOODBOARD_CANVAS_WIDTH - drag.startWidth, drag.startX + dx));
      const y = Math.max(0, Math.min(MOODBOARD_CANVAS_HEIGHT - 40, drag.startY + dy));
      updateLocal(drag.itemId, { x, y });
    } else {
      const width = Math.max(MIN_ITEM_WIDTH, Math.min(MAX_ITEM_WIDTH, drag.startWidth + dx));
      updateLocal(drag.itemId, { width });
    }
  }

  async function handlePointerUp() {
    const drag = dragState.current;
    dragState.current = null;
    if (!drag) return;
    const item = items.find((it) => it.id === drag.itemId);
    if (!item) return;
    try {
      await updateMoodboardItemLayout(projectId, item.id, {
        x: item.x,
        y: item.y,
        width: item.width,
        bringToFront: true,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível salvar a posição.");
    }
  }

  async function handleRemove(itemId: string) {
    setError(null);
    setItems((prev) => prev.filter((it) => it.id !== itemId));
    try {
      await removeMoodboardItem(projectId, itemId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível remover o item.");
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="max-w-full overflow-x-auto">
        <div
          className="relative rounded-md border border-dashed border-zinc-300 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900"
          style={{ width: MOODBOARD_CANVAS_WIDTH, height: MOODBOARD_CANVAS_HEIGHT }}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
        >
          {items.length === 0 && (
            <p className="absolute inset-0 flex items-center justify-center text-sm text-zinc-400 dark:text-zinc-600">
              Arraste produtos ou amostras pra esta prancha.
            </p>
          )}
          {items.map((item) => (
            <div
              key={item.id}
              className="group absolute cursor-move select-none"
              style={{ left: item.x, top: item.y, width: item.width, zIndex: item.order }}
              onPointerDown={(e) => handlePointerDown(e, item, "move")}
            >
              <MoodboardItemVisual item={item} />
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleRemove(item.id);
                }}
                onPointerDown={(e) => e.stopPropagation()}
                className="absolute -right-2 -top-2 hidden h-5 w-5 items-center justify-center rounded-full bg-zinc-900 text-xs text-white group-hover:flex dark:bg-zinc-50 dark:text-zinc-900"
                title="Remover"
              >
                ×
              </button>
              <div
                onPointerDown={(e) => handlePointerDown(e, item, "resize")}
                className="absolute bottom-0 right-0 hidden h-3 w-3 cursor-nwse-resize rounded-tl bg-zinc-900/70 group-hover:block dark:bg-zinc-50/70"
                title="Redimensionar"
              />
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-xs">
        <Link
          href={`/projects/${projectId}/moodboards/${moodboard.id}/print`}
          target="_blank"
          className="text-zinc-500 hover:underline dark:text-zinc-400"
        >
          Exportar prancha (PDF/impressão) →
        </Link>
      </div>

      {products.length > 0 && (
        <form action={addMoodboardItem.bind(null, projectId, moodboard.id)} className="flex items-end gap-2">
          <label className="flex flex-col gap-1 text-xs text-zinc-500 dark:text-zinc-400">
            Produto
            <select
              name="productId"
              required
              defaultValue=""
              className="rounded border border-zinc-300 bg-transparent px-2 py-1 text-sm text-zinc-900 dark:border-zinc-700 dark:text-zinc-50"
            >
              <option value="" disabled>
                Selecione…
              </option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {productOptionLabel(p)}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className="text-xs text-zinc-500 hover:underline dark:text-zinc-400">
            + Produto
          </button>
        </form>
      )}

      <form action={addSwatchItem.bind(null, projectId, moodboard.id)} className="flex items-end gap-2">
        <label className="flex flex-col gap-1 text-xs text-zinc-500 dark:text-zinc-400">
          Amostra (material/tecido)
          <input
            name="label"
            required
            placeholder="ex.: Linho cru"
            className="w-40 rounded border border-zinc-300 bg-transparent px-2 py-1 text-sm text-zinc-900 dark:border-zinc-700 dark:text-zinc-50"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-zinc-500 dark:text-zinc-400">
          Cor
          <input
            name="colorHex"
            type="color"
            required
            defaultValue="#c7c1b4"
            className="h-[30px] w-12 rounded border border-zinc-300 bg-transparent dark:border-zinc-700"
          />
        </label>
        <button type="submit" className="text-xs text-zinc-500 hover:underline dark:text-zinc-400">
          + Amostra
        </button>
      </form>
    </div>
  );
}
