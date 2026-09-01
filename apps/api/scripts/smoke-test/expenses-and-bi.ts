import type { ApiFn, ReportFn } from "./types";

// Extraído de smoke-test.ts (revisão de qualidade de código) -- seção
// "Despesas" (achado da auditoria) mais os painéis de /v1/bi/* logo
// depois dela, já que o próprio arquivo original os agrupava: a
// despesa marcada como paga aqui é o que os asserts de
// pagoNoPeriodo/margemNoPeriodo/despesas de bi/executivo e bi/capacidade
// conferem em seguida. projectIdFirst e user2Id são fixtures criadas
// bem antes, em seções ainda não extraídas.
export async function runExpensesAndBiChecks({
  api,
  report,
  projectIdFirst,
  user2Id,
}: {
  api: ApiFn;
  report: ReportFn;
  projectIdFirst: string;
  user2Id: string;
}) {
  const expenseProjetoRes = await api("/v1/expenses", {
    method: "POST",
    body: JSON.stringify({
      description: "Marcenaria sob medida",
      category: "subcontratado",
      amount: 1200,
      projectId: projectIdFirst,
    }),
  });
  report(
    "POST /expenses (com projectId) → 201, nasce 'pendente'",
    expenseProjetoRes.status === 201 && expenseProjetoRes.body?.data?.status === "pendente",
    expenseProjetoRes.body
  );
  const expenseProjetoId = expenseProjetoRes.body?.data?.id;

  const expenseGeralRes = await api("/v1/expenses", {
    method: "POST",
    body: JSON.stringify({ description: "Assinatura do software de renderização", category: "software", amount: 300 }),
  });
  report(
    "POST /expenses sem projectId → 201, despesa geral (project null)",
    expenseGeralRes.status === 201 && expenseGeralRes.body?.data?.project === null,
    expenseGeralRes.body
  );
  const expenseGeralId = expenseGeralRes.body?.data?.id;

  const expenseBadProjectRes = await api("/v1/expenses", {
    method: "POST",
    body: JSON.stringify({ description: "x", category: "x", amount: 10, projectId: "nonexistent-id" }),
  });
  report(
    "POST /expenses com projectId de outra conta/inexistente → 404",
    expenseBadProjectRes.status === 404,
    expenseBadProjectRes.body
  );

  const markExpensePaidRes = await api(`/v1/expenses/${expenseProjetoId}`, {
    method: "PATCH",
    body: JSON.stringify({ status: "paga", paidAt: new Date().toISOString() }),
  });
  report(
    "PATCH /expenses/:id { status: 'paga' } → 200",
    markExpensePaidRes.status === 200 && markExpensePaidRes.body?.data?.status === "paga",
    markExpensePaidRes.body
  );

  const listExpensesByProjectRes = await api(`/v1/expenses?projectId=${projectIdFirst}`);
  report(
    "GET /expenses?projectId= só traz a despesa deste projeto, não a geral",
    listExpensesByProjectRes.body?.data?.length === 1 &&
      listExpensesByProjectRes.body?.data?.[0]?.id === expenseProjetoId,
    listExpensesByProjectRes.body
  );

  const deleteExpenseRes = await api(`/v1/expenses/${expenseGeralId}`, { method: "DELETE" });
  report("DELETE /expenses/:id → 204", deleteExpenseRes.status === 204, deleteExpenseRes.body);
  const listAfterDeleteRes = await api("/v1/expenses");
  report(
    "Após remover, a despesa geral não aparece mais na listagem",
    !listAfterDeleteRes.body?.data?.some((e: any) => e.id === expenseGeralId),
    listAfterDeleteRes.body
  );

  const biRes = await api("/v1/bi/executivo");
  const biData = biRes.body?.data;
  report("GET /bi/executivo → 200", biRes.status === 200, biRes.body);
  report(
    "kpis traz os 4 números de topo, todos numéricos",
    typeof biData?.kpis?.pipelineEmAberto === "number" &&
      typeof biData?.kpis?.projetosAtivos === "number" &&
      typeof biData?.kpis?.aReceber === "number" &&
      typeof biData?.kpis?.recebidoNoPeriodo === "number",
    biData?.kpis
  );
  report(
    "kpis.pagoNoPeriodo reflete a despesa marcada como paga agora mesmo, margemNoPeriodo = recebido - pago",
    biData?.kpis?.pagoNoPeriodo >= 1200 &&
      Math.abs(biData?.kpis?.margemNoPeriodo - (biData?.kpis?.recebidoNoPeriodo - biData?.kpis?.pagoNoPeriodo)) < 0.01,
    biData?.kpis
  );
  report(
    "despesas tem os 2 status de Expense (pendente/paga)",
    biData?.despesas?.length === 2,
    biData?.despesas
  );
  report(
    "kpis.projetosAtivos conta o projeto 'ativo' criado neste run",
    (biData?.kpis?.projetosAtivos ?? 0) >= 1,
    biData?.kpis
  );
  report(
    "kpis.recebidoNoPeriodo reflete o pagamento via webhook feito agora mesmo",
    (biData?.kpis?.recebidoNoPeriodo ?? 0) > 0,
    biData?.kpis
  );
  report(
    "pipeline.porEstagio tem os 6 estágios do kanban (novo_lead..perdido)",
    biData?.pipeline?.porEstagio?.length === 6,
    biData?.pipeline?.porEstagio
  );
  const estagioGanho = biData?.pipeline?.porEstagio?.find((e: any) => e.estagio === "ganho");
  report(
    "Oportunidade marcada ganho neste run aparece em pipeline.porEstagio",
    (estagioGanho?.quantidade ?? 0) >= 1,
    estagioGanho
  );
  report(
    "faturamento tem os 3 status de Invoice (pendente/emitida/paga)",
    biData?.faturamento?.length === 3,
    biData?.faturamento
  );
  const projetoDoRun = biData?.projetos?.find((p: any) => p.projetoId === projectIdFirst);
  report(
    "Projeto criado neste run aparece em projetos com orçado/realizado numéricos",
    typeof projetoDoRun?.orcado === "number" && typeof projetoDoRun?.realizado === "number",
    projetoDoRun
  );
  report(
    "projetoDoRun.despesas reflete a despesa paga deste projeto; margem = recebido - realizado - despesas",
    projetoDoRun?.despesas >= 1200 &&
      Math.abs(projetoDoRun?.margem - (projetoDoRun?.recebido - projetoDoRun?.realizado - projetoDoRun?.despesas)) < 0.01,
    projetoDoRun
  );
  report(
    "tendencia tem os últimos 6 meses, mês corrente por último",
    biData?.tendencia?.length === 6 &&
      biData.tendencia[5].mes === `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`,
    biData?.tendencia
  );
  const mesCorrente = biData?.tendencia?.[5];
  report(
    "tendencia do mês corrente reflete o pagamento via webhook e a oportunidade ganha deste run",
    (mesCorrente?.recebido ?? 0) > 0 && (mesCorrente?.oportunidadesGanhas ?? 0) >= 1,
    mesCorrente
  );
  report(
    "tendencia do mês corrente reflete a despesa paga deste run; margem = recebido - despesas",
    (mesCorrente?.despesas ?? 0) >= 1200 &&
      Math.abs(mesCorrente?.margem - (mesCorrente?.recebido - mesCorrente?.despesas)) < 0.01,
    mesCorrente
  );

  // Filtro de data-range: sem from/to, o default continua sendo os
  // últimos 6 meses (verificado acima). Com from=to=mês corrente, o
  // range vira 1 mês só -- prova que o range é de verdade variável, não
  // sempre 6 meses fixos por baixo do pano.
  const mesAtualStr = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;
  const biMesUnicoRes = await api(`/v1/bi/executivo?from=${mesAtualStr}&to=${mesAtualStr}`);
  const biMesUnicoData = biMesUnicoRes.body?.data;
  report(
    "GET /bi/executivo?from=to=mês corrente → periodo ecoa o range pedido e tendencia tem só 1 mês",
    biMesUnicoData?.periodo?.from === mesAtualStr &&
      biMesUnicoData?.periodo?.to === mesAtualStr &&
      biMesUnicoData?.tendencia?.length === 1,
    biMesUnicoData?.periodo
  );
  report(
    "Recorte de 1 mês (mês corrente) inclui o pagamento/despesa criados agora mesmo neste run",
    (biMesUnicoData?.kpis?.recebidoNoPeriodo ?? 0) > 0 && (biMesUnicoData?.kpis?.pagoNoPeriodo ?? 0) >= 1200,
    biMesUnicoData?.kpis
  );

  // Range num mês totalmente fora de qualquer fixture deste run (bem no
  // futuro) tem que zerar recebido/pago -- prova que o filtro de fato
  // exclui, não só ecoa o parâmetro sem aplicar.
  const mesSemDadoRes = await api("/v1/bi/executivo?from=2099-01&to=2099-01");
  const mesSemDadoData = mesSemDadoRes.body?.data;
  report(
    "Range num mês sem nenhum dado → recebido/pago no período zerados",
    mesSemDadoData?.kpis?.recebidoNoPeriodo === 0 && mesSemDadoData?.kpis?.pagoNoPeriodo === 0,
    mesSemDadoData?.kpis
  );

  const capacidadeRes = await api("/v1/bi/capacidade");
  const capacidadeData = capacidadeRes.body?.data;
  report("GET /bi/capacidade → 200", capacidadeRes.status === 200, capacidadeRes.body);
  const pessoaDoRun = capacidadeData?.porPessoa?.find((p: any) => p.userId === user2Id);
  report(
    "porPessoa inclui o colaborador criado neste run, com capacidade default 40h",
    pessoaDoRun?.capacidadeSemanal === 40,
    pessoaDoRun
  );

  const ffeRes = await api("/v1/bi/ffe");
  const ffeData = ffeRes.body?.data;
  report("GET /bi/ffe → 200", ffeRes.status === 200, ffeRes.body);
  const ffeProjetoDoRun = ffeData?.porProjeto?.find((p: any) => p.projetoId === projectIdFirst);
  report(
    "porProjeto reflete o checkout do carrinho deste run (valorAprovado = 9020)",
    Math.abs((ffeProjetoDoRun?.valorAprovado ?? 0) - 9020) < 0.01,
    ffeProjetoDoRun
  );
  report(
    "especificacoesSemPreco conta a especificação genérica sem unitPrice deste run",
    (ffeData?.especificacoesSemPreco ?? 0) >= 1,
    ffeData?.especificacoesSemPreco
  );
  // Não afirma que o produto deste run está no top 5 -- depois de muitos
  // runs acumulados na mesma conta de dev, vários produtos empatam em
  // quantidadeTotal=1, e qual deles entra no corte de 5 é arbitrário
  // (não reflete um bug, só empate). Testa a forma da resposta em vez
  // disso: ordenado decrescente, no máximo 5 itens.
  const listaProdutos = ffeData?.produtosMaisEspecificados ?? [];
  const ordenadaDecrescente = listaProdutos.every(
    (p: any, i: number) => i === 0 || listaProdutos[i - 1].quantidadeTotal >= p.quantidadeTotal
  );
  report(
    "produtosMaisEspecificados: no máximo 5 itens, ordenados por quantidade decrescente",
    listaProdutos.length <= 5 && ordenadaDecrescente,
    listaProdutos
  );
}
