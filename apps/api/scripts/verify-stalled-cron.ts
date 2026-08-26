// Precisa ser o primeiro import: @araci/db lê process.env.DATABASE_URL no
// carregamento do módulo (mesma ordem de apps/api/src/main.ts).
import "dotenv/config";
import { NestFactory } from "@nestjs/core";
import { prisma } from "@araci/db";
import { AppModule } from "../src/app.module";
import { StalledOpportunitiesCron } from "../src/activities/stalled-opportunities.cron";

// Diferente de smoke-test.ts (bate na API real por HTTP), o cron não tem
// nenhuma rota que o dispare sob demanda de propósito -- é um job de
// fundo, não uma ação de usuário. Bootstrap direto do container de DI
// (sem abrir a porta HTTP) pra chamar o método real e conferir o efeito
// no banco, em vez de reimplementar a lógica de "está parada?" aqui só
// pra testar.
//
// Roda via ts-node (não tsx, ver package.json), diferente de todo o
// resto de scripts/ -- achado real: a injeção de dependência do Nest
// depende de metadata de decorator (emitDecoratorMetadata) que o
// transform do esbuild usado pelo tsx não emite direito; sob tsx, o
// construtor de StalledOpportunitiesCron recebia todos os parâmetros
// como undefined, sem erro nenhum na inicialização (só estourava depois,
// tentando usar this.opportunitiesService). ts-node usa o compilador de
// TypeScript de verdade, que respeita o emitDecoratorMetadata do
// tsconfig.json deste projeto.
async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const cron = app.get(StalledOpportunitiesCron);

  const account = await prisma.account.findFirst();
  if (!account) throw new Error("Nenhuma conta encontrada — rode isto contra um banco de dev já provisionado.");

  const client = await prisma.client.create({
    data: { accountId: account.id, name: "Cliente parado (verify-stalled-cron)" },
  });
  const twentyDaysAgo = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000);
  const opportunity = await prisma.opportunity.create({
    data: {
      clientId: client.id,
      title: "Oportunidade parada (verify-stalled-cron)",
      stage: "novo_lead",
      feeModel: "hora_tecnica",
      createdAt: twentyDaysAgo,
    },
  });

  try {
    console.log("Rodando checkStalledOpportunities() pela 1ª vez (oportunidade criada há 20 dias, sem Activity)...");
    await cron.checkStalledOpportunities();

    const afterFirst = await prisma.notification.findMany({
      where: { opportunityId: opportunity.id, type: "stalled_opportunity" },
    });
    console.log(
      afterFirst.length > 0
        ? `  ✓ Notificação criada (${afterFirst.length} admin(s) avisado(s))`
        : "  ✗ Nenhuma notificação criada — esperava pelo menos 1"
    );

    console.log("Rodando checkStalledOpportunities() de novo (mesma oportunidade, nenhuma Activity nova)...");
    await cron.checkStalledOpportunities();

    const afterSecond = await prisma.notification.findMany({
      where: { opportunityId: opportunity.id, type: "stalled_opportunity" },
    });
    console.log(
      afterSecond.length === afterFirst.length
        ? "  ✓ Não duplicou notificação na 2ª execução (idempotente via hasRecentNotification)"
        : `  ✗ Duplicou — tinha ${afterFirst.length}, agora tem ${afterSecond.length}`
    );
  } finally {
    await prisma.notification.deleteMany({ where: { opportunityId: opportunity.id } });
    await prisma.opportunity.delete({ where: { id: opportunity.id } });
    await prisma.client.delete({ where: { id: client.id } });
    await app.close();
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
