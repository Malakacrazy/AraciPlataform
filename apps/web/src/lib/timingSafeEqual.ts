import { timingSafeEqual } from "node:crypto";

// Contraparte de apps/api/src/common/timing-safe-equal.ts (mesma lógica,
// duplicada porque os dois apps não compartilham código de runtime) --
// achado de revisão de segurança: os dois callbacks de OAuth comparavam
// o `state` com `!==` puro enquanto os webhooks do apps/api já usavam
// comparação de tempo constante. O risco prático aqui é bem menor que no
// webhook (o atacante não consegue ler nem iterar contra o cookie da
// vítima), mas padronizar sai mais barato que manter duas convenções e
// ter que lembrar qual vale onde.
export function timingSafeStringEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    // timingSafeEqual lança RangeError com tamanhos diferentes -- compara
    // A com ele mesmo só pra gastar o mesmo tempo antes do false, sem
    // vazar o tamanho esperado por um early-return mais rápido.
    timingSafeEqual(bufA, bufA);
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}
