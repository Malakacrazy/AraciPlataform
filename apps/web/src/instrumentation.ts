// Bloqueador 15 da auditoria: nenhuma validação de configuração
// acontecia no boot -- variável faltando só aparecia depois, como
// comportamento errado silencioso (ex.: WEB_URL/API_URL caindo pra
// localhost sem avisar ninguém). register() é o hook oficial do Next.js
// (instrumentation.ts) chamado uma vez quando o servidor sobe, antes de
// qualquer request -- é também onde o SDK do Sentry deve ser
// inicializado quando SENTRY_DSN estiver configurado (ver
// sentry.server.config.ts).
const REQUIRED_ENV = ['NEXTAUTH_SECRET', 'API_URL', 'INTERNAL_API_SECRET'];
// SUPABASE_JWT_SECRET: sem ele o canal do quadro não sincroniza ao vivo
// (degrada, não quebra -- ver lib/supabaseBoardToken.ts). Fica em
// "recomendado" e não em "obrigatório" por isso, mas avisar no boot evita
// o modo de falha chato: quadro que "não atualiza pro outro" sem nenhuma
// pista do motivo.
const RECOMMENDED_ENV = ['GOOGLE_CLIENT_ID', 'ALLOWED_EMAIL_DOMAINS', 'SUPABASE_JWT_SECRET'];

export async function register() {
  // Edge runtime: só inicializa o Sentry (config própria, nunca teria
  // acesso às variáveis de servidor validadas abaixo mesmo).
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('../sentry.edge.config');
    return;
  }
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  await import('../sentry.server.config');

  const missingRequired = REQUIRED_ENV.filter((name) => !process.env[name]);
  if (missingRequired.length > 0) {
    console.error(
      `Configuração obrigatória ausente: ${missingRequired.join(', ')} — funcionalidades essenciais (login, chamadas à API) vão falhar.`,
    );
  }

  const missingRecommended = RECOMMENDED_ENV.filter((name) => !process.env[name]);
  if (missingRecommended.length > 0) {
    console.warn(
      `Configuração recomendada ausente: ${missingRecommended.join(', ')} — algumas funcionalidades vão degradar (ver .env.example).`,
    );
  }
}
