import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';
import { NotFoundError } from '../common/api-error';
import { ProjectsService } from '../erp/projects.service';

export const areaInputSchema = z.object({
  name: z.string().min(1), // ex.: "Sala de estar", "Quarto principal"
});

export type AreaInput = z.infer<typeof areaInputSchema>;

@Injectable()
export class AreasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projectsService: ProjectsService,
  ) {}

  async listAreas(accountId: string, projectId: string) {
    await this.projectsService.getProject(accountId, projectId);
    return this.prisma.db.area.findMany({ where: { projectId }, orderBy: { name: 'asc' } });
  }

  async getArea(accountId: string, id: string) {
    const area = await this.prisma.db.area.findFirst({ where: { id, project: { accountId } } });
    if (!area) {
      throw new NotFoundError('Ambiente');
    }
    return area;
  }

  async createArea(accountId: string, projectId: string, input: AreaInput) {
    await this.projectsService.getProject(accountId, projectId);
    return this.prisma.db.area.create({ data: { ...input, projectId } });
  }

  async deleteArea(accountId: string, id: string) {
    await this.getArea(accountId, id);
    await this.prisma.db.area.delete({ where: { id } });
  }
}
