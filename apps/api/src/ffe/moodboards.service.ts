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

// Um item é um Product real (kind="product", exige productId) ou uma
// amostra de material/tecido sem produto nenhum no catálogo (kind=
// "swatch", exige label + pelo menos uma forma de mostrar a amostra --
// cor sólida ou foto). x/y/width são opcionais na criação -- o service
// calcula um deslocamento em cascata quando ausentes, pra um item novo
// não nascer exatamente empilhado sobre o anterior no canvas.
export const moodboardItemInputSchema = z
  .object({
    kind: z.enum(['product', 'swatch']).default('product'),
    productId: z.string().min(1).optional(),
    label: z.string().min(1).optional(),
    colorHex: z
      .string()
      .regex(/^#[0-9a-f]{6}$/i, 'Cor precisa ser hex no formato #rrggbb.')
      .optional(),
    swatchImageUrl: z.string().url().optional(),
    x: z.number().optional(),
    y: z.number().optional(),
    width: z.number().positive().optional(),
  })
  .refine((v) => (v.kind === 'product' ? !!v.productId : !!v.label && (!!v.colorHex || !!v.swatchImageUrl)), {
    message:
      'Item "product" exige productId; item "swatch" exige label + (colorHex ou swatchImageUrl).',
  });

export type MoodboardItemInput = z.infer<typeof moodboardItemInputSchema>;

// PATCH separado do create -- mover/redimensionar/trazer-pra-frente no
// canvas é uma ação de layout, não uma edição de conteúdo (não faz
// sentido reenviar kind/productId/label pra só mudar a posição).
export const moodboardItemLayoutSchema = z.object({
  x: z.number().optional(),
  y: z.number().optional(),
  width: z.number().positive().optional(),
  bringToFront: z.boolean().optional(),
});

export type MoodboardItemLayoutInput = z.infer<typeof moodboardItemLayoutSchema>;

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
    const board = await this.getMoodboard(accountId, moodboardId);

    const nextOrder = board.items.length > 0 ? Math.max(...board.items.map((i) => i.order)) + 1 : 0;
    // Cascata de 24px repetindo a cada 8 itens, pra um item novo não
    // nascer exatamente empilhado sobre o anterior sem sair do canvas
    // visível indefinidamente.
    const cascade = (board.items.length % 8) * 24;
    const x = input.x ?? 24 + cascade;
    const y = input.y ?? 24 + cascade;

    if (input.kind === 'swatch') {
      return this.prisma.db.moodboardItem.create({
        data: {
          moodboardId,
          kind: 'swatch',
          label: input.label,
          colorHex: input.colorHex,
          swatchImageUrl: input.swatchImageUrl,
          x,
          y,
          width: input.width ?? 120,
          order: nextOrder,
        },
        include: { product: true },
      });
    }

    await this.productsService.getProduct(accountId, input.productId!); // 404 se o produto não é desta conta
    return this.prisma.db.moodboardItem.create({
      data: {
        moodboardId,
        kind: 'product',
        productId: input.productId,
        x,
        y,
        width: input.width ?? 180,
        order: nextOrder,
      },
      include: { product: true },
    });
  }

  async updateItemLayout(accountId: string, itemId: string, input: MoodboardItemLayoutInput) {
    const item = await this.prisma.db.moodboardItem.findFirst({
      where: { id: itemId, moodboard: { project: { accountId } } },
      include: { moodboard: { include: { items: true } } },
    });
    if (!item) {
      throw new NotFoundError('Item da prancha');
    }

    const order = input.bringToFront
      ? Math.max(...item.moodboard.items.map((i) => i.order)) + 1
      : item.order;

    return this.prisma.db.moodboardItem.update({
      where: { id: itemId },
      data: {
        x: input.x,
        y: input.y,
        width: input.width,
        order,
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
