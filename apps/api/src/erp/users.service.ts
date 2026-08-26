import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { randomBytes, createHash } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { NotFoundError } from '../common/api-error';

// Papel/cargo sugerido: apps/api/src/roles.ts (CANONICAL_ROLES) — não é
// uma trava no schema, `role` continua string livre (ver
// decisoes-pos-descoberta.md #2). Sem create aqui: um User só nasce via o
// bootstrap de login (AuthService.ensureAccountAndUser), não por criação
// direta na API — não existe convite/pré-cadastro de conta ainda.
export const userUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  role: z.string().min(1).optional(),
  specialty: z.string().min(1).optional(),
  costPerHour: z.number().nonnegative().optional(),
  weeklyCapacityHours: z.number().positive().optional(),
  // Só um admin pode de fato setar isto -- ver UsersController.update, que
  // remove o campo do input antes de chegar aqui se quem pediu não for
  // admin. Fica no schema (não só no controller) porque validar o
  // formato é responsabilidade do schema; quem pode setar é autorização,
  // não validação.
  accessLevel: z.enum(['admin', 'staff']).optional(),
});

export type UserUpdateInput = z.infer<typeof userUpdateSchema>;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  listUsers(accountId: string) {
    return this.prisma.db.user.findMany({
      where: { accountId },
      orderBy: { name: 'asc' },
    });
  }

  async getUser(accountId: string, id: string) {
    const user = await this.prisma.db.user.findFirst({
      where: { id, accountId },
    });
    if (!user) {
      throw new NotFoundError('Colaborador');
    }
    return user;
  }

  async updateUser(accountId: string, id: string, input: UserUpdateInput) {
    await this.getUser(accountId, id);
    return this.prisma.db.user.update({ where: { id }, data: input });
  }

  // A chave de API (usada pela extensão Captura para autenticar POST
  // /v1/products direto do navegador -- ver AuthGuard) só existe em texto
  // puro aqui, no retorno desta chamada; só o hash sha-256 é persistido.
  // Regenerar sobrescreve o hash antigo, invalidando a chave anterior sem
  // precisar de um passo de revogação separado.
  async generateApiKey(accountId: string, id: string): Promise<string> {
    await this.getUser(accountId, id);
    const apiKey = `araci_${randomBytes(24).toString('base64url')}`;
    const apiKeyHash = createHash('sha256').update(apiKey).digest('hex');
    await this.prisma.db.user.update({ where: { id }, data: { apiKeyHash } });
    return apiKey;
  }

  async revokeApiKey(accountId: string, id: string): Promise<void> {
    await this.getUser(accountId, id);
    await this.prisma.db.user.update({
      where: { id },
      data: { apiKeyHash: null },
    });
  }
}
