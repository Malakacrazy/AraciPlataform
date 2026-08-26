// Precisa ser o primeiro import: @araci/db lê process.env.DATABASE_URL no
// carregamento do módulo (mesma ordem de apps/api/src/main.ts).
import "dotenv/config";
import { prisma } from "@araci/db";

// Roda depois de `npm run smoke-test` -- cada execução do smoke suite cria
// residuo real no banco de dev (client/projeto descartáveis, users
// smoke-test-*, e alguns Products de nome fixo criados sem dedup, ver
// abaixo) que nenhum teste apaga sozinho. Sem isso rodando periodicamente,
// o catálogo de produtos e a lista de clientes/projetos crescem sem limite
// a cada execução (achado real: 168 produtos acumulados numa sessão,
// 154 deles duplicatas órfãs de só 3 nomes).
//
// Preserva exatamente as fixtures "keep" usadas por outras verificações
// manuais que sobrevivem entre sessões (ex.: sandbox Asaas) -- nunca apaga
// tudo que casa com o nome, só o que não é a fixture mantida.
const KEEP_PROJECT_ID = "cmt0zae5r002cbwhdel6uzrmn";
const KEEP_CLIENT_ID = "cmt0zae310023bwhd78fxjq7g";

// Nomes fixos que o smoke suite usa pra testar o fluxo de criação de
// produto (POST /v1/products) -- sem sourceUrl, então não passam pelo
// upsert-por-sourceUrl que já deduplica "Torneira Monocomando" etc. Cada
// execução cria uma linha nova com esse nome; só remove as que não estão
// referenciadas por nenhuma especificação/moodboard (a fixture mantida
// entre sessões usa esses mesmos nomes e fica presa a projetos reais).
const SMOKE_TEST_PRODUCT_NAMES = ["Luminária Pendente Latão", "Sofá Modular Nuvem", "Sofá capturado via extensão"];

async function main() {
  const projects = await prisma.project.findMany({
    where: { name: "Apto Vila Madalena", id: { not: KEEP_PROJECT_ID } },
    select: { id: true, clientId: true, opportunityId: true },
  });
  const doomedProjectIds = projects.map((p) => p.id);
  const doomedOppIds = projects.map((p) => p.opportunityId).filter((id): id is string => !!id);
  const doomedClientIds = [...new Set(projects.map((p) => p.clientId))].filter((id) => id !== KEEP_CLIENT_ID);

  const smokeUsers = await prisma.user.findMany({
    where: { email: { startsWith: "smoke-test" } },
    select: { id: true },
  });
  const doomedUserIds = smokeUsers.map((u) => u.id);

  await prisma.$transaction(async (tx) => {
    await tx.auditLog.deleteMany({});
    await tx.notification.deleteMany({
      where: { OR: [{ userId: { in: doomedUserIds } }, { projectId: { in: doomedProjectIds } }] },
    });
    await tx.clientSession.deleteMany({ where: { clientId: { in: doomedClientIds } } });
    await tx.clientMagicLink.deleteMany({ where: { clientId: { in: doomedClientIds } } });
    await tx.activity.deleteMany({
      where: { OR: [{ entityType: "PROJECT", entityId: { in: doomedProjectIds } }, { authorId: { in: doomedUserIds } }] },
    });
    await tx.productSpecification.deleteMany({ where: { area: { projectId: { in: doomedProjectIds } } } });
    await tx.area.deleteMany({ where: { projectId: { in: doomedProjectIds } } });
    await tx.moodboard.deleteMany({ where: { projectId: { in: doomedProjectIds } } });
    await tx.presentationLink.deleteMany({ where: { projectId: { in: doomedProjectIds } } });
    await tx.invoice.deleteMany({ where: { projectId: { in: doomedProjectIds } } });
    await tx.timeEntry.deleteMany({
      where: { OR: [{ projectId: { in: doomedProjectIds } }, { userId: { in: doomedUserIds } }] },
    });
    await tx.task.deleteMany({ where: { phase: { projectId: { in: doomedProjectIds } } } });
    await tx.projectPhase.deleteMany({ where: { projectId: { in: doomedProjectIds } } });
    await tx.projectMember.deleteMany({
      where: { OR: [{ projectId: { in: doomedProjectIds } }, { userId: { in: doomedUserIds } }] },
    });
    await tx.allocation.deleteMany({
      where: { OR: [{ projectId: { in: doomedProjectIds } }, { userId: { in: doomedUserIds } }] },
    });
    await tx.officeLink.deleteMany({
      where: {
        OR: [
          { entityType: "PROJECT", entityId: { in: doomedProjectIds } },
          { entityType: "CLIENT", entityId: { in: doomedClientIds } },
        ],
      },
    });
    await tx.proposalStage.deleteMany({ where: { proposal: { opportunityId: { in: doomedOppIds } } } });
    await tx.proposal.deleteMany({ where: { opportunityId: { in: doomedOppIds } } });
    await tx.project.deleteMany({ where: { id: { in: doomedProjectIds } } });
    await tx.opportunity.deleteMany({ where: { id: { in: doomedOppIds } } });
    await tx.client.deleteMany({ where: { id: { in: doomedClientIds } } });
    await tx.user.deleteMany({ where: { id: { in: doomedUserIds } } });

    // Só produtos órfãos (não usados em nenhuma especificação/moodboard) --
    // a fixture mantida entre sessões usa alguns desses mesmos nomes e
    // continua em uso pelo projeto/cliente KEEP, então nunca é apagada por
    // essa condição.
    const deletedProducts = await tx.product.deleteMany({
      where: {
        name: { in: SMOKE_TEST_PRODUCT_NAMES },
        specifications: { none: {} },
        moodboardItems: { none: {} },
      },
    });
    console.log(`  Produtos órfãos removidos: ${deletedProducts.count}`);
  });

  // Sessão/magic-link/e-mail únicos criados pelos testes do portal do
  // cliente também deixam resíduo no cliente MANTIDO (o PATCH muda o
  // e-mail dele de verdade durante o teste) -- restaura pro valor
  // original esperado pelo resto do smoke suite.
  await prisma.client.update({ where: { id: KEEP_CLIENT_ID }, data: { email: "fernanda@example.com" } });
  await prisma.clientMagicLink.deleteMany({ where: { clientId: KEEP_CLIENT_ID } });
  await prisma.clientSession.deleteMany({ where: { clientId: KEEP_CLIENT_ID } });
  await prisma.notification.deleteMany({ where: { projectId: KEEP_PROJECT_ID } });
  await prisma.auditLog.deleteMany({});

  const remainingProjects = await prisma.project.count({ where: { name: "Apto Vila Madalena" } });
  const remainingClients = await prisma.client.count({ where: { name: "Fernanda Ribeiro" } });
  const remainingUsers = await prisma.user.count({ where: { email: { startsWith: "smoke-test" } } });
  const remainingProducts = await prisma.product.count({ where: { name: { in: SMOKE_TEST_PRODUCT_NAMES } } });
  console.log({ remainingProjects, remainingClients, remainingUsers, remainingProducts });
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
