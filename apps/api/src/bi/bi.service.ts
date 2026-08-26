import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

// Mesmo vocabulário do kanban de CRM (ver
// apps/web/src/components/opportunities/opportunities-board.tsx) --
// ganho/perdido não são valores de Opportunity.stage, são derivados de
// wonAt/lostAt.
const OPPORTUNITY_STAGE_LABELS: Record<string, string> = {
  novo_lead: 'Novo Lead',
  qualificacao: 'Qualificação',
  proposta_enviada: 'Proposta Enviada',
  negociacao: 'Negociação',
  ganho: 'Ganho',
  perdido: 'Perdido',
};

const INVOICE_STATUS_LABELS: Record<string, string> = {
  pendente: 'Pendente',
  emitida: 'Emitida',
  paga: 'Paga',
};

const EXPENSE_STATUS_LABELS: Record<string, string> = {
  pendente: 'Pendente',
  paga: 'Paga',
};

interface OpportunityRow {
  stage: string;
  estimatedValue: unknown;
  wonAt: Date | null;
  lostAt: Date | null;
}

interface InvoiceRow {
  projectId: string;
  status: string;
  amount: unknown;
  paidAt: Date | null;
}

interface ExpenseRow {
  projectId: string | null;
  status: string;
  amount: unknown;
  paidAt: Date | null;
}

interface ProjectRow {
  id: string;
  name: string;
  status: string;
  client: { name: string };
  phases: { budget: unknown }[];
  timeEntries: { hours: unknown; user: { costPerHour: unknown } }[];
}

function stageOf(o: Pick<OpportunityRow, 'stage' | 'wonAt' | 'lostAt'>): string {
  if (o.wonAt) return 'ganho';
  if (o.lostAt) return 'perdido';
  return o.stage;
}

function summarizePipeline(opportunities: OpportunityRow[]) {
  const porEstagio = Object.keys(OPPORTUNITY_STAGE_LABELS).map((key) => {
    const items = opportunities.filter((o) => stageOf(o) === key);
    return {
      estagio: key,
      label: OPPORTUNITY_STAGE_LABELS[key],
      quantidade: items.length,
      valorEstimado: items.reduce((sum, o) => sum + Number(o.estimatedValue ?? 0), 0),
    };
  });

  const ganho = opportunities.filter((o) => o.wonAt).length;
  const perdido = opportunities.filter((o) => o.lostAt).length;
  const resolvidas = ganho + perdido;

  // null (não 0) quando não há nenhuma oportunidade resolvida ainda --
  // "0% de conversão" seria enganoso quando na verdade não há dado
  // nenhum pra calcular taxa.
  return {
    porEstagio,
    taxaConversao: resolvidas > 0 ? ganho / resolvidas : null,
  };
}

function summarizeFaturamento(invoices: InvoiceRow[]) {
  return Object.keys(INVOICE_STATUS_LABELS).map((status) => {
    const items = invoices.filter((i) => i.status === status);
    return {
      status,
      label: INVOICE_STATUS_LABELS[status],
      quantidade: items.length,
      valorTotal: items.reduce((sum, i) => sum + Number(i.amount), 0),
    };
  });
}

// Contraparte de summarizeFaturamento pro lado da saída -- achado da
// auditoria: financeiro só modelava dinheiro entrando, nunca saindo.
function summarizeDespesas(expenses: ExpenseRow[]) {
  return Object.keys(EXPENSE_STATUS_LABELS).map((status) => {
    const items = expenses.filter((e) => e.status === status);
    return {
      status,
      label: EXPENSE_STATUS_LABELS[status],
      quantidade: items.length,
      valorTotal: items.reduce((sum, e) => sum + Number(e.amount), 0),
    };
  });
}

// KPIs de topo -- respondem "como está o negócio agora" numa olhada só,
// sem precisar ler as três seções detalhadas abaixo. Reaproveita os
// mesmos dados já buscados pra pipeline/faturamento/projetos, sem
// nenhuma query nova.
function summarizeKpis(
  opportunities: OpportunityRow[],
  invoices: InvoiceRow[],
  expenses: ExpenseRow[],
  projects: Pick<ProjectRow, 'status'>[],
) {
  const pipelineEmAberto = opportunities
    .filter((o) => !o.wonAt && !o.lostAt)
    .reduce((sum, o) => sum + Number(o.estimatedValue ?? 0), 0);

  const projetosAtivos = projects.filter((p) => p.status === 'ativo').length;

  const aReceber = invoices
    .filter((i) => i.status === 'pendente' || i.status === 'emitida')
    .reduce((sum, i) => sum + Number(i.amount), 0);

  const agora = new Date();
  const inicioMes = new Date(agora.getFullYear(), agora.getMonth(), 1);
  const inicioProximoMes = new Date(agora.getFullYear(), agora.getMonth() + 1, 1);
  const recebidoEsteMes = invoices
    .filter((i) => i.status === 'paga' && i.paidAt && i.paidAt >= inicioMes && i.paidAt < inicioProximoMes)
    .reduce((sum, i) => sum + Number(i.amount), 0);

  const pagoEsteMes = expenses
    .filter((e) => e.status === 'paga' && e.paidAt && e.paidAt >= inicioMes && e.paidAt < inicioProximoMes)
    .reduce((sum, e) => sum + Number(e.amount), 0);

  return {
    pipelineEmAberto,
    projetosAtivos,
    aReceber,
    recebidoEsteMes,
    pagoEsteMes,
    margemEsteMes: recebidoEsteMes - pagoEsteMes,
  };
}

const MESES_PT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

// Tendência dos últimos 6 meses (mês corrente incluso) -- tudo que a
// visão executiva mostrava antes era foto do agora, sem direção/momento.
// Reaproveita opportunities/invoices/expenses já buscados, sem query
// nova. `despesas`/`margem` (recebido - despesas) fecham o achado da
// auditoria: antes só dava pra ver receita mês a mês, nunca lucro.
function summarizeTendencia(invoices: InvoiceRow[], expenses: ExpenseRow[], opportunities: OpportunityRow[]) {
  const agora = new Date();
  const meses = Array.from({ length: 6 }, (_, i) => {
    const offset = 5 - i;
    const inicio = new Date(agora.getFullYear(), agora.getMonth() - offset, 1);
    const fim = new Date(agora.getFullYear(), agora.getMonth() - offset + 1, 1);
    return {
      mes: `${inicio.getFullYear()}-${String(inicio.getMonth() + 1).padStart(2, '0')}`,
      label: `${MESES_PT[inicio.getMonth()]}/${inicio.getFullYear()}`,
      inicio,
      fim,
    };
  });

  return meses.map(({ mes, label, inicio, fim }) => {
    const recebido = invoices
      .filter((i) => i.status === 'paga' && i.paidAt && i.paidAt >= inicio && i.paidAt < fim)
      .reduce((sum, i) => sum + Number(i.amount), 0);

    const despesas = expenses
      .filter((e) => e.status === 'paga' && e.paidAt && e.paidAt >= inicio && e.paidAt < fim)
      .reduce((sum, e) => sum + Number(e.amount), 0);

    const oportunidadesGanhas = opportunities.filter(
      (o) => o.wonAt && o.wonAt >= inicio && o.wonAt < fim,
    ).length;

    return { mes, label, recebido, despesas, margem: recebido - despesas, oportunidadesGanhas };
  });
}

function summarizeProjetos(projects: ProjectRow[], invoices: InvoiceRow[], expenses: ExpenseRow[]) {
  return projects.map((p) => {
    const orcado = p.phases.reduce((sum, ph) => sum + Number(ph.budget ?? 0), 0);

    // Realizado = horas apontadas × custo/hora da pessoa -- mesmo padrão
    // já usado em /team/planning pra custo projetado de Allocation (ver
    // apps/web/src/lib/allocations.ts), só trocando horas planejadas por
    // horas de fato lançadas no timesheet. Ignora entradas de quem não
    // tem costPerHour cadastrado (custo desconhecido, tratado como
    // ausente -- não como custo zero, que subestimaria o realizado). Isso
    // é custo de mão de obra INTERNA, diferente de despesas abaixo (saída
    // de caixa real com terceiros/estrutura) -- os dois juntos é que
    // formam o custo total de entregar o projeto.
    const realizado = p.timeEntries.reduce((sum, te) => {
      if (te.user.costPerHour === null || te.user.costPerHour === undefined) return sum;
      return sum + Number(te.hours) * Number(te.user.costPerHour);
    }, 0);

    // recebido/despesas/margem: achado da auditoria ("what did we
    // actually keep on this project" não era respondível em lugar
    // nenhum) -- os dois lados só contam o que de fato virou caixa
    // (status "paga" em ambos), não o comprometido/pendente, pra ser uma
    // margem real, não uma projeção.
    const recebido = invoices
      .filter((i) => i.projectId === p.id && i.status === 'paga')
      .reduce((sum, i) => sum + Number(i.amount), 0);
    const despesasProjeto = expenses
      .filter((e) => e.projectId === p.id && e.status === 'paga')
      .reduce((sum, e) => sum + Number(e.amount), 0);
    const margem = recebido - realizado - despesasProjeto;

    return {
      projetoId: p.id,
      nome: p.name,
      clienteNome: p.client.name,
      status: p.status,
      orcado,
      realizado,
      recebido,
      despesas: despesasProjeto,
      margem,
    };
  });
}

const DAY_MS = 24 * 60 * 60 * 1000;

interface AllocationRow {
  userId: string;
  hoursPerWeek: unknown;
  startDate: Date;
  endDate: Date;
}

interface UserRow {
  id: string;
  name: string;
  weeklyCapacityHours: unknown;
}

interface TimeEntryRow {
  userId: string;
  hours: unknown;
  date: Date;
}

// Carga atual = soma de hoursPerWeek das alocações ativas hoje (início <=
// hoje <= fim) -- não é o pico histórico (peakHoursPerWeek em
// apps/web/src/lib/allocations.ts), que mistura sobrecarga passada e
// futura num só número. Pra "como está a equipe agora" o corte por hoje
// é mais direto de explicar numa tela.
function summarizeCapacidade(users: UserRow[], allocations: AllocationRow[], timeEntries: TimeEntryRow[]) {
  const agora = Date.now();

  return users.map((user) => {
    const alocacoesDaPessoa = allocations.filter((a) => a.userId === user.id);
    const horasAlocadasAtualmente = alocacoesDaPessoa
      .filter((a) => a.startDate.getTime() <= agora && a.endDate.getTime() >= agora)
      .reduce((sum, a) => sum + Number(a.hoursPerWeek), 0);

    const capacidade = Number(user.weeklyCapacityHours);

    // Mesma janela rolante (7d/30d, não mês-calendário) já usada em
    // /team (ver workloadByUser em apps/web/.../team/page.tsx) --
    // duplicada aqui em vez de importada porque apps/api não depende de
    // apps/web (mesmo motivo do ADR 0002 citado em pep-stages.ts).
    let horasApontadas7d = 0;
    let horasApontadas30d = 0;
    for (const entry of timeEntries) {
      if (entry.userId !== user.id) continue;
      const ageMs = agora - entry.date.getTime();
      if (ageMs > 30 * DAY_MS) continue;
      horasApontadas30d += Number(entry.hours);
      if (ageMs <= 7 * DAY_MS) horasApontadas7d += Number(entry.hours);
    }

    return {
      userId: user.id,
      nome: user.name,
      capacidadeSemanal: capacidade,
      horasAlocadasAtualmente,
      sobrecarregado: horasAlocadasAtualmente > capacidade,
      horasApontadas7d,
      horasApontadas30d,
    };
  });
}

interface ProductSpecificationRow {
  quantity: number;
  unitPrice: unknown;
  markupPercent: unknown;
  clientApproved: boolean;
  productId: string;
  product: { name: string };
  area: { projectId: string; project: { name: string } };
}

// Mesma fórmula de valor de linha do checkout real
// (ProductSpecification.approveCartToInvoiceDraft em
// apps/api/src/ffe/specifications.service.ts) -- não reinventada aqui,
// só reaplicada pra somar o que já foi aprovado e o que ainda pode vir a
// ser (specs com preço definido mas clientApproved ainda false).
function lineTotal(spec: Pick<ProductSpecificationRow, 'quantity' | 'unitPrice' | 'markupPercent'>): number {
  return spec.quantity * Number(spec.unitPrice) * (1 + Number(spec.markupPercent ?? 0));
}

function summarizeFfe(specs: ProductSpecificationRow[]) {
  const porProjetoMap = new Map<string, { projetoId: string; nome: string; valorAprovado: number; valorPendente: number }>();
  let especificacoesSemPreco = 0;
  const produtosMap = new Map<string, { productId: string; nome: string; quantidadeTotal: number }>();
  let somaMarkup = 0;
  let contagemMarkup = 0;

  for (const spec of specs) {
    if (spec.unitPrice === null || spec.unitPrice === undefined) {
      especificacoesSemPreco++;
      continue;
    }

    const projetoId = spec.area.projectId;
    const entry = porProjetoMap.get(projetoId) ?? {
      projetoId,
      nome: spec.area.project.name,
      valorAprovado: 0,
      valorPendente: 0,
    };
    const valor = lineTotal(spec);
    if (spec.clientApproved) {
      entry.valorAprovado += valor;
    } else {
      entry.valorPendente += valor;
    }
    porProjetoMap.set(projetoId, entry);

    if (spec.markupPercent !== null && spec.markupPercent !== undefined) {
      somaMarkup += Number(spec.markupPercent);
      contagemMarkup++;
    }

    const produto = produtosMap.get(spec.productId) ?? {
      productId: spec.productId,
      nome: spec.product.name,
      quantidadeTotal: 0,
    };
    produto.quantidadeTotal += spec.quantity;
    produtosMap.set(spec.productId, produto);
  }

  const produtosMaisEspecificados = [...produtosMap.values()]
    .sort((a, b) => b.quantidadeTotal - a.quantidadeTotal)
    .slice(0, 5);

  return {
    porProjeto: [...porProjetoMap.values()],
    produtosMaisEspecificados,
    markupMedioPercent: contagemMarkup > 0 ? somaMarkup / contagemMarkup : null,
    especificacoesSemPreco,
  };
}

@Injectable()
export class BiService {
  constructor(private readonly prisma: PrismaService) {}

  async getCapacidade(accountId: string) {
    const [users, allocations, timeEntries] = await Promise.all([
      this.prisma.db.user.findMany({
        where: { accountId },
        select: { id: true, name: true, weeklyCapacityHours: true },
      }),
      this.prisma.db.allocation.findMany({
        where: { user: { accountId } },
        select: { userId: true, hoursPerWeek: true, startDate: true, endDate: true },
      }),
      this.prisma.db.timeEntry.findMany({
        where: { user: { accountId } },
        select: { userId: true, hours: true, date: true },
      }),
    ]);

    return { porPessoa: summarizeCapacidade(users, allocations, timeEntries) };
  }

  async getFfe(accountId: string) {
    const specs = await this.prisma.db.productSpecification.findMany({
      where: { area: { project: { accountId } } },
      select: {
        quantity: true,
        unitPrice: true,
        markupPercent: true,
        clientApproved: true,
        productId: true,
        product: { select: { name: true } },
        area: { select: { projectId: true, project: { select: { name: true } } } },
      },
    });

    return summarizeFfe(specs);
  }

  async getExecutiveSummary(accountId: string) {
    const [opportunities, invoices, expenses, projects] = await Promise.all([
      this.prisma.db.opportunity.findMany({
        where: { client: { accountId } },
        select: { stage: true, estimatedValue: true, wonAt: true, lostAt: true },
      }),
      this.prisma.db.invoice.findMany({
        where: { project: { accountId } },
        select: { projectId: true, status: true, amount: true, paidAt: true },
      }),
      this.prisma.db.expense.findMany({
        where: { accountId },
        select: { projectId: true, status: true, amount: true, paidAt: true },
      }),
      this.prisma.db.project.findMany({
        where: { accountId },
        select: {
          id: true,
          name: true,
          status: true,
          client: { select: { name: true } },
          phases: { select: { budget: true } },
          timeEntries: { select: { hours: true, user: { select: { costPerHour: true } } } },
        },
      }),
    ]);

    return {
      kpis: summarizeKpis(opportunities, invoices, expenses, projects),
      pipeline: summarizePipeline(opportunities),
      faturamento: summarizeFaturamento(invoices),
      despesas: summarizeDespesas(expenses),
      projetos: summarizeProjetos(projects, invoices, expenses),
      tendencia: summarizeTendencia(invoices, expenses, opportunities),
    };
  }
}
