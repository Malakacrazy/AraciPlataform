// Separado de instrumentation.ts de propósito: process.exit é uma API de
// Node.js que o bundle do Edge Runtime não suporta (Turbopack avisa --
// "A Node.js API is used... which is not supported in the Edge Runtime" --
// mesmo com o branch NEXT_RUNTIME === 'edge' retornando antes de chegar
// aqui, o bundler ainda inclui o arquivo inteiro na análise estática do
// edge). Import dinâmico só no branch nodejs de instrumentation.ts (mesmo
// padrão já usado ali pro sentry.server.config) garante que este módulo
// nunca entra no bundle do edge.
const REQUIRED_ENV = ['NEXTAUTH_SECRET', 'API_URL', 'INTERNAL_API_SECRET'];
// SUPABASE_JWT_SECRET: sem ele o canal do quadro não sincroniza ao vivo
// (degrada, não quebra -- ver lib/supabaseBoardToken.ts). Fica em
// "recomendado" e não em "obrigatório" por isso, mas avisar no boot evita
// o modo de falha chato: quadro que "não atualiza pro outro" sem nenhuma
// pista do motivo.
const RECOMMENDED_ENV = ['GOOGLE_CLIENT_ID', 'ALLOWED_EMAIL_DOMAINS', 'SUPABASE_JWT_SECRET'];

export function validateEnv() {
  // Achado da auditoria de 30 ago 2026 (Apêndice B, "Bloqueador 15"): isto
  // só logava e CONTINUAVA subindo sem NEXTAUTH_SECRET/API_URL/
  // INTERNAL_API_SECRET, então o serviço reportava saudável (healthcheck
  // verde) enquanto login e toda chamada à API real falhavam em runtime.
  // Mesmo fail-fast que apps/api/src/main.ts já tem.
  const missingRequired = REQUIRED_ENV.filter((name) => !process.env[name]);
  if (missingRequired.length > 0) {
    console.error(
      `Configuração obrigatória ausente: ${missingRequired.join(', ')} — o serviço não pode iniciar.`,
    );
    process.exit(1);
  }

  const missingRecommended = RECOMMENDED_ENV.filter((name) => !process.env[name]);
  if (missingRecommended.length > 0) {
    console.warn(
      `Configuração recomendada ausente: ${missingRecommended.join(', ')} — algumas funcionalidades vão degradar (ver .env.example).`,
    );
  }
}
