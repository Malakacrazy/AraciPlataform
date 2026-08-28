import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';
import { NotFoundError } from '../common/api-error';

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
}
