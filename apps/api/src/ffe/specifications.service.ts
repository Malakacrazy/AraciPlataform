import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';
import { ApiError, NotFoundError } from '../common/api-error';
import { ProjectsService } from '../erp/projects.service';
import { AreasService } from './areas.service';
import { ProductsService } from './products.service';

export const specificationInputSchema = z.object({
  productId: z.string().min(1),
  quantity: z.number().int().positive().optional(),
  unitPrice: z.number().nonnegative().optional(),
  markupPercent: z.number().nonnegative().optional(),
});

export type SpecificationInput = z.infer<typeof specificationInputSchema>;

export const specificationUpdateSchema = z.object({
  quantity: z.number().int().positive().optional(),
  unitPrice: z.number().nonnegative().optional(),
  markupPercent: z.number().nonnegative().optional(),
  clientApproved: z.boolean().optional(),
  clientComment: z.string().optional(),
});

export type SpecificationUpdateInput = z.infer<typeof specificationUpdateSchema>;

@Injectable()
export class SpecificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projectsService: ProjectsService,
    private readonly areasService: AreasService,
    private readonly productsService: ProductsService,
  ) {}

  async listSpecifications(accountId: string, areaId: string) {
    await this.areasService.getArea(accountId, areaId);
    return this.prisma.db.productSpecification.findMany({
      where: { areaId },
      include: { product: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  private async getSpecification(accountId: string, id: string) {
    const spec = await this.prisma.db.productSpecification.findFirst({
      where: { id, area: { project: { accountId } } },
      include: { product: true },
    });
    if (!spec) {
      throw new NotFoundError('Especificação');
    }
    return spec;
  }

  async createSpecification(accountId: string, areaId: string, input: SpecificationInput) {
    await this.areasService.getArea(accountId, areaId);
    await this.productsService.getProduct(accountId, input.productId); // 404 se o produto não é desta conta
    return this.prisma.db.productSpecification.create({
      data: { areaId, ...input },
      include: { product: true },
    });
  }

  async updateSpecification(accountId: string, id: string, input: SpecificationUpdateInput) {
    await this.getSpecification(accountId, id);
    return this.prisma.db.productSpecification.update({
      where: { id },
      data: input,
      include: { product: true },
    });
  }

  async deleteSpecification(accountId: string, id: string) {
    await this.getSpecification(accountId, id);
    await this.prisma.db.productSpecification.delete({ where: { id } });
  }

  // Fluxo automático #3 (especificacao-tecnica.md): checkout em lote do
  // carrinho de FF&E → soma os itens escolhidos, marca clientApproved e
  // gera um Invoice rascunho (sem phaseId — não é um estágio do PEP, é o
  // orçamento de mobiliário) com o total. Cada checkout gera uma nova
  // fatura em vez de atualizar uma existente — o cliente pode aprovar o
  // carrinho em rodadas ao longo do projeto, e cada rodada é seu próprio
  // registro de faturamento.
  async approveCartToInvoiceDraft(accountId: string, projectId: string, specificationIds: string[]) {
    await this.projectsService.getProject(accountId, projectId);

    const specs = await this.prisma.db.productSpecification.findMany({
      where: { id: { in: specificationIds }, area: { projectId } },
    });
    if (specs.length !== specificationIds.length) {
      throw new NotFoundError('Uma ou mais especificações');
    }

    const missingPrice = specs.find((s) => s.unitPrice === null);
    if (missingPrice) {
      throw new ApiError(
        'MISSING_PRICE',
        `A especificação ${missingPrice.id} não tem unitPrice definido — não é possível somar no orçamento.`,
        422,
      );
    }

    const total = specs.reduce((sum, s) => {
      const lineTotal = s.quantity * Number(s.unitPrice) * (1 + Number(s.markupPercent ?? 0));
      return sum + lineTotal;
    }, 0);

    const [, invoice] = await this.prisma.db.$transaction([
      this.prisma.db.productSpecification.updateMany({
        where: { id: { in: specificationIds } },
        data: { clientApproved: true },
      }),
      this.prisma.db.invoice.create({
        data: { projectId, amount: total, status: 'pendente' },
      }),
    ]);

    return invoice;
  }
}
