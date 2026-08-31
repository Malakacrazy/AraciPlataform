import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';
import { ApiError, NotFoundError, ForbiddenError } from '../common/api-error';
import { ProjectsService } from './projects.service';
import { RoleRatesService } from './role-rates.service';
import { UsersService } from './users.service';

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
    private readonly roleRatesService: RoleRatesService,
    private readonly usersService: UsersService,
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

  // Achado A5 da auditoria de 30 ago 2026: sem isso, qualquer staff podia
  // editar/apagar o lançamento de QUALQUER colega (a checagem antiga só
  // olhava o tenant, nunca o dono) -- inclusive remover horas de outra
  // pessoa antes que fossem aprovadas, ou inflar as próprias. Admin
  // continua podendo mexer em qualquer lançamento (é quem vai aprovar
  // e/ou corrigir erro de lançamento de outra pessoa).
  private assertOwnerOrAdmin(entry: { userId: string }, callerUserId: string, callerAccessLevel: string) {
    if (callerAccessLevel !== 'admin' && entry.userId !== callerUserId) {
      throw new ForbiddenError('Você só pode alterar os próprios lançamentos de horas.');
    }
  }

  async updateTimeEntry(
    accountId: string,
    id: string,
    callerUserId: string,
    callerAccessLevel: string,
    input: Partial<TimeEntryInput>,
  ) {
    const entry = await this.getTimeEntry(accountId, id);
    this.assertOwnerOrAdmin(entry, callerUserId, callerAccessLevel);
    this.assertNotApproved(entry);
    // Achado real de revisão: faltava aqui a mesma checagem de
    // createTimeEntry -- sem isso, um projectId/phaseId de OUTRA conta
    // passava direto (Prisma só confere que a FK existe, não o tenant),
    // movendo o lançamento pra fora da conta original.
    const projectId = input.projectId ?? entry.projectId;
    if (input.projectId) {
      await this.projectsService.getProject(accountId, input.projectId);
    }
    if (input.phaseId) {
      const phase = await this.prisma.db.projectPhase.findFirst({
        where: { id: input.phaseId, projectId },
      });
      if (!phase) {
        throw new NotFoundError('Fase do projeto');
      }
    }
    // Achado A8: quando o projeto muda e nenhum phaseId novo vem junto, o
    // spread de `input` abaixo não tocaria a coluna -- o lançamento ficava
    // no projeto novo com o phaseId de uma fase do projeto ANTIGO
    // (createHourlyInvoice hoje também escopa por projectId+phaseId, mas
    // não custa nada não deixar o dado inconsistente gravado).
    const clearStalePhase =
      input.projectId !== undefined && input.projectId !== entry.projectId && input.phaseId === undefined;
    return this.prisma.db.timeEntry.update({
      where: { id },
      data: {
        ...input,
        phaseId: clearStalePhase ? null : input.phaseId,
        date: input.date ? new Date(input.date) : undefined,
      },
    });
  }

  async deleteTimeEntry(accountId: string, id: string, callerUserId: string, callerAccessLevel: string) {
    const entry = await this.getTimeEntry(accountId, id);
    this.assertOwnerOrAdmin(entry, callerUserId, callerAccessLevel);
    this.assertNotApproved(entry);
    await this.prisma.db.timeEntry.delete({ where: { id } });
  }

  // Aprovação de horas por gestor ou responsável antes do fechamento do
  // período (plano original, seção ERP Arquitetura). approverUserId é
  // quem está aprovando (o usuário autenticado fazendo a chamada), não
  // quem lançou a hora. @AdminOnly() no controller resolve o achado A5
  // (qualquer staff podia se autoaprovar) -- deliberadamente SEM bloquear
  // entry.userId === approverUserId: um estúdio de UMA pessoa (o caso
  // real de hoje) tem o admin aprovando o próprio apontamento o tempo
  // todo, e travar isso tornaria o faturamento por hora impossível pra
  // esse operador único (a própria auditoria sinaliza essa correção
  // "óbvia" como pior que o problema).
  //
  // Achado A7: congela a RoleRate do papel de quem lançou a hora NO
  // MOMENTO da aprovação -- sem isso, faturar meses depois usa a tarifa
  // de HOJE pra horas trabalhadas quando a tarifa era outra. Deixa null
  // (sem bloquear a aprovação) se ainda não existe tarifa cadastrada pro
  // papel -- o mesmo ROLE_RATE_MISSING de sempre aparece só na hora de
  // faturar, não aqui.
  async approveTimeEntry(
    accountId: string,
    id: string,
    approverUserId: string,
  ) {
    const entry = await this.getTimeEntry(accountId, id);
    const owner = await this.usersService.getUser(accountId, entry.userId);
    const roleRates = await this.roleRatesService.listRoleRates(accountId);
    const rate = roleRates.find((r) => r.role === owner.role);
    return this.prisma.db.timeEntry.update({
      where: { id },
      data: {
        approvedAt: new Date(),
        approvedById: approverUserId,
        approvedHourlyRate: rate ? rate.hourlyRate : null,
      },
    });
  }
}
