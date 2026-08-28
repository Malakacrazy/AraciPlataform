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

// Descrições fixas usadas pelo teste de Expense (POST /v1/expenses) --
// diferente do caso dos produtos acima, não há ambiguidade nenhuma aqui
// (nenhuma fixture real usa essas descrições), então apagar por
// descrição sozinha é seguro, sem precisar checar "está em uso".
// Achado real: a despesa com projectId perde o vínculo (SET NULL, não
// cascade) quando o projeto descartável é apagado acima, e sobrevive
// pra sempre como uma "despesa geral" órfã se nada limpar por descrição.
const SMOKE_TEST_EXPENSE_DESCRIPTIONS = ["Marcenaria sob medida", "Assinatura do software de renderização"];

// Lacuna da matriz ("checklist de documentos obrigatórios") -- config da
// CONTA, não do projeto descartável: sobreviver a um crash a meio do
// teste mudaria o comportamento real do gate pra qualquer projeto futuro
// nesse estágio, não só residir sem uso como o resto daqui.
const SMOKE_TEST_REQUIRED_DOCUMENT_TYPE = "aprovacao-conceito-smoke-test";

// E-mail fixo usado pelo teste do formulário público de captação
// (POST /v1/leads) -- diferente de todo o resto do smoke suite, esse
// Client não nasce vinculado a nenhum projeto "Apto Vila Madalena", então
// precisa ser localizado à parte, por e-mail.
const SMOKE_TEST_LEAD_EMAIL = "visitante-lead@example.com";

async function main() {
  const projects = await prisma.project.findMany({
    where: { name: "Apto Vila Madalena", id: { not: KEEP_PROJECT_ID } },
    select: { id: true, clientId: true },
  });
  const doomedProjectIds = projects.map((p) => p.id);
  // findMany, não findFirst -- Client não tem unique em email, e cada
  // execução do smoke suite manda o mesmo e-mail fixo pro formulário de
  // lead. Achado real: com findFirst, só um cliente com esse e-mail era
  // limpo por execução; os acumulados de execuções anteriores ficavam
  // presos pra sempre.
  const leadClients = await prisma.client.findMany({
    where: { email: SMOKE_TEST_LEAD_EMAIL },
    select: { id: true },
  });
  // Achado real: se o smoke suite morrer no meio do run (ex.: falha de
  // rede transitória) entre criar o Client "Fernanda Ribeiro" e criar a
  // Opportunity/Project, o Client sobrevive sem nenhuma Opportunity
  // vinculada -- invisível pra derivação via projects.clientId acima.
  // Varre direto por nome + zero Opportunity, não só pelos dois caminhos
  // "normais" (projeto ou lead).
  const orphanedClients = await prisma.client.findMany({
    where: { name: "Fernanda Ribeiro", id: { not: KEEP_CLIENT_ID }, opportunities: { none: {} } },
    select: { id: true },
  });
  const doomedClientIds = [
    ...new Set([
      ...projects.map((p) => p.clientId),
      ...leadClients.map((c) => c.id),
      ...orphanedClients.map((c) => c.id),
    ]),
  ].filter((id) => id !== KEEP_CLIENT_ID);

  // Todas as Opportunity desses clientes -- não só as que viraram Project
  // via Project.opportunityId. Achado real: uma Opportunity marcada
  // 'perdido' (POST .../mark-lost) nunca gera Project, então ficava fora
  // do doomedOppIds antigo (derivado só de projects.opportunityId) e
  // sobrevivia como órfã -- travando com RESTRICT o delete do Client
  // logo abaixo (Opportunity_clientId_fkey), quebrando o cleanup inteiro
  // no meio da transação.
  const doomedOpportunities = await prisma.opportunity.findMany({
    where: { clientId: { in: doomedClientIds } },
    select: { id: true },
  });
  const doomedOppIds = doomedOpportunities.map((o) => o.id);

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
    // Defensivo, igual ao Task antes dele ter uso real -- o teste de
    // GoogleCredential já desconecta sozinho no fim (ver smoke-test.ts),
    // mas se um run crashar entre POST e DELETE, GoogleCredential.userId
    // é RESTRICT e travaria tx.user.deleteMany mais abaixo.
    await tx.googleCredential.deleteMany({ where: { userId: { in: doomedUserIds } } });
    // Mesmo espírito: o teste de tarifa calculada já remove o custo fixo
    // de teste no fim de cada run, mas se crashar no meio ficaria
    // acumulando (StudioFixedCost não é upsert por descrição como
    // RoleRate) e inflando o overhead/hora calculado nas próximas
    // execuções.
    await tx.studioFixedCost.deleteMany({ where: { description: "Custo fixo de teste (smoke-test)" } });
    await tx.clientSession.deleteMany({ where: { clientId: { in: doomedClientIds } } });
    await tx.clientMagicLink.deleteMany({ where: { clientId: { in: doomedClientIds } } });
    await tx.activity.deleteMany({
      where: { OR: [{ entityType: "PROJECT", entityId: { in: doomedProjectIds } }, { authorId: { in: doomedUserIds } }] },
    });
    await tx.productSpecification.deleteMany({ where: { area: { projectId: { in: doomedProjectIds } } } });
    await tx.area.deleteMany({ where: { projectId: { in: doomedProjectIds } } });
    // WhiteboardGuestAccess.moodboardId não tem onDelete: Cascade (mesmo
    // padrão de CollaboratorProjectAccess/Allocation/Absence acima) --
    // correção "moodboard vira quadro tldraw", sem isto um run que
    // convidou alguém a um quadro descartável travaria este delete com
    // FK RESTRICT. MoodboardComment já é cascade (ver schema), não
    // precisa de limpeza explícita.
    await tx.whiteboardGuestAccess.deleteMany({ where: { moodboard: { projectId: { in: doomedProjectIds } } } });
    await tx.moodboard.deleteMany({ where: { projectId: { in: doomedProjectIds } } });
    await tx.presentationLink.deleteMany({ where: { projectId: { in: doomedProjectIds } } });
    // InvoiceLine → Invoice é RESTRICT (mesma convenção de ProposalStage →
    // Proposal, sem cascade declarado) -- sem apagar as linhas primeiro,
    // tx.invoice.deleteMany falha com P2003 pra toda fatura hora_tecnica
    // calculada automaticamente (ver InvoicesService.createHourlyInvoice).
    await tx.invoiceLine.deleteMany({ where: { invoice: { projectId: { in: doomedProjectIds } } } });
    await tx.invoice.deleteMany({ where: { projectId: { in: doomedProjectIds } } });
    await tx.expense.deleteMany({
      where: { OR: [{ projectId: { in: doomedProjectIds } }, { description: { in: SMOKE_TEST_EXPENSE_DESCRIPTIONS } }] },
    });
    await tx.requiredDocumentType.deleteMany({ where: { documentType: SMOKE_TEST_REQUIRED_DOCUMENT_TYPE } });
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
    // Absence.userId não tem onDelete: Cascade (mesmo padrão de
    // Allocation acima) -- sem isto, um run que crashar antes de limpar
    // suas próprias ausências travaria tx.user.deleteMany mais abaixo
    // com FK RESTRICT.
    await tx.absence.deleteMany({ where: { userId: { in: doomedUserIds } } });
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
    // CollaboratorProjectAccess.projectId não tem onDelete: Cascade (mesmo
    // padrão de Allocation/Absence acima) -- lacuna da matriz ("consultores
    // externos"), sem isto um run que crashar entre convidar e revogar
    // travaria este delete com FK RESTRICT.
    await tx.collaboratorProjectAccess.deleteMany({ where: { projectId: { in: doomedProjectIds } } });
    await tx.project.deleteMany({ where: { id: { in: doomedProjectIds } } });
    await tx.opportunity.deleteMany({ where: { id: { in: doomedOppIds } } });
    await tx.client.deleteMany({ where: { id: { in: doomedClientIds } } });
    await tx.user.deleteMany({ where: { id: { in: doomedUserIds } } });

    // Só produtos órfãos (não usados em nenhuma especificação) -- a
    // fixture mantida entre sessões usa alguns desses mesmos nomes e
    // continua em uso pelo projeto/cliente KEEP, então nunca é apagada por
    // essa condição. Não checa mais moodboard nenhum: correção "moodboard
    // vira quadro tldraw" tirou a referência a Product de dentro do
    // Moodboard (era MoodboardItem.productId, model que não existe mais).
    const deletedProducts = await tx.product.deleteMany({
      where: {
        name: { in: SMOKE_TEST_PRODUCT_NAMES },
        specifications: { none: {} },
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
  const remainingExpenses = await prisma.expense.count({
    where: { description: { in: SMOKE_TEST_EXPENSE_DESCRIPTIONS } },
  });
  const remainingLeadClients = await prisma.client.count({ where: { email: SMOKE_TEST_LEAD_EMAIL } });
  const remainingRequiredDocumentTypes = await prisma.requiredDocumentType.count({
    where: { documentType: SMOKE_TEST_REQUIRED_DOCUMENT_TYPE },
  });
  console.log({
    remainingProjects,
    remainingClients,
    remainingUsers,
    remainingProducts,
    remainingExpenses,
    remainingLeadClients,
    remainingRequiredDocumentTypes,
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
