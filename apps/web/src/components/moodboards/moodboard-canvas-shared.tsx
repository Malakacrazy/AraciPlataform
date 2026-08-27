import type { MoodboardItem } from "@/lib/types";

// Dimensões lógicas fixas do canvas (não pixel de tela) -- x/y/width de
// cada item são guardados nessa escala, então o designer (canvas
// interativo), o cliente (link de apresentação) e o PDF exportado
// desenham exatamente o mesmo layout, só o contêiner ao redor
// escala/rola de forma diferente em cada tela.
export const MOODBOARD_CANVAS_WIDTH = 960;
export const MOODBOARD_CANVAS_HEIGHT = 600;

export function moodboardItemWrapperStyle(item: Pick<MoodboardItem, "x" | "y" | "width" | "order">) {
  return {
    position: "absolute" as const,
    left: item.x,
    top: item.y,
    width: item.width,
    zIndex: item.order,
  };
}

// Conteúdo visual de um item -- produto real (foto + nome) ou amostra de
// material/tecido (cor sólida ou foto própria + nome). Reaproveitado pelo
// canvas interativo, pela view de impressão/exportação e pelo link de
// apresentação pública, pra nunca divergir entre o que o designer monta e
// o que o cliente vê.
export function MoodboardItemVisual({ item }: { item: MoodboardItem }) {
  if (item.kind === "swatch") {
    return (
      <div className="flex flex-col gap-1">
        {item.swatchImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.swatchImageUrl}
            alt={item.label ?? "Amostra"}
            className="aspect-square w-full rounded-md border border-zinc-200 object-cover dark:border-zinc-800"
            draggable={false}
          />
        ) : (
          <div
            className="aspect-square w-full rounded-md border border-zinc-200 dark:border-zinc-800"
            style={{ backgroundColor: item.colorHex ?? undefined }}
          />
        )}
        <span className="truncate text-xs text-zinc-700 dark:text-zinc-300">{item.label}</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      {item.product?.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={item.product.imageUrl}
          alt={item.product.name}
          className="w-full rounded-md border border-zinc-200 object-cover dark:border-zinc-800"
          draggable={false}
        />
      ) : (
        <div className="aspect-square w-full rounded-md border border-zinc-200 dark:border-zinc-800" />
      )}
      <span className="truncate text-xs text-zinc-700 dark:text-zinc-300">{item.product?.name}</span>
    </div>
  );
}
