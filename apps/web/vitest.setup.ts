// @excalidraw/excalidraw toca HTMLCanvasElement.getContext já na
// importação do módulo (Popover.tsx, medição de texto/layout) -- jsdom
// não implementa Canvas 2D de verdade (exigiria o pacote nativo `canvas`,
// que precisa de libs C compiladas). jest-canvas-mock é JS puro, só
// substitui o prototype com um contexto falso o bastante pra código que
// só MEDE/desenha sem depender do pixel resultante (que é exatamente o
// uso deste projeto: restoreElements/reconcileElements são lógica pura,
// nunca leem canvas de volta). vitest-canvas-mock exige Vitest 3+; esta
// lib usa jest.fn() internamente, então só precisa de um alias global
// pro equivalente do Vitest antes de importá-la.
import { vi } from "vitest";

// import estático seria IÇADO acima da linha abaixo (hoisting de ESM) --
// dynamic import garante que o global já existe quando jest-canvas-mock
// roda seu próprio código de topo de módulo.
// @ts-expect-error -- shim mínimo só pro jest-canvas-mock encontrar jest.fn()
globalThis.jest = vi;
await import("jest-canvas-mock");
