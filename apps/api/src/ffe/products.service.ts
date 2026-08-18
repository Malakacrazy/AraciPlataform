import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';
import { NotFoundError } from '../common/api-error';

export const productInputSchema = z.object({
  name: z.string().min(1),
  supplier: z.string().optional(),
  price: z.number().nonnegative().optional(),
  dimensions: z.string().optional(),
  finish: z.string().optional(),
  leadTimeDays: z.number().int().nonnegative().optional(),
  imageUrl: z.url().optional(),
  sourceUrl: z.url().optional(), // preenchido quando capturado via Captura/web scraper
  isGeneric: z.boolean().optional(), // placeholder quando o SKU ainda não foi escolhido
});

export type ProductInput = z.infer<typeof productInputSchema>;

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  listProducts(accountId: string) {
    return this.prisma.db.product.findMany({
      where: { accountId },
      orderBy: { name: 'asc' },
    });
  }

  async getProduct(accountId: string, id: string) {
    const product = await this.prisma.db.product.findFirst({
      where: { id, accountId },
    });
    if (!product) {
      throw new NotFoundError('Produto');
    }
    return product;
  }

  // O Captura reenvia o mesmo item toda vez que o orçamento é mandado de
  // novo (o usuário reabre a Biblioteca, clica "Enviar" outra vez) --
  // sem upsert, cada reenvio duplicava o Product no catálogo. sourceUrl é
  // o único identificador estável de origem que a extensão manda; sem
  // ele (cadastro manual pela própria plataforma) sempre cria novo,
  // porque não há como saber se é "o mesmo" produto.
  async createProduct(accountId: string, input: ProductInput) {
    if (input.sourceUrl) {
      const existing = await this.prisma.db.product.findFirst({
        where: { accountId, sourceUrl: input.sourceUrl },
      });
      if (existing) {
        return this.prisma.db.product.update({
          where: { id: existing.id },
          data: input,
        });
      }
    }
    return this.prisma.db.product.create({ data: { ...input, accountId } });
  }

  async updateProduct(
    accountId: string,
    id: string,
    input: Partial<ProductInput>,
  ) {
    await this.getProduct(accountId, id);
    return this.prisma.db.product.update({ where: { id }, data: input });
  }

  async deleteProduct(accountId: string, id: string) {
    await this.getProduct(accountId, id);
    await this.prisma.db.product.delete({ where: { id } });
  }
}
