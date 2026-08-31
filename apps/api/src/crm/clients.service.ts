import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { prisma as rawPrisma, Prisma } from '@araci/db';
import { PrismaService } from '../prisma/prisma.service';
import { ApiError, NotFoundError } from '../common/api-error';

// Lacuna da matriz (LGPD) -- campos de Client considerados dado pessoal
// pra fins de anonimização/redação do AuditLog. `source` fica de fora de
// propósito: é metadado de canal de captação, não identifica ninguém
// sozinho.
const CLIENT_PII_FIELDS = ['name', 'email', 'phone', 'document'] as const;

export const clientInputSchema = z.object({
  name: z.string().min(1, 'Nome é obrigatório.'),
  document: z.string().optional(),
  email: z.email().optional(),
  phone: z.string().optional(),
  // site | whatsapp | instagram | indicacao | email | telefone — convenção
  // livre, mesma flexibilidade do campo no schema (não é um enum no banco).
  source: z.string().optional(),
});

export type ClientInput = z.infer<typeof clientInputSchema>;

@Injectable()
export class ClientsService {
  constructor(private readonly prisma: PrismaService) {}

  listClients(accountId: string) {
    return this.prisma.db.client.findMany({
      where: { accountId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getClient(accountId: string, id: string) {
    const client = await this.prisma.db.client.findFirst({
      where: { id, accountId },
    });
    if (!client) {
      throw new NotFoundError('Cliente');
    }
    return client;
  }

  // Normaliza pra minúsculas aqui no service, não só no schema Zod --
  // LeadsService.createClient chama este método direto (nunca passa pelo
  // ZodValidationPipe de novo), então normalizar só no schema deixaria o
  // formulário público de lead fora da proteção. @unique em Client.email
  // (achado A-05 da auditoria) só barra "Foo@x.com" duplicado de
  // "foo@x.com" se os dois sempre chegarem já em minúsculas -- Postgres
  // compara case-sensitive por padrão.
  private normalizeEmail<T extends { email?: string }>(input: T): T {
    return input.email ? { ...input, email: input.email.toLowerCase() } : input;
  }

  createClient(accountId: string, input: ClientInput) {
    return this.prisma.db.client.create({ data: { ...this.normalizeEmail(input), accountId } });
  }

  async updateClient(
    accountId: string,
    id: string,
    input: Partial<ClientInput>,
  ) {
    await this.getClient(accountId, id); // 404 antes de tentar atualizar fora do escopo da conta
    return this.prisma.db.client.update({ where: { id }, data: this.normalizeEmail(input) });
  }

  async deleteClient(accountId: string, id: string) {
    await this.getClient(accountId, id);
    // Mesmo raciocínio de ProjectsService.deleteProject: OfficeLink e
    // Activity não têm FK para Client (polimórficos), então precisam de
    // limpeza explícita para não deixar vínculo/nota órfão e inacessível
    // (achado A-02 da auditoria: Activity tinha o mesmo padrão do
    // OfficeLink mas não era limpo em nenhum dos dois deletes).
    // Achado A50 da auditoria de 30 ago 2026: ClientMagicLink/
    // ClientSession têm FK real (ON DELETE RESTRICT, default do Prisma
    // sem onDelete declarado) -- qualquer Client que já pediu um magic
    // link vira indeletável (P2003 cru em vez de mensagem útil) sem esta
    // limpeza, mesmo padrão do OfficeLink/Activity polimórficos acima.
    await this.prisma.db.$transaction([
      this.prisma.db.officeLink.deleteMany({
        where: { accountId, entityType: 'CLIENT', entityId: id },
      }),
      this.prisma.db.activity.deleteMany({
        where: { accountId, entityType: 'CLIENT', entityId: id },
      }),
      this.prisma.db.clientMagicLink.deleteMany({ where: { clientId: id } }),
      this.prisma.db.clientSession.deleteMany({ where: { clientId: id } }),
      this.prisma.db.client.delete({ where: { id } }),
    ]);
  }

  // Lacuna da matriz (LGPD, "exportação dos dados do titular"). Escopo
  // deliberado: o próprio Client, suas Opportunity/Proposal (interesse
  // comercial) e Activity endereçadas a ele (histórico de contato) --
  // não inclui Invoice/Expense (registro fiscal do ESTÚDIO, não dado
  // pessoal do cliente) nem AuditLog bruto (metadado interno de quem
  // mudou o quê, não "dados que coletamos sobre você").
  //
  // Uso EXCLUSIVO da tela de staff (GET /v1/clients/:id/data-export,
  // @AdminOnly-adjacent via sessão de staff) -- devolve o registro
  // completo de propósito, é ferramenta interna. Achados A48/A67 da
  // auditoria de 30 ago 2026: este método era reaproveitado cru também
  // pelo portal do CLIENTE (client-portal.service.ts), entregando pra
  // contraparte da negociação a composição interna de preço
  // (baseCost/adjustedCost/complexityMultiplier/packageDiscountPercent),
  // o motivo de perda de negócio (lostReason) e notas internas da
  // equipe (Activity) -- exatamente o que ClientPortalService.
  // listPendingProposals já exclui de propósito pro mesmo público, com o
  // comentário "é composição interna de preço, não o que o prospecto
  // aprova". Ver exportClientDataForSubject abaixo pro caminho do
  // titular.
  async exportClientData(accountId: string, id: string) {
    const client = await this.getClient(accountId, id);
    const [opportunities, projects, activities] = await Promise.all([
      this.prisma.db.opportunity.findMany({
        where: { clientId: id },
        include: { proposals: { include: { stages: true } } },
      }),
      this.prisma.db.project.findMany({
        where: { clientId: id },
        select: { id: true, name: true, status: true, createdAt: true },
      }),
      this.prisma.db.activity.findMany({
        where: { accountId, entityType: 'CLIENT', entityId: id },
        select: { id: true, body: true, createdAt: true, author: { select: { name: true } } },
      }),
    ]);
    return { client, opportunities, projects, activities };
  }

  // Achados A48/A67 -- a mesma exportação, mas pro TITULAR (portal do
  // cliente), com select explícito em vez do include cru de
  // exportClientData: nunca a composição interna de preço, nunca o
  // motivo de perda, nunca Activity (nota interna da equipe -- sem um
  // campo de visibilidade tipo OfficeLink.visibleToClient, a opção
  // segura é não expor nenhuma, não uma amostra arbitrária).
  async exportClientDataForSubject(accountId: string, id: string) {
    const client = await this.prisma.db.client.findFirst({
      where: { id, accountId },
      select: { name: true, email: true, phone: true, document: true, createdAt: true, consentedAt: true },
    });
    if (!client) {
      throw new NotFoundError('Cliente');
    }
    const opportunities = await this.prisma.db.opportunity.findMany({
      where: { clientId: id },
      select: {
        id: true,
        title: true,
        stage: true,
        createdAt: true,
        wonAt: true,
        lostAt: true,
        proposals: {
          select: {
            id: true,
            version: true,
            value: true,
            status: true,
            sentAt: true,
            signedAt: true,
            stages: { select: { stage: true, contracted: true } },
          },
        },
      },
    });
    const projects = await this.prisma.db.project.findMany({
      where: { clientId: id },
      select: { id: true, name: true, status: true, createdAt: true },
    });
    return { client, opportunities, projects };
  }

  // Lacuna da matriz (LGPD, "anonimização preservando o registro fiscal,
  // em vez de exclusão física") -- ao contrário de deleteClient, NÃO
  // remove o registro: Invoice/Opportunity/Project ligados a este Client
  // continuam existindo (retenção fiscal real, não op­cional), só param
  // de ser identificáveis. Redige também os campos PII já gravados em
  // AuditLog.changes -- sem isso, o histórico de auditoria (que existe
  // pra proteger o estúdio) continuaria guardando e-mail/telefone/
  // documento em texto puro pra sempre, fora do alcance desta operação.
  async anonymizeClient(accountId: string, id: string) {
    const client = await this.getClient(accountId, id);
    if (client.anonymizedAt) {
      throw new ApiError('CLIENT_ALREADY_ANONYMIZED', 'Este cliente já foi anonimizado.', 422);
    }
    await this.assertNoOpenFiscalObligation(accountId, id);

    // rawPrisma (SEM a extensão de auditoria), de propósito -- ver
    // prisma-audit-extension.ts: gravar esta atualização pelo client
    // estendido (this.prisma.db) criaria uma entrada NOVA no AuditLog
    // com o e-mail/telefone/nome REAIS como "from" do diff, recriando
    // exatamente o dado que esta operação existe pra apagar. anonymizedAt
    // (já setado abaixo) é o registro de que isto aconteceu e quando --
    // não precisa de uma entrada de log adicional pra isso.
    await rawPrisma.$transaction(async (tx) => {
      await tx.client.update({
        where: { id },
        data: {
          name: `Cliente anonimizado (${id.slice(-6)})`,
          email: null,
          phone: null,
          document: null,
          anonymizedAt: new Date(),
        },
      });

      // Achado A50 da auditoria de 30 ago 2026: anonymizeClient zerava
      // PII mas não tocava em ClientSession -- uma sessão emitida antes
      // da anonimização continuava válida por até 7 dias (SESSION_TTL_MS,
      // resolveSession só confere expiresAt), listando projetos e
      // exportando dados de um titular que acabou de pedir apagamento.
      // ClientMagicLink também limpo por simetria com deleteClient acima.
      await tx.clientSession.deleteMany({ where: { clientId: id } });
      await tx.clientMagicLink.deleteMany({ where: { clientId: id } });

      const logs = await tx.auditLog.findMany({
        where: { accountId, entityType: 'Client', entityId: id },
        select: { id: true, changes: true },
      });
      for (const log of logs) {
        const changes = log.changes as Record<string, { from: unknown; to: unknown }> | null;
        if (!changes) continue;
        const redacted = { ...changes };
        let mutated = false;
        for (const field of CLIENT_PII_FIELDS) {
          if (field in redacted) {
            redacted[field] = { from: '[REDIGIDO]', to: '[REDIGIDO]' };
            mutated = true;
          }
        }
        if (mutated) {
          // Mesmo cast de writeAuditLog em prisma-audit-extension.ts --
          // Prisma tipa Json de entrada como InputJsonValue (recursivo,
          // sem `unknown`), redacted aqui só carrega string, então o
          // shape é seguro mesmo sem bater no tipo exato.
          await tx.auditLog.update({
            where: { id: log.id },
            data: { changes: redacted as unknown as Prisma.InputJsonValue },
          });
        }
      }
    });
  }

  // Lacuna da matriz (LGPD, "automação de retenção/expurgo") -- usado só
  // pelo DataRetentionCron, sweep entre TODAS as contas de propósito,
  // mesmo padrão de OpportunitiesService.listOpenOpportunities. O filtro
  // `account: { dataRetentionMonths: { not: null } }` já é a própria
  // decisão de ligar/desligar (ver comentário no schema): conta que nunca
  // configurou um prazo nem entra nesta consulta.
  //
  // Achado A3 da auditoria de 30 ago 2026: os sinais de "última
  // atividade" antigos (createdAt de cliente/oportunidade/projeto, mais
  // Activity só de entityType CLIENT) ignoravam qualquer sinal de projeto
  // realmente vivo -- hora lançada, fatura, gate aprovado, nota na
  // timeline do PROJETO. Agora traz timeEntries/invoices/phases de cada
  // projeto junto (sem N+1: uma consulta só) pra o cron computar o
  // lastTouch de verdade; Activity de PROJECT/OPPORTUNITY é buscada à
  // parte pelo cron (mesmo padrão de getLastActivityAtByClientIds), não
  // dá pra incluir num único `include` porque são duas entidades
  // diferentes.
  listRetentionCandidateClients() {
    return this.prisma.db.client.findMany({
      where: { anonymizedAt: null, account: { dataRetentionMonths: { not: null } } },
      select: {
        id: true,
        name: true,
        accountId: true,
        createdAt: true,
        account: { select: { dataRetentionMonths: true } },
        opportunities: { select: { id: true, createdAt: true, wonAt: true, lostAt: true } },
        projects: {
          select: {
            id: true,
            createdAt: true,
            status: true,
            timeEntries: { select: { date: true }, orderBy: { date: 'desc' }, take: 1 },
            invoices: { select: { issuedAt: true, paidAt: true, dueDate: true } },
            phases: { select: { approvedAt: true } },
          },
        },
      },
    });
  }

  // Achado A3: anonymizeClient é irreversível (zera PII, redige o
  // AuditLog) e até agora confiava só no julgamento de quem clicou --
  // se o cron avisou errado (sinal fraco, ver DataRetentionCron), nada
  // impedia o clique de destruir o dado de um cliente com obrigação
  // fiscal real em aberto. Fatura não paga OU NFS-e emitida dentro do
  // prazo de guarda fiscal (mesma janela de dataRetentionMonths da
  // própria conta, nunca menor que isso) barram a anonimização.
  private async assertNoOpenFiscalObligation(accountId: string, clientId: string) {
    const account = await this.prisma.db.account.findUnique({
      where: { id: accountId },
      select: { dataRetentionMonths: true },
    });
    const unpaidInvoice = await this.prisma.db.invoice.findFirst({
      where: { project: { clientId }, status: { not: 'paga' } },
      select: { id: true },
    });
    if (unpaidInvoice) {
      throw new ApiError(
        'CLIENT_HAS_OPEN_INVOICE',
        'Este cliente tem uma fatura não paga -- não é possível anonimizar antes de resolver a cobrança.',
        422,
      );
    }
    if (account?.dataRetentionMonths) {
      const guardaFiscalDesde = new Date();
      guardaFiscalDesde.setMonth(guardaFiscalDesde.getMonth() - account.dataRetentionMonths);
      const recentNfse = await this.prisma.db.invoice.findFirst({
        where: {
          project: { clientId },
          nfseChaveAcesso: { not: null },
          issuedAt: { gte: guardaFiscalDesde },
        },
        select: { id: true },
      });
      if (recentNfse) {
        throw new ApiError(
          'CLIENT_HAS_RECENT_NFSE',
          'Este cliente tem NFS-e emitida dentro do prazo de guarda fiscal configurado -- não é possível anonimizar ainda.',
          422,
        );
      }
    }
  }
}
