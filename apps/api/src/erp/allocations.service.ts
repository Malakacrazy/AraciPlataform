import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';
import { NotFoundError } from '../common/api-error';
import { ProjectsService } from './projects.service';
import { UsersService } from './users.service';

export const allocationInputSchema = z
  .object({
    userId: z.string().min(1),
    projectId: z.string().min(1),
    hoursPerWeek: z.number().positive(),
    startDate: z.iso.datetime(),
    endDate: z.iso.datetime(),
  })
  .refine((data) => new Date(data.endDate) > new Date(data.startDate), {
    message: 'Data de término deve ser depois da data de início.',
    path: ['endDate'],
  });

export type AllocationInput = z.infer<typeof allocationInputSchema>;

@Injectable()
export class AllocationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projectsService: ProjectsService,
    private readonly usersService: UsersService,
  ) {}

  listAllocations(
    accountId: string,
    filters: { userId?: string; projectId?: string } = {},
  ) {
    return this.prisma.db.allocation.findMany({
      where: {
        project: { accountId },
        ...(filters.userId ? { userId: filters.userId } : {}),
        ...(filters.projectId ? { projectId: filters.projectId } : {}),
      },
      include: {
        user: true,
        project: { include: { phases: true, client: true } },
      },
      orderBy: { startDate: 'asc' },
    });
  }

  private async getAllocation(accountId: string, id: string) {
    const allocation = await this.prisma.db.allocation.findFirst({
      where: { id, project: { accountId } },
    });
    if (!allocation) {
      throw new NotFoundError('Alocação');
    }
    return allocation;
  }

  // Sem alocar "em nome de outra pessoa" restrito aqui como em
  // createTimeEntry -- alocação é decisão de quem gerencia o time, não do
  // próprio colaborador, então userId vem do corpo mesmo (não da sessão).
  async createAllocation(accountId: string, input: AllocationInput) {
    await this.projectsService.getProject(accountId, input.projectId);
    await this.usersService.getUser(accountId, input.userId);

    return this.prisma.db.allocation.create({
      data: {
        userId: input.userId,
        projectId: input.projectId,
        hoursPerWeek: input.hoursPerWeek,
        startDate: new Date(input.startDate),
        endDate: new Date(input.endDate),
      },
      include: {
        user: true,
        project: { include: { phases: true, client: true } },
      },
    });
  }

  async deleteAllocation(accountId: string, id: string) {
    await this.getAllocation(accountId, id);
    await this.prisma.db.allocation.delete({ where: { id } });
  }
}
