import { Injectable } from '@nestjs/common';
import { z } from 'zod';
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
}
