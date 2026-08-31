import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';
import { NotFoundError } from '../common/api-error';
import { UsersService } from './users.service';

export const absenceInputSchema = z
  .object({
    userId: z.string().min(1),
    startDate: z.iso.datetime(),
    endDate: z.iso.datetime(),
    type: z.string().min(1).optional(),
  })
  .refine((data) => new Date(data.endDate) > new Date(data.startDate), {
    message: 'Data de término deve ser depois da data de início.',
    path: ['endDate'],
  });

export type AbsenceInput = z.infer<typeof absenceInputSchema>;

@Injectable()
export class AbsencesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
  ) {}

  // Achado A41 da auditoria de 30 ago 2026: `include: { user: true }`
  // trazia o User inteiro (inclusive costPerHour) pra qualquer staff --
  // terceira superfície com o mesmo vazamento de UsersController/
  // AllocationsController (que usam um redactCost por cima do include),
  // a única sem tratamento nenhum. Aqui, em vez de repetir o redactCost,
  // um `select` explícito com só o que a tela usa (nome, pra exibir "Fulano
  // — Férias"): uma coluna sensível nova no User não vaza por padrão de
  // novo, nem que outra tela venha a consumir esta lista sem redigir.
  listAbsences(accountId: string, filters: { userId?: string } = {}) {
    return this.prisma.db.absence.findMany({
      where: {
        user: { accountId },
        ...(filters.userId ? { userId: filters.userId } : {}),
      },
      select: {
        id: true,
        userId: true,
        startDate: true,
        endDate: true,
        type: true,
        createdAt: true,
        user: { select: { id: true, name: true } },
      },
      orderBy: { startDate: 'asc' },
    });
  }

  private async getAbsence(accountId: string, id: string) {
    const absence = await this.prisma.db.absence.findFirst({
      where: { id, user: { accountId } },
    });
    if (!absence) {
      throw new NotFoundError('Ausência');
    }
    return absence;
  }

  // Mesmo raciocínio de AllocationsService.createAllocation -- quem
  // registra a ausência é quem gerencia o time, não necessariamente a
  // própria pessoa, então userId vem do corpo.
  async createAbsence(accountId: string, input: AbsenceInput) {
    await this.usersService.getUser(accountId, input.userId);

    return this.prisma.db.absence.create({
      data: {
        userId: input.userId,
        startDate: new Date(input.startDate),
        endDate: new Date(input.endDate),
        type: input.type,
      },
      include: { user: true },
    });
  }

  async deleteAbsence(accountId: string, id: string) {
    await this.getAbsence(accountId, id);
    await this.prisma.db.absence.delete({ where: { id } });
  }
}
