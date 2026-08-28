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
    await this.prisma.db.$transaction([
      this.prisma.db.officeLink.deleteMany({
        where: { accountId, entityType: 'CLIENT', entityId: id },
      }),
      this.prisma.db.activity.deleteMany({
        where: { accountId, entityType: 'CLIENT', entityId: id },
      }),
      this.prisma.db.client.delete({ where: { id } }),
    ]);
  }

  // Lacuna da matriz (LGPD, "exportação dos dados do titular"). Escopo
  // deliberado: o próprio Client, suas Opportunity/Proposal (interesse
  // comercial) e Activity endereçadas a ele (histórico de contato) --
  // não inclui Invoice/Expense (registro fiscal do ESTÚDIO, não dado
  // pessoal do cliente) nem AuditLog bruto (metadado interno de quem
  // mudou o quê, não "dados que coletamos sobre você").
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
}
