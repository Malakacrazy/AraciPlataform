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

  createClient(accountId: string, input: ClientInput) {
    return this.prisma.db.client.create({ data: { ...input, accountId } });
  }

  async updateClient(
    accountId: string,
    id: string,
    input: Partial<ClientInput>,
  ) {
    await this.getClient(accountId, id); // 404 antes de tentar atualizar fora do escopo da conta
    return this.prisma.db.client.update({ where: { id }, data: input });
  }

  async deleteClient(accountId: string, id: string) {
    await this.getClient(accountId, id);
    // Mesmo raciocínio de ProjectsService.deleteProject: OfficeLink não
    // tem FK para Client (polimórfico), então precisa de limpeza explícita
    // para não deixar vínculo órfão e inacessível.
    await this.prisma.db.$transaction([
      this.prisma.db.officeLink.deleteMany({
        where: { accountId, entityType: 'CLIENT', entityId: id },
      }),
      this.prisma.db.client.delete({ where: { id } }),
    ]);
  }
}
