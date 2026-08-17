import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';
import { NotFoundError } from '../common/api-error';
import { ProjectsService } from '../erp/projects.service';
import { ProductsService } from './products.service';

export const moodboardInputSchema = z.object({
  name: z.string().min(1), // ex.: "Sala de Estar — Conceito 1"
});

export type MoodboardInput = z.infer<typeof moodboardInputSchema>;

export const moodboardItemInputSchema = z.object({
  productId: z.string().min(1),
  order: z.number().int().nonnegative().optional(),
});

export type MoodboardItemInput = z.infer<typeof moodboardItemInputSchema>;

const withItems = {
  items: { include: { product: true }, orderBy: { order: 'asc' as const } },
};

@Injectable()
export class MoodboardsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projectsService: ProjectsService,
    private readonly productsService: ProductsService,
  ) {}

  async listMoodboards(accountId: string, projectId: string) {
    await this.projectsService.getProject(accountId, projectId);
    return this.prisma.db.moodboard.findMany({
      where: { projectId },
      include: withItems,
      orderBy: { createdAt: 'asc' },
    });
  }

  async getMoodboard(accountId: string, id: string) {
    const moodboard = await this.prisma.db.moodboard.findFirst({
      where: { id, project: { accountId } },
      include: withItems,
    });
    if (!moodboard) {
      throw new NotFoundError('Prancha');
    }
    return moodboard;
  }

  async createMoodboard(
    accountId: string,
    projectId: string,
    input: MoodboardInput,
  ) {
    await this.projectsService.getProject(accountId, projectId);
    return this.prisma.db.moodboard.create({
      data: { ...input, projectId },
      include: withItems,
    });
  }

  async deleteMoodboard(accountId: string, id: string) {
    await this.getMoodboard(accountId, id);
    // MoodboardItem cascade no schema — itens somem junto, produtos do
    // catálogo não são afetados (FK de MoodboardItem para Product não é
    // cascade, só a de MoodboardItem para Moodboard).
    await this.prisma.db.moodboard.delete({ where: { id } });
  }

  async addItem(
    accountId: string,
    moodboardId: string,
    input: MoodboardItemInput,
  ) {
    await this.getMoodboard(accountId, moodboardId);
    await this.productsService.getProduct(accountId, input.productId); // 404 se o produto não é desta conta
    return this.prisma.db.moodboardItem.create({
      data: {
        moodboardId,
        productId: input.productId,
        order: input.order ?? 0,
      },
      include: { product: true },
    });
  }

  async removeItem(accountId: string, itemId: string) {
    const item = await this.prisma.db.moodboardItem.findFirst({
      where: { id: itemId, moodboard: { project: { accountId } } },
    });
    if (!item) {
      throw new NotFoundError('Item da prancha');
    }
    await this.prisma.db.moodboardItem.delete({ where: { id: itemId } });
  }
}
