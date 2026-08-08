import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';
import { NotFoundError } from '../common/api-error';

export const roleRateInputSchema = z.object({
  role: z.string().min(1),
  hourlyRate: z.number().positive(),
});

export type RoleRateInput = z.infer<typeof roleRateInputSchema>;

@Injectable()
export class RoleRatesService {
  constructor(private readonly prisma: PrismaService) {}

  listRoleRates(accountId: string) {
    return this.prisma.db.roleRate.findMany({ where: { accountId }, orderBy: { role: 'asc' } });
  }

  // Upsert por (accountId, role) — "role" continua string livre em vez de
  // enum (nomenclatura canônica de referência em ../roles.ts, não uma
  // trava de banco — ver decisoes-pos-descoberta.md #2).
  upsertRoleRate(accountId: string, input: RoleRateInput) {
    return this.prisma.db.roleRate.upsert({
      where: { accountId_role: { accountId, role: input.role } },
      update: { hourlyRate: input.hourlyRate },
      create: { accountId, role: input.role, hourlyRate: input.hourlyRate },
    });
  }

  async deleteRoleRate(accountId: string, id: string) {
    const rate = await this.prisma.db.roleRate.findFirst({ where: { id, accountId } });
    if (!rate) {
      throw new NotFoundError('Tarifa de papel');
    }
    await this.prisma.db.roleRate.delete({ where: { id } });
  }
}
