import { AsyncLocalStorage } from 'node:async_hooks';

export interface AuditActor {
  accountId?: string;
  actorType: 'user' | 'client' | 'system';
  actorId?: string;
  actorEmail?: string;
}

// Propaga "quem está fazendo esta requisição" da entrada HTTP até a
// extensão do Prisma (prisma-audit-extension.ts) sem precisar passar isso
// por parâmetro em toda cadeia de service -- AsyncLocalStorage segue
// automaticamente através de await/Promise/callback, diferente de uma
// variável de módulo comum, que vazaria entre requisições concorrentes.
//
// O objeto é criado vazio pelo middleware global (auditContextMiddleware,
// registrado em main.ts) ANTES do AuthGuard rodar -- accountId/actorId
// ainda não são conhecidos nesse ponto. Quem resolve a identidade de quem
// chama MUTA esse mesmo objeto no lugar (AuthGuard pra rotas autenticadas;
// PublicPresentationService/BillingService pros dois outros pontos de
// mutação que não passam pelo AuthGuard, ver comentário em cada um).
const storage = new AsyncLocalStorage<Partial<AuditActor>>();

export function auditContextMiddleware(_req: unknown, _res: unknown, next: () => void) {
  storage.run({}, next);
}

export function setAuditActor(actor: Partial<AuditActor>) {
  const store = storage.getStore();
  if (store) Object.assign(store, actor);
}

export function getAuditActor(): Partial<AuditActor> {
  return storage.getStore() ?? {};
}
