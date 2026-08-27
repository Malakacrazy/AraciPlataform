"use client";

// print:hidden -- some junto do resto da página quando a pessoa de fato
// imprime/salva como PDF (Ctrl+P ou o botão), não aparece no PDF final.
export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="print:hidden rounded-md bg-zinc-900 px-4 py-2 text-sm text-white dark:bg-zinc-50 dark:text-zinc-900"
    >
      Imprimir / Salvar como PDF
    </button>
  );
}
