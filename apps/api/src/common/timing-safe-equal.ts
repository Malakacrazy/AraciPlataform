import { timingSafeEqual } from 'node:crypto';

// Achado "Médio" da auditoria: billing-webhook.controller.ts e
// zapsign-webhook.controller.ts comparavam o segredo do webhook com
// `!==` puro -- o tempo de execução de uma comparação de string curto-
// circuita no primeiro byte diferente, então dá pra descobrir o segredo
// byte a byte medindo latência. `timingSafeEqual` exige buffers do
// MESMO tamanho (lança RangeError se não bater) -- quando os tamanhos
// diferem, ainda rodamos uma comparação de tamanho fixo antes de
// devolver false, pra não vazar o tamanho do segredo por um early-return
// mais rápido.
export function timingSafeStringEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    timingSafeEqual(bufA, bufA);
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}
