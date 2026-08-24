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

interface OpportunityRow {
  stage: string;
  estimatedValue: unknown;
  wonAt: Date | null;
  lostAt: Date | null;
}

interface InvoiceRow {
  status: string;
  amount: unknown;
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

function summarizeProjetos(projects: ProjectRow[]) {
  return projects.map((p) => {
    const orcado = p.phases.reduce((sum, ph) => sum + Number(ph.budget ?? 0), 0);

    // Realizado = horas apontadas × custo/hora da pessoa -- mesmo padrão
    // já usado em /team/planning pra custo projetado de Allocation (ver
    // apps/web/src/lib/allocations.ts), só trocando horas planejadas por
    // horas de fato lançadas no timesheet. Ignora entradas de quem não
    // tem costPerHour cadastrado (custo desconhecido, tratado como
    // ausente -- não como custo zero, que subestimaria o realizado).
    const realizado = p.timeEntries.reduce((sum, te) => {
      if (te.user.costPerHour === null || te.user.costPerHour === undefined) return sum;
      return sum + Number(te.hours) * Number(te.user.costPerHour);
    }, 0);

    return {
      projetoId: p.id,
      nome: p.name,
      clienteNome: p.client.name,
      status: p.status,
      orcado,
      realizado,
    };
  });
}

@Injectable()
export class BiService {
  constructor(private readonly prisma: PrismaService) {}

  async getExecutiveSummary(accountId: string) {
    const [opportunities, invoices, projects] = await Promise.all([
      this.prisma.db.opportunity.findMany({
        where: { client: { accountId } },
        select: { stage: true, estimatedValue: true, wonAt: true, lostAt: true },
      }),
      this.prisma.db.invoice.findMany({
        where: { project: { accountId } },
        select: { status: true, amount: true },
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
      pipeline: summarizePipeline(opportunities),
      faturamento: summarizeFaturamento(invoices),
      projetos: summarizeProjetos(projects),
    };
  }
}
