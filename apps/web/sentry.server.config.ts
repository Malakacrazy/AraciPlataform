// Bloqueador 09 da auditoria -- carregado por src/instrumentation.ts
// quando NEXT_RUNTIME === "nodejs". Sem SENTRY_DSN, é um no-op (dsn
// undefined não erra, só não manda nada a lugar nenhum) -- dev local
// continua idêntico a antes até alguém configurar um DSN de verdade.
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV ?? "development",
  tracesSampleRate: 0.1,
});
