import { Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

// Achado A9 da auditoria de 30 ago 2026 (auditoria-2026-08-30-detalhada.md):
// os @Cron do NestJS rodam por processo, sem eleição de líder -- escalar
// apps/api pra mais de uma instância faria duas réplicas que acordam no
// mesmo minuto executarem o mesmo job e duplicarem notificação (a dedupe
// hoje só lê Notification já gravada, sem lock nenhum entre ler e
// escrever). pg_try_advisory_xact_lock é global pro BANCO, não por
// conexão -- quem chega primeiro segura o lock até o fim da transação
// (aqui, até `fn` terminar); quem chega depois recebe `false` na hora e
// sai sem rodar nada, sem ficar esperando. Timeout generoso porque o
// corpo do job pode fazer chamadas de rede lentas (ex.: Drive API por
// conta, em BrokenLinkCheckCron) enquanto a transação -- e o lock --
// continuam abertos; seguro mesmo assim porque cron roda no máximo uma
// vez por dia/semana, não é caminho de alta concorrência de conexões.
export async function runWithCronLock(
  prisma: PrismaService,
  jobName: string,
  logger: Logger,
  fn: () => Promise<void>,
): Promise<void> {
  await prisma.db.$transaction(
    async (tx) => {
      const [{ locked }] = await tx.$queryRaw<{ locked: boolean }[]>`
        SELECT pg_try_advisory_xact_lock(hashtext(${jobName})) as locked
      `;
      if (!locked) {
        logger.log(`Pulado -- outra instância já está executando "${jobName}" agora.`);
        return;
      }
      await fn();
    },
    { timeout: 5 * 60 * 1000 },
  );
}
