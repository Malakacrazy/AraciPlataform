import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';
import { NotFoundError } from '../common/api-error';

export const createStudioFixedCostSchema = z.object({
  description: z.string().min(1),
  monthlyAmount: z.number().nonnegative(),
});

export type CreateStudioFixedCostInput = z.infer<
  typeof createStudioFixedCostSchema
>;

@Injectable()
export class StudioFixedCostsService {
  constructor(private readonly prisma: PrismaService) {}

  listFixedCosts(accountId: string) {
    return this.prisma.db.studioFixedCost.findMany({
      where: { accountId },
      orderBy: { createdAt: 'asc' },
    });
  }

  createFixedCost(accountId: string, input: CreateStudioFixedCostInput) {
    return this.prisma.db.studioFixedCost.create({
      data: { accountId, ...input },
    });
  }

  async deleteFixedCost(accountId: string, id: string) {
    const cost = await this.prisma.db.studioFixedCost.findFirst({
      where: { id, accountId },
    });
    if (!cost) {
      throw new NotFoundError('Custo fixo do estúdio');
    }
    await this.prisma.db.studioFixedCost.delete({ where: { id } });
  }

  // Usado por RoleRatesService pra calcular overhead/hora (aba 01) sem
  // duplicar a query -- soma direto no banco em vez de buscar todas as
  // linhas e somar em JS, já que o único uso é o total.
  async sumMonthlyFixedCosts(accountId: string): Promise<number> {
    const result = await this.prisma.db.studioFixedCost.aggregate({
      where: { accountId },
      _sum: { monthlyAmount: true },
    });
    return Number(result._sum.monthlyAmount ?? 0);
  }
}
