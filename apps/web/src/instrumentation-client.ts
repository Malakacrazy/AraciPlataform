// Bloqueador 09 da auditoria -- contraparte de src/instrumentation.ts
// pro navegador (convenção do Next.js 15+ pra instrumentação client-side,
// carregado automaticamente, sem import manual em lugar nenhum). Usa
// NEXT_PUBLIC_SENTRY_DSN (não SENTRY_DSN) porque precisa ser embutido no
// bundle do cliente em tempo de build, mesma razão dos outros
// NEXT_PUBLIC_* deste projeto (ver turbo.json). Sem essa variável, é um
// no-op.
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NODE_ENV ?? "development",
  tracesSampleRate: 0.1,
});
