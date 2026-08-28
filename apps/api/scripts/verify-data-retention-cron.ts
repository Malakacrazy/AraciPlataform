// Precisa ser o primeiro import: @araci/db lê process.env.DATABASE_URL no
// carregamento do módulo (mesma ordem de apps/api/src/main.ts).
import "dotenv/config";
import { NestFactory } from "@nestjs/core";
import { prisma } from "@araci/db";
import { AppModule } from "../src/app.module";
import { DataRetentionCron } from "../src/activities/data-retention.cron";

// Mesmo raciocínio de verify-stalled-cron.ts: o cron não tem rota nenhuma
// que o dispare sob demanda de propósito (job de fundo, não ação de
// usuário) -- bootstrap direto do container de DI pra chamar o método
// real e conferir o efeito no banco. Roda via ts-node (não tsx, ver
// package.json), pelo mesmo motivo de emitDecoratorMetadata documentado
// lá.
async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const cron = app.get(DataRetentionCron);

  const account = await prisma.account.findFirst();
  if (!account) throw new Error("Nenhuma conta encontrada — rode isto contra um banco de dev já provisionado.");

  const originalRetention = account.dataRetentionMonths;

  const staleClient = await prisma.client.create({
    data: {
      accountId: account.id,
      name: "Cliente parado há muito tempo (verify-data-retention-cron)",
      createdAt: new Date(Date.now() - 400 * 24 * 60 * 60 * 1000), // ~13 meses atrás, sem nenhuma Opportunity/Project
    },
  });
  const activeClient = await prisma.client.create({
    data: {
      accountId: account.id,
      name: "Cliente com oportunidade aberta (verify-data-retention-cron)",
      createdAt: new Date(Date.now() - 400 * 24 * 60 * 60 * 1000),
    },
  });
  const openOpportunity = await prisma.opportunity.create({
    data: {
      clientId: activeClient.id,
      title: "Oportunidade ainda aberta (verify-data-retention-cron)",
      stage: "novo_lead",
      feeModel: "hora_tecnica",
    },
  });

  try {
    console.log("Rodando checkRetentionCandidates() SEM política configurada (dataRetentionMonths null)...");
    await prisma.account.update({ where: { id: account.id }, data: { dataRetentionMonths: null } });
    await cron.checkRetentionCandidates();
    const beforePolicy = await prisma.notification.findMany({
      where: { type: "data_retention_candidate", clientId: { in: [staleClient.id, activeClient.id] } },
    });
    console.log(
      beforePolicy.length === 0
        ? "  ✓ Sem política configurada, o cron não avalia ninguém (nenhuma notificação criada)"
        : `  ✗ Criou ${beforePolicy.length} notificação(ões) sem política configurada — não deveria`
    );

    console.log("Configurando dataRetentionMonths=12 e rodando de novo...");
    await prisma.account.update({ where: { id: account.id }, data: { dataRetentionMonths: 12 } });
    await cron.checkRetentionCandidates();

    const staleNotifications = await prisma.notification.findMany({
      where: { type: "data_retention_candidate", clientId: staleClient.id },
    });
    console.log(
      staleNotifications.length > 0
        ? `  ✓ Cliente parado há ~13 meses virou candidato e foi notificado (${staleNotifications.length} admin(s))`
        : "  ✗ Cliente parado não foi notificado — esperava pelo menos 1"
    );

    const activeNotifications = await prisma.notification.findMany({
      where: { type: "data_retention_candidate", clientId: activeClient.id },
    });
    console.log(
      activeNotifications.length === 0
        ? "  ✓ Cliente com oportunidade ainda aberta NUNCA vira candidato, mesmo com createdAt antigo"
        : "  ✗ Cliente com oportunidade aberta foi notificado — não deveria"
    );

    console.log("Rodando checkRetentionCandidates() de novo (mesmo estado, nada novo)...");
    await cron.checkRetentionCandidates();
    const staleNotificationsAfterSecond = await prisma.notification.findMany({
      where: { type: "data_retention_candidate", clientId: staleClient.id },
    });
    console.log(
      staleNotificationsAfterSecond.length === staleNotifications.length
        ? "  ✓ Não duplicou notificação na 2ª execução (idempotente, mesmo critério do StalledOpportunitiesCron)"
        : `  ✗ Duplicou — tinha ${staleNotifications.length}, agora tem ${staleNotificationsAfterSecond.length}`
    );
  } finally {
    await prisma.notification.deleteMany({ where: { clientId: { in: [staleClient.id, activeClient.id] } } });
    await prisma.opportunity.delete({ where: { id: openOpportunity.id } });
    await prisma.client.delete({ where: { id: staleClient.id } });
    await prisma.client.delete({ where: { id: activeClient.id } });
    await prisma.account.update({ where: { id: account.id }, data: { dataRetentionMonths: originalRetention } });
    await app.close();
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
