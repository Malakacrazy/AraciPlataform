// Precisa ser o primeiro import (nesta ordem exata): carrega dotenv
// ANTES de mais nada -- @araci/db lê process.env.DATABASE_URL no topo do
// módulo (não em uma função), então o .env precisa estar carregado antes
// de qualquer import que alcance @araci/db, inclusive via AppModule
// abaixo (mesma solução que packages/db/prisma.config.ts já usa pro
// mesmo problema) -- E inicializa o Sentry (bloqueador 09 da auditoria)
// antes de @nestjs/core/AppModule serem importados, pra instrumentação
// automática conseguir interceptar o que eles importam.
import './instrument';
import helmet from 'helmet';
import { json, urlencoded } from 'express';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { auditContextMiddleware } from './audit/audit-context';
import { loadKey as loadGoogleCredentialKey } from './office/google-credential-crypto';

// Achado A58 da auditoria de 30 ago 2026: sem opção de bodyParser aqui,
// valia o default do express (100kB) -- o snapshot do tldraw (shapes +
// assets, imagem de referência vira base64 embutido) estoura isso com
// facilidade, o PATCH devolve 413, e nada no frontend tratava o erro
// (ver collaborative-board.tsx): perda silenciosa de horas de trabalho
// do quadro. MESMO número documentado em next.config.ts
// (serverActions.bodySizeLimit) -- os dois lados do corpo (apps/web
// Server Action → apps/api) precisam concordar, senão o lado mais
// apertado vira o teto de verdade sem aviso.
const SNAPSHOT_BODY_LIMIT = '5mb';

// Bloqueador 15 da auditoria: antes, nenhuma variável de ambiente era
// checada no boot -- configuração faltando só aparecia depois, como um
// erro confuso em runtime (ou, pior, um comportamento errado silencioso:
// ver o alerta da própria auditoria sobre ASAAS_ENV/WEB_URL caindo pra
// valor padrão sem avisar ninguém). Falha alto e cedo pras variáveis sem
// as quais o serviço inteiro não funciona; só avisa (não derruba o boot)
// pras que degradam uma feature específica.
const REQUIRED_ENV = ['DATABASE_URL', 'INTERNAL_API_SECRET'];
const RECOMMENDED_ENV = ['WEB_URL', 'ALLOWED_EMAIL_DOMAINS', 'GOOGLE_CREDENTIAL_ENCRYPTION_KEY'];

function validateEnv() {
  const missingRequired = REQUIRED_ENV.filter((name) => !process.env[name]);
  if (missingRequired.length > 0) {
    // eslint-disable-next-line no-console
    console.error(
      `Configuração obrigatória ausente: ${missingRequired.join(', ')} — o serviço não pode iniciar.`,
    );
    process.exit(1);
  }

  const missingRecommended = RECOMMENDED_ENV.filter((name) => !process.env[name]);
  if (missingRecommended.length > 0) {
    // eslint-disable-next-line no-console
    console.warn(
      `Configuração recomendada ausente: ${missingRecommended.join(', ')} — algumas funcionalidades vão degradar (ver .env.example).`,
    );
  }

  // Achado A13 da auditoria de 30 ago 2026: presença não bastava --
  // generateValue: true do render.yaml produzia um valor no FORMATO
  // errado (base64 em vez de hex de 32 bytes), e o erro só aparecia na
  // primeira tentativa de conectar uma credencial Google, não no boot.
  // Só valida se a variável está presente (ausência já foi avisada acima).
  if (process.env.GOOGLE_CREDENTIAL_ENCRYPTION_KEY) {
    try {
      loadGoogleCredentialKey();
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn(
        `GOOGLE_CREDENTIAL_ENCRYPTION_KEY com formato inválido: ${(error as Error).message} — toda integração Google vai falhar até corrigir.`,
      );
    }
  }
}

// Este serviço nunca deve ser exposto diretamente ao navegador — apps/web
// é o único chamador, via um proxy server-to-server autenticado por um
// token interno de curta duração (ver AuthGuard). Por isso: sem CORS
// habilitado (nenhuma origem de navegador é uma chamadora legítima) e,
// idealmente, esta porta fica numa rede privada em produção, não exposta
// publicamente — ver docs/fase-0/ para a decisão completa.
async function bootstrap() {
  validateEnv();
  // bodyParser: false + json()/urlencoded() explícitos abaixo -- é o
  // jeito documentado de trocar o limite (o parser embutido do Nest não
  // expõe uma opção de tamanho direto no create()).
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  app.use(json({ limit: SNAPSHOT_BODY_LIMIT }));
  app.use(urlencoded({ extended: true, limit: SNAPSHOT_BODY_LIMIT }));
  // Precisa vir antes de qualquer guard/interceptor/controller: cria o
  // contexto (AsyncLocalStorage) que AuthGuard e os pontos @Public() que
  // mutam dado de negócio preenchem com quem está fazendo a requisição,
  // lido depois pela extensão de auditoria do Prisma (ver audit/).
  app.use(auditContextMiddleware);
  app.use(helmet());
  await app.listen(process.env.PORT ?? 3001);
}
bootstrap();
