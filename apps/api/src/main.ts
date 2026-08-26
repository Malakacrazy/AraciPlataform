// Precisa ser o primeiro import: @araci/db lê process.env.DATABASE_URL no
// topo do módulo (não em uma função), então o .env tem que estar
// carregado antes de qualquer import que alcance @araci/db — inclusive
// via AppModule abaixo. Mesma solução que packages/db/prisma.config.ts já
// usa para o mesmo problema.
import 'dotenv/config';
import helmet from 'helmet';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { auditContextMiddleware } from './audit/audit-context';

// Este serviço nunca deve ser exposto diretamente ao navegador — apps/web
// é o único chamador, via um proxy server-to-server autenticado por um
// token interno de curta duração (ver AuthGuard). Por isso: sem CORS
// habilitado (nenhuma origem de navegador é uma chamadora legítima) e,
// idealmente, esta porta fica numa rede privada em produção, não exposta
// publicamente — ver docs/fase-0/ para a decisão completa.
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  // Precisa vir antes de qualquer guard/interceptor/controller: cria o
  // contexto (AsyncLocalStorage) que AuthGuard e os pontos @Public() que
  // mutam dado de negócio preenchem com quem está fazendo a requisição,
  // lido depois pela extensão de auditoria do Prisma (ver audit/).
  app.use(auditContextMiddleware);
  app.use(helmet());
  await app.listen(process.env.PORT ?? 3001);
}
bootstrap();
