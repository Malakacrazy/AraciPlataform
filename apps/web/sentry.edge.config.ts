// Mesma coisa que sentry.server.config.ts, só que carregado pelo
// runtime Edge (middleware, rotas com `runtime: "edge"`) -- este
// projeto não usa Edge hoje, mas o Next carrega este arquivo de
// qualquer forma quando o runtime existe; sem ele, esses caminhos
// ficariam sem captura nenhuma se um dia passarem a existir.
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV ?? "development",
  tracesSampleRate: 0.1,
});
