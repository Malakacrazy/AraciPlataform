import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';
import { ApiError, NotFoundError } from '../common/api-error';

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
  category: z.string().optional(),
  variantOfId: z.string().min(1).optional(),
  variantLabel: z.string().min(1).optional(),
});

export type ProductInput = z.infer<typeof productInputSchema>;

const productListInclude = {
  images: { orderBy: { order: 'asc' as const } },
  variantOf: { select: { id: true, name: true } },
  variants: { select: { id: true, name: true, variantLabel: true, price: true } },
};

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  listProducts(accountId: string) {
    return this.prisma.db.product.findMany({
      where: { accountId },
      include: productListInclude,
      orderBy: { name: 'asc' },
    });
  }

  async getProduct(accountId: string, id: string) {
    const product = await this.prisma.db.product.findFirst({
      where: { id, accountId },
      include: productListInclude,
    });
    if (!product) {
      throw new NotFoundError('Produto');
    }
    return product;
  }

  // Só um nível de variante: o produto apontado por variantOfId não pode
  // ele mesmo ser uma variante (senão vira árvore), e o produto sendo
  // salvo não pode já ser pai de outras variantes (senão viraria variante
  // e pai ao mesmo tempo). FK sozinha não expressa nenhuma das duas.
  private async validateVariantOf(
    accountId: string,
    currentId: string | null,
    variantOfId: string,
  ) {
    if (variantOfId === currentId) {
      throw new ApiError('INVALID_VARIANT', 'Um produto não pode ser variante de si mesmo.', 422);
    }
    const target = await this.prisma.db.product.findFirst({
      where: { id: variantOfId, accountId },
      select: { id: true, variantOfId: true },
    });
    if (!target) {
      throw new NotFoundError('Produto pai (variantOfId)');
    }
    if (target.variantOfId !== null) {
      throw new ApiError(
        'INVALID_VARIANT',
        'Esse produto já é uma variante de outro — não pode ter sub-variante.',
        422,
      );
    }
    if (currentId) {
      const childCount = await this.prisma.db.product.count({ where: { variantOfId: currentId } });
      if (childCount > 0) {
        throw new ApiError(
          'INVALID_VARIANT',
          'Este produto já é pai de outras variantes — não pode virar variante de outro produto.',
          422,
        );
      }
    }
  }

  // O Captura reenvia o mesmo item toda vez que o orçamento é mandado de
  // novo (o usuário reabre a Biblioteca, clica "Enviar" outra vez) --
  // sem upsert, cada reenvio duplicava o Product no catálogo. sourceUrl é
  // o único identificador estável de origem que a extensão manda; sem
  // ele (cadastro manual pela própria plataforma) sempre cria novo,
  // porque não há como saber se é "o mesmo" produto.
  async createProduct(accountId: string, input: ProductInput) {
    if (input.variantOfId) {
      if (!input.variantLabel) {
        throw new ApiError(
          'INVALID_VARIANT',
          'variantLabel é obrigatório junto de variantOfId — sem rótulo, a variante fica indistinguível do produto pai na tela.',
          422,
        );
      }
      await this.validateVariantOf(accountId, null, input.variantOfId);
    }
    if (input.sourceUrl) {
      const existing = await this.prisma.db.product.findFirst({
        where: { accountId, sourceUrl: input.sourceUrl },
      });
      if (existing) {
        return this.prisma.db.product.update({
          where: { id: existing.id },
          data: input,
          include: productListInclude,
        });
      }
    }
    return this.prisma.db.product.create({
      data: { ...input, accountId },
      include: productListInclude,
    });
  }

  async updateProduct(
    accountId: string,
    id: string,
    input: Partial<ProductInput>,
  ) {
    await this.getProduct(accountId, id);
    if (input.variantOfId) {
      await this.validateVariantOf(accountId, id, input.variantOfId);
    }
    return this.prisma.db.product.update({
      where: { id },
      data: input,
      include: productListInclude,
    });
  }

  async deleteProduct(accountId: string, id: string) {
    await this.getProduct(accountId, id);
    await this.prisma.db.product.delete({ where: { id } });
  }

  async addImage(accountId: string, productId: string, url: string) {
    await this.getProduct(accountId, productId);
    const count = await this.prisma.db.productImage.count({ where: { productId } });
    return this.prisma.db.productImage.create({
      data: { productId, url, order: count },
    });
  }

  async removeImage(accountId: string, id: string) {
    const image = await this.prisma.db.productImage.findFirst({
      where: { id, product: { accountId } },
    });
    if (!image) {
      throw new NotFoundError('Imagem do produto');
    }
    await this.prisma.db.productImage.delete({ where: { id } });
  }
}
