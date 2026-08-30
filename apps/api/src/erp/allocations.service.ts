import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';
import { ApiError, NotFoundError } from '../common/api-error';
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

  // Mesmo sweep-line de peakHoursInWindow (apps/web/src/lib/allocations.ts)
  // -- duplicado aqui, não importado, porque é a única lógica de negócio
  // pequena o bastante pra não justificar um pacote compartilhado só pra
  // ela, e opera sobre o Decimal do Prisma, não o tipo de fetch do
  // frontend. Achado real de revisão: o cálculo só existia no frontend
  // como aviso visual -- uma chamada direta à API passava por cima dele
  // sem nenhuma rejeição.
  private peakHoursInWindow(
    allocations: { hoursPerWeek: unknown; startDate: Date; endDate: Date }[],
    windowStart: Date,
    windowEnd: Date,
  ): number {
    const events: Array<[number, number]> = [];
    for (const alloc of allocations) {
      const allocStart = alloc.startDate.getTime();
      const allocEnd = alloc.endDate.getTime();
      if (allocEnd < windowStart.getTime() || allocStart > windowEnd.getTime()) continue;
      const hours = Number(alloc.hoursPerWeek);
      events.push([Math.max(allocStart, windowStart.getTime()), hours]);
      events.push([Math.min(allocEnd, windowEnd.getTime()), -hours]);
    }
    events.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    let running = 0;
    let peak = 0;
    for (const [, delta] of events) {
      running += delta;
      peak = Math.max(peak, running);
    }
    return peak;
  }

  // Sem alocar "em nome de outra pessoa" restrito aqui como em
  // createTimeEntry -- alocação é decisão de quem gerencia o time, não do
  // próprio colaborador, então userId vem do corpo mesmo (não da sessão).
  async createAllocation(accountId: string, input: AllocationInput) {
    await this.projectsService.getProject(accountId, input.projectId);
    const user = await this.usersService.getUser(accountId, input.userId);

    // Sem weeklyCapacityHours cadastrado não dá pra dizer "excede a
    // capacidade" -- mesmo espírito de allocationCost (frontend) tratando
    // custo/hora ausente como "não sei calcular", não como zero.
    if (user.weeklyCapacityHours != null) {
      const existing = await this.prisma.db.allocation.findMany({
        where: { userId: input.userId, project: { accountId } },
        select: { hoursPerWeek: true, startDate: true, endDate: true },
      });
      const startDate = new Date(input.startDate);
      const endDate = new Date(input.endDate);
      const peak = this.peakHoursInWindow(
        [...existing, { hoursPerWeek: input.hoursPerWeek, startDate, endDate }],
        startDate,
        endDate,
      );
      const capacity = Number(user.weeklyCapacityHours);
      if (peak > capacity) {
        throw new ApiError(
          'ALLOCATION_OVER_CAPACITY',
          `Esta alocação levaria ${user.name} a ${peak}h/semana no período, acima da capacidade cadastrada (${capacity}h/semana).`,
          422,
        );
      }
    }

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
