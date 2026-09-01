import { prisma } from "@araci/db";
import type { ApiFn, ReportFn } from "./types";

// Extraído de smoke-test.ts (revisão de qualidade de código) -- seção
// "Tarefas". Mesmo caso do cabeçalho de
// proposal-versioning-and-lifecycle.ts: o nome original só cobria o
// início (Task model existia sem controller/service/tela, achado de
// dead code) -- o resto acumulado aqui sem seção própria é chaves de
// API por extensão, membros/alocações/ausências de projeto, produtos e
// variantes de FF&E, checkout do carrinho e o quadro tldraw (moodboard)
// com colaboração ao vivo via convidado autenticado por Logto. Devolve
// product1Id/spec1Id porque smoke-test/presentation-link.ts (já
// extraído) precisa desses dois fixtures pra testar o link público.
export async function runTasksAndProjectResourcesChecks({
  api,
  api2,
  report,
  baseUrl,
  projectId,
  firstPhase,
  secondPhase,
  user2,
}: {
  api: ApiFn;
  api2: ApiFn;
  report: ReportFn;
  baseUrl: string;
  projectId: string;
  firstPhase: { id: string };
  secondPhase: { id: string };
  user2: { id: string };
}) {
  // --- Tarefas (Task model existia sem controller/service/tela --------
  // achado da auditoria: "dead code") -------------------------------
  const taskBadAssigneeRes = await api(`/v1/projects/${projectId}/phases/${firstPhase.id}/tasks`, {
    method: "POST",
    body: JSON.stringify({ title: "x", assigneeId: "nonexistent-id" }),
  });
  report(
    "POST .../tasks com assigneeId inexistente → 404",
    taskBadAssigneeRes.status === 404,
    taskBadAssigneeRes.body
  );

  const task1Res = await api(`/v1/projects/${projectId}/phases/${firstPhase.id}/tasks`, {
    method: "POST",
    body: JSON.stringify({ title: "Aprovar paleta de cores", assigneeId: user2.id }),
  });
  report(
    "POST .../phases/:phaseId/tasks → 201, nasce 'a_fazer' com assignee de verdade",
    task1Res.status === 201 && task1Res.body?.data?.status === "a_fazer" && task1Res.body?.data?.assignee?.id === user2.id,
    task1Res.body
  );
  const task1Id = task1Res.body?.data?.id;

  const taskBadDependsOnRes = await api(`/v1/projects/${projectId}/phases/${secondPhase.id}/tasks`, {
    method: "POST",
    body: JSON.stringify({ title: "x", dependsOnIds: ["nonexistent-id"] }),
  });
  report(
    "POST .../tasks com dependsOnIds apontando pra tarefa inexistente → 404",
    taskBadDependsOnRes.status === 404,
    taskBadDependsOnRes.body
  );

  const task2Res = await api(`/v1/projects/${projectId}/phases/${secondPhase.id}/tasks`, {
    method: "POST",
    body: JSON.stringify({ title: "Encomendar tecido", dependsOnIds: [task1Id] }),
  });
  report(
    "POST .../tasks com dependsOnIds válido (fase diferente da tarefa-alvo) → 201",
    task2Res.status === 201 && task2Res.body?.data?.dependsOn?.[0]?.id === task1Id,
    task2Res.body
  );
  const task2Id = task2Res.body?.data?.id;

  const cycleRes = await api(`/v1/tasks/${task1Id}`, {
    method: "PATCH",
    body: JSON.stringify({ dependsOnIds: [task2Id] }),
  });
  report(
    "Fazer task1 depender de task2 (que já depende de task1) → 422 TASK_DEPENDENCY_CYCLE",
    cycleRes.status === 422 && cycleRes.body?.error?.code === "TASK_DEPENDENCY_CYCLE",
    cycleRes.body
  );

  const blockedRes = await api(`/v1/tasks/${task2Id}/status`, {
    method: "POST",
    body: JSON.stringify({ status: "concluida" }),
  });
  report(
    "Concluir task2 antes de task1 (dependência) → 422 TASK_BLOCKED",
    blockedRes.status === 422 && blockedRes.body?.error?.code === "TASK_BLOCKED",
    blockedRes.body
  );

  const completeTask1Res = await api(`/v1/tasks/${task1Id}/status`, {
    method: "POST",
    body: JSON.stringify({ status: "concluida" }),
  });
  report(
    "Concluir task1 (sem dependências pendentes) → 200, completedAt setado",
    completeTask1Res.status === 200 &&
      completeTask1Res.body?.data?.status === "concluida" &&
      !!completeTask1Res.body?.data?.completedAt,
    completeTask1Res.body
  );

  const unblockedRes = await api(`/v1/tasks/${task2Id}/status`, {
    method: "POST",
    body: JSON.stringify({ status: "concluida" }),
  });
  report(
    "Com task1 concluída, concluir task2 agora funciona → 200",
    unblockedRes.status === 200 && unblockedRes.body?.data?.status === "concluida",
    unblockedRes.body
  );

  const listTasksRes = await api(`/v1/projects/${projectId}/tasks`);
  report(
    "GET /projects/:id/tasks → inclui as duas tarefas, ordenadas por fase",
    listTasksRes.status === 200 &&
      listTasksRes.body?.data?.length === 2 &&
      listTasksRes.body.data[0].id === task1Id &&
      listTasksRes.body.data[1].id === task2Id,
    listTasksRes.body
  );

  const deleteTaskRes = await api(`/v1/tasks/${task2Id}`, { method: "DELETE" });
  report("DELETE /tasks/:id → 204", deleteTaskRes.status === 204, deleteTaskRes.body);

  const listAfterDeleteTaskRes = await api(`/v1/projects/${projectId}/tasks`);
  report(
    "Após remover task2, só task1 aparece na listagem",
    listAfterDeleteTaskRes.body?.data?.length === 1 && listAfterDeleteTaskRes.body?.data?.[0]?.id === task1Id,
    listAfterDeleteTaskRes.body
  );

  const userPatchRes = await api(`/v1/users/${user2.id}`, {
    method: "PATCH",
    body: JSON.stringify({ role: "Arquiteto Pleno", specialty: "FF&E", costPerHour: 45 }),
  });
  report(
    "PATCH /users/:id atualiza papel/especialidade/custo-hora",
    userPatchRes.status === 200 && userPatchRes.body?.data?.role === "Arquiteto Pleno",
    userPatchRes.body
  );

  // Extensão Captura autentica com X-Api-Key em vez do Bearer interno —
  // ver AuthGuard. Testado contra a API real (não mockado) porque o
  // caminho inteiro (gerar → hash → bater no header → resolver
  // accountId/userId) só existe de fato batendo no banco.
  const noKeyYetRes = await api(`/v1/products`, {
    headers: { "X-Api-Key": "chave-inexistente" },
  });
  report(
    "GET /products com X-Api-Key inválida → 401, mesmo com Bearer válido também presente",
    noKeyYetRes.status === 401,
    noKeyYetRes.body
  );

  // Sem :id na rota (achado C-02 corrigido) -- cada colaborador só gera a
  // PRÓPRIA chave, então geramos com o token do próprio user2 (api2), não
  // com o do admin (api) que só está deste script pra montar o fixture.
  const generateKeyRes = await api2(`/v1/users/api-key`, { method: "POST" });
  const apiKey = generateKeyRes.body?.data?.apiKey;
  report(
    "POST /users/api-key → 201, devolve a chave em texto puro pro dono do token",
    generateKeyRes.status === 201 && typeof apiKey === "string" && apiKey.startsWith("araci_"),
    generateKeyRes.body
  );

  // A rota não existe mais (nenhum handler POST de 3 segmentos sob
  // /v1/users), então o Nest devolve "rota não encontrada" -- não checa
  // um status exato aqui porque esse caminho (rota nunca registrada) cai
  // num bug pré-existente do HttpExceptionFilter que devolve 500 em vez
  // de 404 pra NotFoundException do próprio framework (fora do escopo
  // desta correção). O que importa pro achado C-02 é o invariante: essa
  // URL nunca mais devolve uma chave de API de outra pessoa.
  const escalationRes = await api(`/v1/users/${user2.id}/api-key`, { method: "POST" });
  report(
    "Rota antiga POST /users/:id/api-key não gera mais chave nenhuma (achado C-02: era assim que qualquer staff virava admin)",
    escalationRes.status !== 201 && !escalationRes.body?.data?.apiKey,
    escalationRes.body
  );

  const productViaApiKeyRes = await api(`/v1/products`, {
    method: "POST",
    headers: { "X-Api-Key": apiKey },
    body: JSON.stringify({ name: "Sofá capturado via extensão", price: 4200 }),
  });
  report(
    "POST /products autenticado só com X-Api-Key → 201",
    productViaApiKeyRes.status === 201,
    productViaApiKeyRes.body
  );

  const regenerateKeyRes = await api2(`/v1/users/api-key`, { method: "POST" });
  const newApiKey = regenerateKeyRes.body?.data?.apiKey;
  const oldKeyAfterRegenRes = await api(`/v1/products`, { headers: { "X-Api-Key": apiKey } });
  report(
    "Regenerar a chave invalida a anterior → 401 com a chave antiga",
    regenerateKeyRes.status === 201 && newApiKey !== apiKey && oldKeyAfterRegenRes.status === 401,
    { regenerateKeyRes: regenerateKeyRes.body, oldKeyAfterRegenRes: oldKeyAfterRegenRes.body }
  );

  const revokeKeyRes = await api2(`/v1/users/api-key`, { method: "DELETE" });
  const afterRevokeRes = await api(`/v1/products`, { headers: { "X-Api-Key": newApiKey } });
  report(
    "DELETE /users/api-key → 204, e a chave revogada para de autenticar",
    revokeKeyRes.status === 204 && afterRevokeRes.status === 401,
    { revokeKeyRes: revokeKeyRes.body, afterRevokeRes: afterRevokeRes.body }
  );

  const addMemberRes = await api(`/v1/projects/${projectId}/members`, {
    method: "POST",
    body: JSON.stringify({ userId: user2.id, roleOnProject: "Especificação FF&E" }),
  });
  report("POST /projects/:id/members → 201", addMemberRes.status === 201, addMemberRes.body);

  const addMemberAgainRes = await api(`/v1/projects/${projectId}/members`, {
    method: "POST",
    body: JSON.stringify({ userId: user2.id }),
  });
  report(
    "Adicionar o mesmo membro de novo → 409 ALREADY_MEMBER",
    addMemberAgainRes.status === 409 && addMemberAgainRes.body?.error?.code === "ALREADY_MEMBER",
    addMemberAgainRes.body
  );

  const listMembersRes = await api(`/v1/projects/${projectId}/members`);
  report(
    "GET /projects/:id/members inclui o novo membro",
    listMembersRes.status === 200 && listMembersRes.body?.data?.some((m: any) => m.userId === user2.id),
    listMembersRes.body
  );

  const removeMemberRes = await api(`/v1/projects/${projectId}/members/${user2.id}`, { method: "DELETE" });
  report("DELETE /projects/:id/members/:userId → 204", removeMemberRes.status === 204, removeMemberRes.body);

  const listMembersAfterRemoveRes = await api(`/v1/projects/${projectId}/members`);
  report(
    "Após remover, GET /projects/:id/members não inclui mais o membro",
    listMembersAfterRemoveRes.status === 200 && !listMembersAfterRemoveRes.body?.data?.some((m: any) => m.userId === user2.id),
    listMembersAfterRemoveRes.body
  );

  const capacityDefaultRes = await api(`/v1/users/${user2.id}`);
  report(
    "weeklyCapacityHours vem com default 40 (não precisa setar em cada usuário)",
    Number(capacityDefaultRes.body?.data?.weeklyCapacityHours) === 40,
    capacityDefaultRes.body
  );

  const createAllocationRes = await api("/v1/allocations", {
    method: "POST",
    body: JSON.stringify({
      userId: user2.id,
      projectId,
      hoursPerWeek: 20,
      startDate: "2026-09-01T00:00:00.000Z",
      endDate: "2026-09-30T00:00:00.000Z",
    }),
  });
  report(
    "POST /allocations → 201, inclui user e project (com phases e client)",
    createAllocationRes.status === 201 &&
      createAllocationRes.body?.data?.user?.id === user2.id &&
      Array.isArray(createAllocationRes.body?.data?.project?.phases),
    createAllocationRes.body
  );
  const allocationId = createAllocationRes.body?.data?.id;

  const badRangeRes = await api("/v1/allocations", {
    method: "POST",
    body: JSON.stringify({
      userId: user2.id,
      projectId,
      hoursPerWeek: 10,
      startDate: "2026-09-30T00:00:00.000Z",
      endDate: "2026-09-01T00:00:00.000Z",
    }),
  });
  report(
    "POST /allocations com data de término antes do início → 400 VALIDATION_ERROR",
    badRangeRes.status === 400 && badRangeRes.body?.error?.code === "VALIDATION_ERROR",
    badRangeRes.body
  );

  const allocationBadProjectRes = await api("/v1/allocations", {
    method: "POST",
    body: JSON.stringify({
      userId: user2.id,
      projectId: "does-not-exist",
      hoursPerWeek: 10,
      startDate: "2026-09-01T00:00:00.000Z",
      endDate: "2026-09-30T00:00:00.000Z",
    }),
  });
  report("POST /allocations em projeto inexistente → 404", allocationBadProjectRes.status === 404, allocationBadProjectRes.body);

  const listAllocationsRes = await api(`/v1/allocations?userId=${user2.id}`);
  report(
    "GET /allocations?userId= inclui a alocação recém-criada",
    listAllocationsRes.status === 200 && listAllocationsRes.body?.data?.some((a: any) => a.id === allocationId),
    listAllocationsRes.body
  );

  const deleteAllocationRes = await api(`/v1/allocations/${allocationId}`, { method: "DELETE" });
  report("DELETE /allocations/:id → 204", deleteAllocationRes.status === 204, deleteAllocationRes.body);

  const listAllocationsAfterDeleteRes = await api(`/v1/allocations?userId=${user2.id}`);
  report(
    "Após remover, GET /allocations não inclui mais a alocação",
    listAllocationsAfterDeleteRes.status === 200 && !listAllocationsAfterDeleteRes.body?.data?.some((a: any) => a.id === allocationId),
    listAllocationsAfterDeleteRes.body
  );

  // Lacuna da matriz ("calendário de férias/ausências") -- mesmo padrão
  // de teste de Allocation acima.
  const createAbsenceRes = await api("/v1/absences", {
    method: "POST",
    body: JSON.stringify({
      userId: user2.id,
      type: "ferias",
      startDate: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString(),
      endDate: new Date(Date.now() + 20 * 24 * 60 * 60 * 1000).toISOString(),
    }),
  });
  report(
    "POST /absences → 201, inclui user",
    createAbsenceRes.status === 201 && createAbsenceRes.body?.data?.user?.id === user2.id,
    createAbsenceRes.body
  );
  const absenceId = createAbsenceRes.body?.data?.id;

  const badAbsenceRangeRes = await api("/v1/absences", {
    method: "POST",
    body: JSON.stringify({
      userId: user2.id,
      startDate: new Date().toISOString(),
      endDate: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    }),
  });
  report(
    "POST /absences com data de término antes do início → 400 VALIDATION_ERROR",
    badAbsenceRangeRes.status === 400 && badAbsenceRangeRes.body?.error?.code === "VALIDATION_ERROR",
    badAbsenceRangeRes.body
  );

  const listAbsencesRes = await api(`/v1/absences?userId=${user2.id}`);
  report(
    "GET /absences?userId= inclui a ausência recém-criada, com type default 'ferias' preservado",
    listAbsencesRes.status === 200 &&
      listAbsencesRes.body?.data?.some((a: any) => a.id === absenceId && a.type === "ferias"),
    listAbsencesRes.body
  );

  const deleteAbsenceRes = await api(`/v1/absences/${absenceId}`, { method: "DELETE" });
  report("DELETE /absences/:id → 204", deleteAbsenceRes.status === 204, deleteAbsenceRes.body);

  const listAbsencesAfterDeleteRes = await api(`/v1/absences?userId=${user2.id}`);
  report(
    "Após remover, GET /absences não inclui mais a ausência",
    listAbsencesAfterDeleteRes.status === 200 &&
      !listAbsencesAfterDeleteRes.body?.data?.some((a: any) => a.id === absenceId),
    listAbsencesAfterDeleteRes.body
  );

  // Achado da auditoria: ausência precisa entrar na mesma máquina que
  // alimenta /v1/bi/capacidade -- uma ausência ATIVA agora (não a de
  // daqui a 10 dias criada acima) precisa aparecer como
  // sobrecarregado=true se a pessoa ainda tem horas alocadas nesta
  // semana, senão o dashboard de capacidade continua "ok" com alguém de
  // férias alocado.
  const activeAbsenceRes = await api("/v1/absences", {
    method: "POST",
    body: JSON.stringify({
      userId: user2.id,
      startDate: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
      endDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    }),
  });
  const activeAllocationRes = await api("/v1/allocations", {
    method: "POST",
    body: JSON.stringify({
      userId: user2.id,
      projectId,
      hoursPerWeek: 5,
      startDate: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
      endDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    }),
  });
  const capacidadeComFeriasRes = await api("/v1/bi/capacidade");
  const user2Capacidade = capacidadeComFeriasRes.body?.data?.porPessoa?.find((p: any) => p.userId === user2.id);
  report(
    "GET /bi/capacidade → emFeriasAgora=true e sobrecarregado=true pra quem está de férias mas ainda alocado",
    user2Capacidade?.emFeriasAgora === true && user2Capacidade?.sobrecarregado === true,
    user2Capacidade
  );
  await api(`/v1/absences/${activeAbsenceRes.body?.data?.id}`, { method: "DELETE" });
  await api(`/v1/allocations/${activeAllocationRes.body?.data?.id}`, { method: "DELETE" });

  const product1Res = await api("/v1/products", {
    method: "POST",
    body: JSON.stringify({
      name: "Sofá Modular Nuvem",
      supplier: "Móveis Bertolucci",
      price: 8200,
      category: "mobiliario",
    }),
  });
  report("POST /products → 201", product1Res.status === 201, product1Res.body);
  const product1Id = product1Res.body?.data?.id;

  // Variantes: mesmo Product, variantOfId aponta pro "pai" -- ver
  // ProductsService.validateVariantOf. Testa a cadeia de regras antes do
  // caminho feliz: variantLabel obrigatório, pai inexistente, depois
  // sucesso, depois os dois jeitos de tentar aninhar dois níveis.
  const variantSemLabelRes = await api("/v1/products", {
    method: "POST",
    body: JSON.stringify({ name: "Sofá Modular Nuvem", variantOfId: product1Id }),
  });
  report(
    "POST /products com variantOfId sem variantLabel → 422 INVALID_VARIANT",
    variantSemLabelRes.status === 422 && variantSemLabelRes.body?.error?.code === "INVALID_VARIANT",
    variantSemLabelRes.body
  );

  const variantPaiInexistenteRes = await api("/v1/products", {
    method: "POST",
    body: JSON.stringify({ name: "Sofá Modular Nuvem", variantOfId: "id-que-nao-existe", variantLabel: "Nogueira" }),
  });
  report(
    "POST /products com variantOfId inexistente → 404",
    variantPaiInexistenteRes.status === 404,
    variantPaiInexistenteRes.body
  );

  const variantRes = await api("/v1/products", {
    method: "POST",
    body: JSON.stringify({
      name: "Sofá Modular Nuvem",
      price: 8600,
      category: "mobiliario",
      variantOfId: product1Id,
      variantLabel: "Nogueira",
    }),
  });
  report("POST /products (variante) → 201", variantRes.status === 201, variantRes.body);
  const variantId = variantRes.body?.data?.id;

  const subVarianteRes = await api("/v1/products", {
    method: "POST",
    body: JSON.stringify({ name: "x", variantOfId: variantId, variantLabel: "y" }),
  });
  report(
    "Variante de uma variante (2 níveis) → 422 INVALID_VARIANT",
    subVarianteRes.status === 422 && subVarianteRes.body?.error?.code === "INVALID_VARIANT",
    subVarianteRes.body
  );

  const paiVirarVarianteRes = await api(`/v1/products/${product1Id}`, {
    method: "PATCH",
    body: JSON.stringify({ variantOfId: variantId, variantLabel: "z" }),
  });
  report(
    "Produto que já é pai de variante tentando virar variante → 422 INVALID_VARIANT",
    paiVirarVarianteRes.status === 422 && paiVirarVarianteRes.body?.error?.code === "INVALID_VARIANT",
    paiVirarVarianteRes.body
  );

  const autoReferenciaRes = await api(`/v1/products/${variantId}`, {
    method: "PATCH",
    body: JSON.stringify({ variantOfId: variantId, variantLabel: "z" }),
  });
  report(
    "Produto virando variante de si mesmo → 422 INVALID_VARIANT",
    autoReferenciaRes.status === 422 && autoReferenciaRes.body?.error?.code === "INVALID_VARIANT",
    autoReferenciaRes.body
  );

  const productPaiRes = await api(`/v1/products/${product1Id}`);
  report(
    "GET /products/:id do pai inclui a variante em .variants",
    productPaiRes.body?.data?.variants?.some((v: any) => v.id === variantId && v.variantLabel === "Nogueira"),
    productPaiRes.body
  );

  const productVarianteRes = await api(`/v1/products/${variantId}`);
  report(
    "GET /products/:id da variante inclui .variantOf apontando pro pai",
    productVarianteRes.body?.data?.variantOf?.id === product1Id,
    productVarianteRes.body
  );

  const productImageRes = await api(`/v1/products/${product1Id}/images`, {
    method: "POST",
    body: JSON.stringify({ url: "https://example.com/sofa-nuvem-2.jpg" }),
  });
  report("POST /products/:id/images → 201", productImageRes.status === 201, productImageRes.body);
  const productImageId = productImageRes.body?.data?.id;

  const productComImagemRes = await api(`/v1/products/${product1Id}`);
  report(
    "GET /products/:id traz a galeria em .images",
    productComImagemRes.body?.data?.images?.some((img: any) => img.id === productImageId),
    productComImagemRes.body
  );

  const removeImageRes = await api(`/v1/product-images/${productImageId}`, { method: "DELETE" });
  report("DELETE /product-images/:id → 204", removeImageRes.status === 204, removeImageRes.body);

  const productSemImagemRes = await api(`/v1/products/${product1Id}`);
  report(
    "Após remover, a imagem não aparece mais em .images",
    !productSemImagemRes.body?.data?.images?.some((img: any) => img.id === productImageId),
    productSemImagemRes.body
  );

  const product2Res = await api("/v1/products", {
    method: "POST",
    body: JSON.stringify({ name: "Luminária Pendente Latão", isGeneric: true }),
  });
  report(
    "POST /products (produto genérico, sem preço) → 201",
    product2Res.status === 201 && product2Res.body?.data?.isGeneric === true,
    product2Res.body
  );
  const product2Id = product2Res.body?.data?.id;

  // Captura reenvia o mesmo item toda vez que o orçamento é mandado de
  // novo — sem upsert por sourceUrl, cada reenvio duplicava o Product.
  const capturedSourceUrl = "https://www.leroymerlin.com.br/produto-verify-dedup";
  const capturedFirstRes = await api("/v1/products", {
    method: "POST",
    body: JSON.stringify({ name: "Torneira Monocomando (v1)", price: 350, sourceUrl: capturedSourceUrl }),
  });
  const capturedSecondRes = await api("/v1/products", {
    method: "POST",
    body: JSON.stringify({ name: "Torneira Monocomando (v2, preço atualizado)", price: 399, sourceUrl: capturedSourceUrl }),
  });
  report(
    "POST /products duas vezes com o mesmo sourceUrl → mesmo id, dados atualizados (não duplica)",
    capturedFirstRes.status === 201 &&
      capturedSecondRes.status === 201 &&
      capturedFirstRes.body?.data?.id === capturedSecondRes.body?.data?.id &&
      capturedSecondRes.body?.data?.name === "Torneira Monocomando (v2, preço atualizado)" &&
      Number(capturedSecondRes.body?.data?.price) === 399,
    { first: capturedFirstRes.body, second: capturedSecondRes.body }
  );
  const listAfterDedupRes = await api("/v1/products");
  report(
    "GET /products depois do reenvio tem só uma linha para o sourceUrl reenviado",
    listAfterDedupRes.body?.data?.filter((p: any) => p.sourceUrl === capturedSourceUrl).length === 1,
    listAfterDedupRes.body
  );

  const areaRes = await api(`/v1/projects/${projectId}/areas`, {
    method: "POST",
    body: JSON.stringify({ name: "Sala de Estar" }),
  });
  report("POST /projects/:id/areas → 201", areaRes.status === 201, areaRes.body);
  const areaId = areaRes.body?.data?.id;

  const listAreasRes = await api(`/v1/projects/${projectId}/areas`);
  report(
    "GET /projects/:id/areas inclui a área recém-criada",
    listAreasRes.status === 200 && listAreasRes.body?.data?.some((a: any) => a.id === areaId),
    listAreasRes.body
  );

  const spec1Res = await api(`/v1/areas/${areaId}/specifications`, {
    method: "POST",
    body: JSON.stringify({ productId: product1Id, quantity: 1, unitPrice: 8200, markupPercent: 0.1 }),
  });
  report("POST /areas/:id/specifications → 201", spec1Res.status === 201, spec1Res.body);
  const spec1Id = spec1Res.body?.data?.id;
  report(
    "Especificação traz product.category — é o que o rollup por categoria da tela de FF&E do projeto usa",
    spec1Res.body?.data?.product?.category === "mobiliario",
    spec1Res.body
  );

  const spec2Res = await api(`/v1/areas/${areaId}/specifications`, {
    method: "POST",
    body: JSON.stringify({ productId: product2Id }), // sem unitPrice — SKU genérico ainda sem preço
  });
  report("POST /areas/:id/specifications (produto genérico, sem unitPrice) → 201", spec2Res.status === 201, spec2Res.body);
  const spec2Id = spec2Res.body?.data?.id;

  const checkoutMissingPriceRes = await api(`/v1/projects/${projectId}/ffe-checkout`, {
    method: "POST",
    body: JSON.stringify({ specificationIds: [spec2Id] }),
  });
  report(
    "Checkout de item sem unitPrice → 422 MISSING_PRICE",
    checkoutMissingPriceRes.status === 422 && checkoutMissingPriceRes.body?.error?.code === "MISSING_PRICE",
    checkoutMissingPriceRes.body
  );

  const checkoutRes = await api(`/v1/projects/${projectId}/ffe-checkout`, {
    method: "POST",
    body: JSON.stringify({ specificationIds: [spec1Id] }),
  });
  report(
    "Checkout do carrinho FF&E → 201, gera Invoice (1 × 8200 × 1.10 = 9020)",
    checkoutRes.status === 201 && Math.abs(Number(checkoutRes.body?.data?.amount) - 9020) < 0.01,
    checkoutRes.body
  );
  const ffeInvoiceId = checkoutRes.body?.data?.id;

  const specsAfterCheckoutRes = await api(`/v1/areas/${areaId}/specifications`);
  const spec1AfterCheckout = specsAfterCheckoutRes.body?.data?.find((s: any) => s.id === spec1Id);
  report(
    // Achado A49 da auditoria de 30 ago 2026: checkout marcava
    // clientApproved -- passou a marcar invoicedAt, que é o sinal certo
    // de "já virou fatura" (clientApproved volta a significar só "o
    // cliente aprovou pelo link público", ver spec1 mais abaixo).
    "Fluxo automático: checkout marca a especificação como invoicedAt (achado A49)",
    !!spec1AfterCheckout?.invoicedAt,
    spec1AfterCheckout
  );

  // Achado A6 da auditoria de 30 ago 2026: repetir o checkout da MESMA
  // especificação (já faturada) faturava o mesmo mobiliário duas vezes --
  // nada além da UI impedia. Agora o updateMany condicional dentro da
  // transação barra com 422, e nenhum Invoice novo é criado.
  const invoicesAntesDoRecheckoutRes = await api(`/v1/invoices?projectId=${projectId}`);
  const totalInvoicesAntesDoRecheckout = invoicesAntesDoRecheckoutRes.body?.data?.length;
  const recheckoutRes = await api(`/v1/projects/${projectId}/ffe-checkout`, {
    method: "POST",
    body: JSON.stringify({ specificationIds: [spec1Id] }),
  });
  report(
    "Checkout de novo da MESMA especificação já aprovada → 422 SPECS_ALREADY_APPROVED, não fatura de novo (achado A6)",
    recheckoutRes.status === 422 && recheckoutRes.body?.error?.code === "SPECS_ALREADY_APPROVED",
    recheckoutRes.body
  );
  const invoicesDepoisDoRecheckoutRes = await api(`/v1/invoices?projectId=${projectId}`);
  report(
    "...e o número de faturas do projeto não mudou (nenhuma fatura duplicada foi criada)",
    invoicesDepoisDoRecheckoutRes.body?.data?.length === totalInvoicesAntesDoRecheckout,
    invoicesDepoisDoRecheckoutRes.body
  );

  const ffeInvoiceListRes = await api(`/v1/invoices?projectId=${projectId}`);
  report(
    "A fatura de FF&E aparece em GET /invoices sem phaseId (não é um estágio do PEP)",
    ffeInvoiceListRes.body?.data?.some((inv: any) => inv.id === ffeInvoiceId && inv.phaseId === null),
    ffeInvoiceListRes.body
  );

  // Correção "moodboard vira quadro tldraw" -- canvas livre próprio
  // (posição de produto/amostra) trocado por um quadro tldraw embutido
  // de verdade; snapshot é opaco pra este service (só o tldraw sabe
  // desenhar a partir dele), então o teste aqui só prova que o
  // round-trip funciona, não valida a forma do JSON.
  const moodboardRes = await api(`/v1/projects/${projectId}/moodboards`, {
    method: "POST",
    body: JSON.stringify({ name: "Sala de Estar — Conceito 1" }),
  });
  report(
    "POST /projects/:id/moodboards → 201, sem snapshot ainda (prancha recém-criada)",
    moodboardRes.status === 201 && moodboardRes.body?.data?.snapshot === null,
    moodboardRes.body
  );
  const moodboardId = moodboardRes.body?.data?.id;

  // Achado A59 da auditoria de 30 ago 2026: moodboardSnapshotInputSchema
  // passou a exigir a forma mínima de um TLStoreSnapshot de verdade
  // (store como mapa, schema.schemaVersion numérico) -- store/schema
  // aqui são o suficiente pra passar na validação; document/marker
  // continuam soltos fora do formato oficial só pra este smoke-test
  // confirmar round-trip (.loose() aceita campos extras).
  const fakeSnapshot = {
    store: { "shape:fake": { id: "shape:fake", type: "geo" } },
    schema: { schemaVersion: 2 },
    document: { shapeFake: true },
    marker: "smoke-test-snapshot",
  };
  const saveSnapshotRes = await api(`/v1/moodboards/${moodboardId}/snapshot`, {
    method: "PATCH",
    body: JSON.stringify({ snapshot: fakeSnapshot }),
  });
  report(
    "PATCH /moodboards/:id/snapshot → 200, devolve o snapshot salvo",
    saveSnapshotRes.status === 200 && saveSnapshotRes.body?.data?.snapshot?.marker === "smoke-test-snapshot",
    saveSnapshotRes.body
  );

  const getMoodboardRes = await api(`/v1/moodboards/${moodboardId}`);
  report(
    "GET /moodboards/:id → 200, snapshot sobrevive ao round-trip",
    getMoodboardRes.status === 200 && getMoodboardRes.body?.data?.snapshot?.marker === "smoke-test-snapshot",
    getMoodboardRes.body
  );

  const moodboardListRes = await api(`/v1/projects/${projectId}/moodboards`);
  const listedMoodboard = moodboardListRes.body?.data?.find((m: any) => m.id === moodboardId);
  report(
    "GET /projects/:id/moodboards inclui a prancha com o snapshot salvo",
    listedMoodboard?.snapshot?.marker === "smoke-test-snapshot",
    moodboardListRes.body
  );

  // Chat por prancha (pedido junto com a colaboração ao vivo) --
  // authorType="user" pro comentário de staff, authorName vem do próprio
  // User da sessão (não passado no corpo).
  const emptyCommentsRes = await api(`/v1/moodboards/${moodboardId}/comments`);
  report(
    "GET /moodboards/:id/comments antes de qualquer comentário → 200, lista vazia",
    emptyCommentsRes.status === 200 && emptyCommentsRes.body?.data?.length === 0,
    emptyCommentsRes.body
  );

  const addStaffCommentRes = await api(`/v1/moodboards/${moodboardId}/comments`, {
    method: "POST",
    body: JSON.stringify({ body: "Ficou ótimo esse conceito!" }),
  });
  report(
    "POST /moodboards/:id/comments (staff) → 201, authorType='user'",
    addStaffCommentRes.status === 201 &&
      addStaffCommentRes.body?.data?.authorType === "user" &&
      addStaffCommentRes.body?.data?.body === "Ficou ótimo esse conceito!",
    addStaffCommentRes.body
  );

  const listCommentsAfterRes = await api(`/v1/moodboards/${moodboardId}/comments`);
  report(
    "GET /moodboards/:id/comments depois → inclui o comentário do staff",
    listCommentsAfterRes.body?.data?.length === 1,
    listCommentsAfterRes.body
  );

  // Nova audiência (nem staff, nem Client, nem ExternalCollaborator de
  // projeto inteiro): alguém convidado só pra colaborar NESTE quadro,
  // autenticado via Logto -- ver WhiteboardGuest no schema. verify-login
  // não chama o Logto de verdade (isto é só apps/api, que já recebe as
  // claims prontas do callback OAuth em apps/web) -- por isso é
  // inteiramente testável aqui sem credencial real nenhuma, diferente
  // do resto da integração Logto/Supabase.
  const guestEmail = `convidado-quadro-${Date.now()}@example.com`;
  const inviteGuestRes = await api(`/v1/moodboards/${moodboardId}/guests`, {
    method: "POST",
    body: JSON.stringify({ email: guestEmail, name: "Convidado do Quadro" }),
  });
  report(
    "POST /moodboards/:id/guests → 201, convida um novo convidado ao quadro",
    inviteGuestRes.status === 201 && inviteGuestRes.body?.data?.guest?.email === guestEmail,
    inviteGuestRes.body
  );
  const guestId = inviteGuestRes.body?.data?.guest?.id;

  const inviteGuestNovoRes = await api(`/v1/moodboards/${moodboardId}/guests`, {
    method: "POST",
    body: JSON.stringify({ email: guestEmail, name: "Convidado do Quadro" }),
  });
  report(
    "Convidar de novo o MESMO e-mail pro MESMO quadro → 201 idempotente, mesmo guestId, não duplica",
    inviteGuestNovoRes.status === 201 && inviteGuestNovoRes.body?.data?.guest?.id === guestId,
    inviteGuestNovoRes.body
  );

  const listGuestsRes = await api(`/v1/moodboards/${moodboardId}/guests`);
  report(
    "GET /moodboards/:id/guests → inclui o convite, sem duplicar (achado de idempotência acima)",
    listGuestsRes.status === 200 && listGuestsRes.body?.data?.length === 1,
    listGuestsRes.body
  );

  const uninvitedLoginRes = await fetch(`${baseUrl}/v1/whiteboard-guest-portal/verify-login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "nunca-convidado@example.com", name: "Ninguém", logtoSubjectId: "sub-fake-1" }),
  });
  report(
    "POST /whiteboard-guest-portal/verify-login com e-mail nunca convidado → 401",
    uninvitedLoginRes.status === 401,
    await uninvitedLoginRes.json().catch(() => null)
  );

  const guestSubjectId = `logto-sub-${Date.now()}`;
  const guestLoginRes = await fetch(`${baseUrl}/v1/whiteboard-guest-portal/verify-login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: guestEmail, name: "Convidado do Quadro", logtoSubjectId: guestSubjectId }),
  });
  const guestLoginBody = await guestLoginRes.json().catch(() => null);
  report(
    "POST /whiteboard-guest-portal/verify-login com e-mail convidado → 200, devolve sessionToken",
    guestLoginRes.status === 200 && !!guestLoginBody?.data?.sessionToken,
    guestLoginBody
  );
  const guestSessionToken = guestLoginBody?.data?.sessionToken;

  const guestBoardsRes = await fetch(`${baseUrl}/v1/whiteboard-guest-portal/boards`, {
    headers: { "X-Whiteboard-Guest-Session": guestSessionToken },
  });
  const guestBoardsBody = await guestBoardsRes.json().catch(() => null);
  report(
    "GET /whiteboard-guest-portal/boards → inclui só o quadro convidado",
    guestBoardsRes.status === 200 &&
      guestBoardsBody?.data?.boards?.length === 1 &&
      guestBoardsBody.data.boards[0].id === moodboardId,
    guestBoardsBody
  );

  const guestGetBoardRes = await fetch(`${baseUrl}/v1/whiteboard-guest-portal/boards/${moodboardId}`, {
    headers: { "X-Whiteboard-Guest-Session": guestSessionToken },
  });
  const guestGetBoardBody = await guestGetBoardRes.json().catch(() => null);
  report(
    "GET /whiteboard-guest-portal/boards/:id → 200, traz o snapshot salvo pelo staff",
    guestGetBoardRes.status === 200 && guestGetBoardBody?.data?.snapshot?.marker === "smoke-test-snapshot",
    guestGetBoardBody
  );

  const guestSaveSnapshotRes = await fetch(`${baseUrl}/v1/whiteboard-guest-portal/boards/${moodboardId}/snapshot`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", "X-Whiteboard-Guest-Session": guestSessionToken },
    body: JSON.stringify({ snapshot: { ...fakeSnapshot, marker: "editado-pelo-convidado" } }),
  });
  report(
    "PATCH /whiteboard-guest-portal/boards/:id/snapshot → 200, convidado tem escrita no quadro",
    guestSaveSnapshotRes.status === 200,
    await guestSaveSnapshotRes.json().catch(() => null)
  );

  const guestCommentRes = await fetch(`${baseUrl}/v1/whiteboard-guest-portal/boards/${moodboardId}/comments`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Whiteboard-Guest-Session": guestSessionToken },
    body: JSON.stringify({ body: "Cheguei!" }),
  });
  const guestCommentBody = await guestCommentRes.json().catch(() => null);
  report(
    "POST /whiteboard-guest-portal/boards/:id/comments → 201, authorType='guest'",
    guestCommentRes.status === 201 && guestCommentBody?.data?.authorType === "guest",
    guestCommentBody
  );

  const commentsAfterGuestRes = await api(`/v1/moodboards/${moodboardId}/comments`);
  report(
    "GET /moodboards/:id/comments (visão do staff) inclui o comentário do convidado",
    commentsAfterGuestRes.body?.data?.length === 2,
    commentsAfterGuestRes.body
  );

  // Segundo quadro, sem convite nenhum -- prova que o escopo é POR
  // QUADRO, não por conta/projeto inteiro (mesmo espírito do teste de
  // CollaboratorPortalService pra "sem acesso a este projeto").
  const secondMoodboardRes = await api(`/v1/projects/${projectId}/moodboards`, {
    method: "POST",
    body: JSON.stringify({ name: "Quarto — Conceito 1" }),
  });
  const secondMoodboardId = secondMoodboardRes.body?.data?.id;
  const guestWrongBoardRes = await fetch(`${baseUrl}/v1/whiteboard-guest-portal/boards/${secondMoodboardId}`, {
    headers: { "X-Whiteboard-Guest-Session": guestSessionToken },
  });
  report(
    "GET /whiteboard-guest-portal/boards/:id sem convite pra ESTE quadro → 403 (sessão continua válida, não é 401)",
    guestWrongBoardRes.status === 403,
    await guestWrongBoardRes.json().catch(() => null)
  );
  await api(`/v1/moodboards/${secondMoodboardId}`, { method: "DELETE" });

  const revokeGuestRes = await api(`/v1/moodboards/${moodboardId}/guests/${guestId}`, { method: "DELETE" });
  report("DELETE /moodboards/:id/guests/:guestId → 204", revokeGuestRes.status === 204, revokeGuestRes.body);

  const guestAfterRevokeRes = await fetch(`${baseUrl}/v1/whiteboard-guest-portal/boards/${moodboardId}`, {
    headers: { "X-Whiteboard-Guest-Session": guestSessionToken },
  });
  report(
    // Achado A60 da auditoria de 30 ago 2026: revoke() passou a apagar
    // também as WhiteboardGuestSession do convidado (antes só tirava o
    // WhiteboardGuestAccess, deixando a sessão de portal viva) -- a
    // MESMA sessão agora vem inválida (401), não só sem acesso a este
    // quadro específico (403, que seria o caso de convite pra outro
    // quadro nunca ter existido).
    "Depois de revogado, GET .../boards/:id direto → 401, sessão de portal foi invalidada junto (achado A60)",
    guestAfterRevokeRes.status === 401,
    await guestAfterRevokeRes.json().catch(() => null)
  );

  const deleteMoodboardRes = await api(`/v1/moodboards/${moodboardId}`, { method: "DELETE" });
  report("DELETE /moodboards/:id → 204", deleteMoodboardRes.status === 204, deleteMoodboardRes.body);

  // Limpeza inline da identidade do convidado -- mesmo padrão de
  // collaboratorEmail mais adiante no run: e-mail único por run, então é
  // seguro apagar tudo ligado a ele aqui mesmo, sem esperar o cleanup
  // script genérico (que só limpa por doomedProjectIds/doomedUserIds).
  await prisma.whiteboardGuestSession.deleteMany({ where: { guest: { email: guestEmail } } });
  await prisma.whiteboardGuestAccess.deleteMany({ where: { guest: { email: guestEmail } } });
  await prisma.whiteboardGuest.deleteMany({ where: { email: guestEmail } });


  return { product1Id, spec1Id };
}
