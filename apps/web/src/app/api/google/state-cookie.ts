// Compartilhado por authorize/route.ts e callback/route.ts (achado A-04
// da auditoria) -- não pode viver dentro de um route.ts: Next.js só
// permite exports específicos (GET, POST, config...) nesses arquivos,
// qualquer outro export quebra a checagem de tipos gerada pelo App
// Router.
export const STATE_COOKIE = "google_oauth_state";
