// Bloqueador 09 da auditoria: zero ferramenta de rastreamento de erro em
// todo o monorepo -- um 500 de produção não deixava rastro nenhum além
// da linha de log (ver achado B-10, resolvido à parte). Este arquivo
// (não só a chamada Sentry.init) precisa ser o PRIMEIRO import de
// main.ts, antes de @nestjs/core/AppModule/etc -- é assim que a
// instrumentação automática do Sentry consegue interceptar chamadas
// HTTP/Prisma antes que outros módulos as importem primeiro. dotenv
// carrega aqui dentro, antes do Sentry.init abaixo, porque
// SENTRY_DSN precisa já estar em process.env quando o init roda.
//
// Sem SENTRY_DSN configurado (nunca setado neste repo, nem em .env nem
// em .env.example -- é um segredo real, cada ambiente tem o seu), isto
// é inteiramente um no-op: Sentry.init com dsn undefined não erra, só
// não manda nada a lugar nenhum. Ou seja, dev local continua idêntico a
// antes até alguém configurar um DSN de verdade (ver render.yaml).
import 'dotenv/config';
import * as Sentry from '@sentry/nestjs';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV ?? 'development',
  tracesSampleRate: 0.1,
});
