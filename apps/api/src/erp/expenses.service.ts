import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';
import { NotFoundError } from '../common/api-error';
import { ProjectsService } from './projects.service';

export const createExpenseSchema = z.object({
  description: z.string().min(1).max(500),
  category: z.string().min(1).max(100),
  amount: z.number().positive(),
  projectId: z.string().min(1).optional(),
  dueDate: z.iso.datetime().optional(),
});

export type CreateExpenseInput = z.infer<typeof createExpenseSchema>;

export const expenseStatusUpdateSchema = z.object({
  status: z.enum(['pendente', 'paga']),
  paidAt: z.iso.datetime().nullable().optional(),
});

export type ExpenseStatusUpdate = z.infer<typeof expenseStatusUpdateSchema>;

@Injectable()
export class ExpensesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projectsService: ProjectsService,
  ) {}

  listExpenses(accountId: string, projectId?: string) {
    return this.prisma.db.expense.findMany({
      where: { accountId, ...(projectId ? { projectId } : {}) },
      include: { project: { select: { id: true, name: true } } },
      orderBy: { dueDate: 'asc' },
    });
  }

  async getExpense(accountId: string, id: string) {
    const expense = await this.prisma.db.expense.findFirst({
      where: { id, accountId },
      include: { project: { select: { id: true, name: true } } },
    });
    if (!expense) {
      throw new NotFoundError('Despesa');
    }
    return expense;
  }

  // projectId é opcional (despesa de estrutura do estúdio, sem projeto
  // nenhum) -- só valida escopo/existência quando de fato informado.
  async createExpense(accountId: string, input: CreateExpenseInput) {
    if (input.projectId) {
      await this.projectsService.getProject(accountId, input.projectId);
    }
    return this.prisma.db.expense.create({
      data: {
        accountId,
        projectId: input.projectId,
        description: input.description,
        category: input.category,
        amount: input.amount,
        status: 'pendente',
        dueDate: input.dueDate ? new Date(input.dueDate) : undefined,
      },
      include: { project: { select: { id: true, name: true } } },
    });
  }

  async updateExpenseStatus(accountId: string, id: string, input: ExpenseStatusUpdate) {
    await this.getExpense(accountId, id);
    return this.prisma.db.expense.update({
      where: { id },
      data: {
        status: input.status,
        paidAt:
          input.paidAt === undefined
            ? undefined
            : input.paidAt === null
              ? null
              : new Date(input.paidAt),
      },
      include: { project: { select: { id: true, name: true } } },
    });
  }

  // Diferente de Invoice (sem DELETE -- fatura já emitida/paga é fato
  // fiscal consumado): uma Expense é lançamento manual interno, então
  // corrigir um erro de digitação apagando de vez é seguro e útil.
  async deleteExpense(accountId: string, id: string) {
    await this.getExpense(accountId, id);
    await this.prisma.db.expense.delete({ where: { id } });
  }
}
