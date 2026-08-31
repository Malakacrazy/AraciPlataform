// Bloqueador 15 da auditoria: nenhuma validação de configuração
// acontecia no boot -- variável faltando só aparecia depois, como
// comportamento errado silencioso (ex.: WEB_URL/API_URL caindo pra
// localhost sem avisar ninguém). register() é o hook oficial do Next.js
// (instrumentation.ts) chamado uma vez quando o servidor sobe, antes de
// qualquer request -- é também onde o SDK do Sentry deve ser
// inicializado quando SENTRY_DSN estiver configurado (ver
// sentry.server.config.ts). A validação de verdade (validateEnv, com
// process.exit) vive num módulo separado e só é importada aqui dentro do
// branch nodejs -- ver validate-env.ts pro porquê.
export async function register() {
  // Edge runtime: só inicializa o Sentry (config própria, nunca teria
  // acesso às variáveis de servidor validadas abaixo mesmo).
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('../sentry.edge.config');
    return;
  }
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  await import('../sentry.server.config');
  const { validateEnv } = await import('./validate-env');
  validateEnv();
}
