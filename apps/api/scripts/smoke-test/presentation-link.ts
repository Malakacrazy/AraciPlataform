import { prisma } from "@araci/db";
import type { ApiFn, ReportFn } from "./types";

// Extraído de smoke-test.ts (revisão de qualidade de código) -- seção
// "Link de apresentação". Sem sessão nenhuma a partir daqui, o token na
// URL é a única credencial: as rotas /v1/present/:token são @Public()
// e por isso os testes usam fetch() puro (não api()) pra provar que
// funcionam sem Authorization. projectId/product1Id/spec1Id são
// fixtures criadas bem antes, em seções ainda não extraídas.
export async function runPresentationLinkChecks({
  api,
  report,
  baseUrl,
  projectId,
  product1Id,
  spec1Id,
}: {
  api: ApiFn;
  report: ReportFn;
  baseUrl: string;
  projectId: string;
  product1Id: string;
  spec1Id: string;
}) {
  const noLinkYetRes = await api(`/v1/projects/${projectId}/presentation-link`);
  report(
    "GET /projects/:id/presentation-link antes de gerar → 200 com data null",
    noLinkYetRes.status === 200 && noLinkYetRes.body?.data === null,
    noLinkYetRes.body
  );

  const bogusTokenRes = await fetch(`${baseUrl}/v1/present/token-que-nao-existe`);
  report(
    "GET /v1/present/:token com token inválido → 404, sem precisar de nenhum header",
    bogusTokenRes.status === 404,
    await bogusTokenRes.json().catch(() => null)
  );

  const createLinkRes = await api(`/v1/projects/${projectId}/presentation-link`, { method: "POST" });
  report("POST /projects/:id/presentation-link → 201, devolve token", createLinkRes.status === 201 && !!createLinkRes.body?.data?.token, createLinkRes.body);
  const firstToken = createLinkRes.body?.data?.token;

  const publicViewRes = await fetch(`${baseUrl}/v1/present/${firstToken}`);
  const publicViewBody = await publicViewRes.json().catch(() => null);
  report(
    "GET /v1/present/:token sem Authorization → 200, traz cliente/áreas/pranchas do projeto certo",
    publicViewRes.status === 200 &&
      publicViewBody?.data?.id === projectId &&
      Array.isArray(publicViewBody?.data?.areas) &&
      Array.isArray(publicViewBody?.data?.moodboards),
    publicViewBody
  );

  // spec1 foi criado com unitPrice: 8200, markupPercent: 0.1 -- achados
  // C-03/C-04: o link público nunca pode devolver esse 8200 cru nem o
  // 0.1 do markup, e o número que aparece como unitPrice aqui tem que
  // já ser o preço de venda (8200 × 1,1 = 9020), o mesmo valor que
  // specifications.service.ts usa pra gerar a fatura de verdade no
  // checkout.
  const publicSpec1 = publicViewBody?.data?.areas
    ?.flatMap((a: any) => a.specifications ?? [])
    .find((s: any) => s.product?.id === product1Id);
  report(
    "Link público: unitPrice já é o preço com markup (9020), não o custo cru (8200)",
    Number(publicSpec1?.unitPrice) === 9020,
    publicSpec1
  );
  report(
    "Link público: markupPercent e sourceUrl nunca aparecem no payload (achado C-03)",
    publicSpec1?.markupPercent === undefined && publicSpec1?.product?.sourceUrl === undefined,
    publicSpec1
  );
  report(
    "Link público: product.supplier também nunca aparece (achado A53 -- C-03 tinha ficado incompleto)",
    publicSpec1?.product?.supplier === undefined,
    publicSpec1
  );

  // Item "grande" da lista de 11 (adiado até a taxonomia documental estar
  // em uso real): documento visível ao cliente no link de apresentação.
  // Criado pelo endpoint real (mesmo que a tela do projeto usa) e depois
  // marcado documentType/visibleToClient via PATCH; brokenAt só é setável
  // de servidor pra servidor (checkBrokenLinksForAccount), então esse
  // caso vai direto no banco -- mesmo padrão de asaasPaymentId/
  // nfseChaveAcesso nos testes de webhook.
  const visibleDocRes = await api(`/v1/projects/${projectId}/office-links`, {
    method: "POST",
    body: JSON.stringify({
      provider: "DRIVE",
      externalId: "drive-file-visivel",
      url: "https://drive.google.com/file/d/drive-file-visivel/view",
      title: "Contrato.pdf",
    }),
  });
  const visibleDocId = visibleDocRes.body?.data?.id;
  await api(`/v1/office-links/${visibleDocId}`, {
    method: "PATCH",
    body: JSON.stringify({ documentType: "contrato", visibleToClient: true }),
  });

  const hiddenDocRes = await api(`/v1/projects/${projectId}/office-links`, {
    method: "POST",
    body: JSON.stringify({
      provider: "DRIVE",
      externalId: "drive-file-interno",
      url: "https://drive.google.com/file/d/drive-file-interno/view",
      title: "Rascunho interno.pdf",
    }),
  });
  const hiddenDocId = hiddenDocRes.body?.data?.id; // nunca marcado visibleToClient -- false por default

  const brokenVisibleDocRes = await api(`/v1/projects/${projectId}/office-links`, {
    method: "POST",
    body: JSON.stringify({
      provider: "DRIVE",
      externalId: "drive-file-quebrado",
      url: "https://drive.google.com/file/d/drive-file-quebrado/view",
      title: "ART antiga.pdf",
    }),
  });
  const brokenVisibleDocId = brokenVisibleDocRes.body?.data?.id;
  await api(`/v1/office-links/${brokenVisibleDocId}`, {
    method: "PATCH",
    body: JSON.stringify({ visibleToClient: true }),
  });
  await prisma.officeLink.update({ where: { id: brokenVisibleDocId }, data: { brokenAt: new Date() } });

  const publicViewWithDocsRes = await fetch(`${baseUrl}/v1/present/${firstToken}`);
  const publicViewWithDocsBody = await publicViewWithDocsRes.json().catch(() => null);
  const publicDocs = publicViewWithDocsBody?.data?.documents ?? [];
  report(
    "GET /v1/present/:token traz só o documento marcado visibleToClient e não quebrado (nunca o interno nem o quebrado)",
    publicDocs.length === 1 && publicDocs[0]?.id === visibleDocId && publicDocs[0]?.documentType === "contrato",
    publicDocs
  );

  const downloadHiddenRes = await fetch(`${baseUrl}/v1/present/${firstToken}/documents/${hiddenDocId}`);
  report(
    "GET .../present/:token/documents/:id de um vínculo nunca marcado visível → 404 (não vaza que existe)",
    downloadHiddenRes.status === 404,
    await downloadHiddenRes.json().catch(() => null)
  );

  const downloadBrokenRes = await fetch(`${baseUrl}/v1/present/${firstToken}/documents/${brokenVisibleDocId}`);
  report(
    "GET .../present/:token/documents/:id de um vínculo visível mas já quebrado → 404",
    downloadBrokenRes.status === 404,
    await downloadBrokenRes.json().catch(() => null)
  );

  const downloadInexistentRes = await fetch(`${baseUrl}/v1/present/${firstToken}/documents/id-que-nao-existe`);
  report(
    "GET .../present/:token/documents/:id inexistente → 404",
    downloadInexistentRes.status === 404,
    await downloadInexistentRes.json().catch(() => null)
  );

  const downloadVisibleRes = await fetch(`${baseUrl}/v1/present/${firstToken}/documents/${visibleDocId}`);
  const downloadVisibleBody = await downloadVisibleRes.json().catch(() => null);
  report(
    "GET .../present/:token/documents/:id visível, sem ninguém da conta conectado ao Drive → 422 GOOGLE_DRIVE_NOT_CONNECTED",
    downloadVisibleRes.status === 422 && downloadVisibleBody?.error?.code === "GOOGLE_DRIVE_NOT_CONNECTED",
    downloadVisibleBody
  );

  // Limpeza inline -- este projectId é reaproveitado bem mais adiante no
  // run (teste "GET /projects/:id/office-links inclui os três vínculos",
  // que conta Drive+Calendar+Gmail já contratados nesse projeto); sem
  // isto, os 3 vínculos daqui vazariam pra lá e quebrariam a contagem.
  await api(`/v1/office-links/${visibleDocId}`, { method: "DELETE" });
  await api(`/v1/office-links/${hiddenDocId}`, { method: "DELETE" });
  await api(`/v1/office-links/${brokenVisibleDocId}`, { method: "DELETE" });

  // Quadro tldraw pelo link de apresentação -- mesmo escopo (token só
  // prova posse de UM projeto) já provado pra documentos/especificações;
  // aqui só falta confirmar que um moodboardId de outro projeto dá 404
  // (não vaza que a prancha existe alhures), igual updateSpecification
  // já faz pro specId.
  const presentationMoodboardRes = await api(`/v1/projects/${projectId}/moodboards`, {
    method: "POST",
    body: JSON.stringify({ name: "Prancha do link de apresentação" }),
  });
  const presentationMoodboardId = presentationMoodboardRes.body?.data?.id;

  const publicGetBoardRes = await fetch(`${baseUrl}/v1/present/${firstToken}/moodboards/${presentationMoodboardId}`);
  report(
    "GET /v1/present/:token/moodboards/:id → 200, sem Authorization",
    publicGetBoardRes.status === 200,
    await publicGetBoardRes.json().catch(() => null)
  );

  const publicSaveSnapshotRes = await fetch(
    `${baseUrl}/v1/present/${firstToken}/moodboards/${presentationMoodboardId}/snapshot`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      // Achado A59: mesma forma mínima exigida em fakeSnapshot acima.
      body: JSON.stringify({
        snapshot: { store: {}, schema: { schemaVersion: 2 }, marker: "editado-pelo-cliente" },
      }),
    },
  );
  report(
    "PATCH .../present/:token/moodboards/:id/snapshot → 200, cliente tem escrita (posse do link = acesso)",
    publicSaveSnapshotRes.status === 200,
    await publicSaveSnapshotRes.json().catch(() => null)
  );

  const publicAddCommentRes = await fetch(
    `${baseUrl}/v1/present/${firstToken}/moodboards/${presentationMoodboardId}/comments`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: "Adorei a prancha!" }),
    },
  );
  const publicAddCommentBody = await publicAddCommentRes.json().catch(() => null);
  report(
    "POST .../present/:token/moodboards/:id/comments → 201, authorType='client'",
    publicAddCommentRes.status === 201 && publicAddCommentBody?.data?.authorType === "client",
    publicAddCommentBody
  );

  const otherProjectMoodboardRes = await fetch(`${baseUrl}/v1/present/${firstToken}/moodboards/id-de-outro-projeto`);
  report(
    "GET /v1/present/:token/moodboards/:id de um id que não pertence a este projeto → 404",
    otherProjectMoodboardRes.status === 404,
    await otherProjectMoodboardRes.json().catch(() => null)
  );

  await api(`/v1/moodboards/${presentationMoodboardId}`, { method: "DELETE" });

  const approveViaLinkRes = await fetch(`${baseUrl}/v1/present/${firstToken}/specifications/${spec1Id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clientApproved: true, clientComment: "Adorei!", unitPrice: 999999 }),
  });
  const approveViaLinkBody = await approveViaLinkRes.json().catch(() => null);
  report(
    "PATCH .../present/:token/specifications/:id sem Authorization → 200, aprova e comenta",
    approveViaLinkRes.status === 200 &&
      approveViaLinkBody?.data?.clientApproved === true &&
      approveViaLinkBody?.data?.clientComment === "Adorei!",
    approveViaLinkBody
  );
  report(
    "Mesma chamada NÃO aceita unitPrice — campo fora do schema público é ignorado, não vira erro nem some o preço",
    Number(approveViaLinkBody?.data?.unitPrice) !== 999999,
    approveViaLinkBody?.data?.unitPrice
  );

  const regenerateLinkRes = await api(`/v1/projects/${projectId}/presentation-link`, { method: "POST" });
  const secondToken = regenerateLinkRes.body?.data?.token;
  report(
    "Gerar de novo troca o token (revogação implícita do anterior)",
    !!secondToken && secondToken !== firstToken,
    { firstToken, secondToken }
  );

  const oldTokenNowRes = await fetch(`${baseUrl}/v1/present/${firstToken}`);
  report("Token antigo, depois de regenerar → 404", oldTokenNowRes.status === 404, await oldTokenNowRes.json().catch(() => null));

  const revokeLinkRes = await api(`/v1/projects/${projectId}/presentation-link`, { method: "DELETE" });
  report("DELETE /projects/:id/presentation-link → 204", revokeLinkRes.status === 204, revokeLinkRes.body);

  const revokedTokenRes = await fetch(`${baseUrl}/v1/present/${secondToken}`);
  report(
    "Token revogado → 404 (não sobra acesso nenhum depois do DELETE)",
    revokedTokenRes.status === 404,
    await revokedTokenRes.json().catch(() => null)
  );
}
