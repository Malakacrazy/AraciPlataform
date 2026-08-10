import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';
import { ApiError, NotFoundError } from '../common/api-error';
import { ProjectsService } from './projects.service';

export const timeEntryInputSchema = z.object({
  projectId: z.string().min(1),
  phaseId: z.string().min(1).optional(),
  date: z.iso.datetime(),
  hours: z.number().positive(),
  billable: z.boolean().optional(),
  activityType: z.enum(['projeto', 'administrativo', 'comercial']),
});

export type TimeEntryInput = z.infer<typeof timeEntryInputSchema>;

@Injectable()
export class TimeEntriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projectsService: ProjectsService,
  ) {}

  listTimeEntries(
    accountId: string,
    filters: { projectId?: string; userId?: string } = {},
  ) {
    return this.prisma.db.timeEntry.findMany({
      where: {
        project: { accountId },
        ...(filters.projectId ? { projectId: filters.projectId } : {}),
        ...(filters.userId ? { userId: filters.userId } : {}),
      },
      orderBy: { date: 'desc' },
    });
  }

  private async getTimeEntry(accountId: string, id: string) {
    const entry = await this.prisma.db.timeEntry.findFirst({
      where: { id, project: { accountId } },
    });
    if (!entry) {
      throw new NotFoundError('Lançamento de horas');
    }
    return entry;
  }

  // Quem lança a hora é sempre o usuário autenticado (userId vem da
  // sessão, não do corpo da requisição) — não existe "lançar hora em nome
  // de outra pessoa" nesta API.
  async createTimeEntry(
    accountId: string,
    userId: string,
    input: TimeEntryInput,
  ) {
    await this.projectsService.getProject(accountId, input.projectId);
    if (input.phaseId) {
      const phase = await this.prisma.db.projectPhase.findFirst({
        where: { id: input.phaseId, projectId: input.projectId },
      });
      if (!phase) {
        throw new NotFoundError('Fase do projeto');
      }
    }

    return this.prisma.db.timeEntry.create({
      data: {
        userId,
        projectId: input.projectId,
        phaseId: input.phaseId,
        date: new Date(input.date),
        hours: input.hours,
        billable: input.billable ?? true,
        activityType: input.activityType,
      },
    });
  }

  private assertNotApproved(entry: { approvedAt: Date | null }) {
    if (entry.approvedAt) {
      throw new ApiError(
        'TIME_ENTRY_APPROVED',
        'Este lançamento já foi aprovado pelo gestor e não pode mais ser alterado.',
        422,
      );
    }
  }

  async updateTimeEntry(
    accountId: string,
    id: string,
    input: Partial<TimeEntryInput>,
  ) {
    const entry = await this.getTimeEntry(accountId, id);
    this.assertNotApproved(entry);
    return this.prisma.db.timeEntry.update({
      where: { id },
      data: { ...input, date: input.date ? new Date(input.date) : undefined },
    });
  }

  async deleteTimeEntry(accountId: string, id: string) {
    const entry = await this.getTimeEntry(accountId, id);
    this.assertNotApproved(entry);
    await this.prisma.db.timeEntry.delete({ where: { id } });
  }

  // Aprovação de horas por gestor ou responsável antes do fechamento do
  // período (plano original, seção ERP Arquitetura). approverUserId é
  // quem está aprovando (o usuário autenticado fazendo a chamada), não
  // quem lançou a hora.
  async approveTimeEntry(
    accountId: string,
    id: string,
    approverUserId: string,
  ) {
    await this.getTimeEntry(accountId, id);
    return this.prisma.db.timeEntry.update({
      where: { id },
      data: { approvedAt: new Date(), approvedById: approverUserId },
    });
  }
}
