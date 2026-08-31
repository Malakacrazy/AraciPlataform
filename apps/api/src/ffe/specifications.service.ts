import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';
import { ApiError, NotFoundError } from '../common/api-error';
import { round2 } from '../common/money';
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

export type SpecificationUpdateInput = z.infer<
  typeof specificationUpdateSchema
>;

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

  async createSpecification(
    accountId: string,
    areaId: string,
    input: SpecificationInput,
  ) {
    await this.areasService.getArea(accountId, areaId);
    await this.productsService.getProduct(accountId, input.productId); // 404 se o produto não é desta conta
    return this.prisma.db.productSpecification.create({
      data: { areaId, ...input },
      include: { product: true },
    });
  }

  async updateSpecification(
    accountId: string,
    id: string,
    input: SpecificationUpdateInput,
  ) {
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
  // carrinho de FF&E → soma os itens escolhidos, marca invoicedAt e
  // gera um Invoice rascunho (sem phaseId — não é um estágio do PEP, é o
  // orçamento de mobiliário) com o total. Cada checkout gera uma nova
  // fatura em vez de atualizar uma existente — o cliente pode aprovar o
  // carrinho em rodadas ao longo do projeto, e cada rodada é seu próprio
  // registro de faturamento.
  //
  // Achado A6 da auditoria de 30 ago 2026: nada aqui checava se já tinha
  // sido faturado antes (só a UI filtrava) -- duas pessoas clicando
  // "Aprovar selecionados" quase ao mesmo tempo, ou um retry do mesmo
  // POST, gerava duas faturas pelo mesmo mobiliário. Corrigido com o
  // mesmo padrão de invoices.service.ts#createHourlyInvoice: o updateMany
  // condicional dentro da transação é o que faz a corrida perder de
  // verdade -- o count resultante tem que bater com
  // specificationIds.length, senão a fatura não é criada (rollback).
  //
  // Achado A49: a guarda original usava `clientApproved` -- carregava dois
  // significados ao mesmo tempo ("cliente aprovou" E "já faturado"), e um
  // item aprovado pelo link público sumia do carrinho pra sempre mesmo
  // sem nenhuma fatura existir (nenhuma tela oferecia desfazer). invoicedAt
  // é a guarda de corrida agora; clientApproved volta a significar só o
  // que o nome diz.
  async approveCartToInvoiceDraft(
    accountId: string,
    projectId: string,
    specificationIds: string[],
  ) {
    await this.projectsService.getProject(accountId, projectId);

    return this.prisma.db.$transaction(async (tx) => {
      const specs = await tx.productSpecification.findMany({
        where: { id: { in: specificationIds }, area: { projectId } },
      });
      if (specs.length !== specificationIds.length) {
        throw new NotFoundError('Uma ou mais especificações');
      }

      // Achado A49 da auditoria de 30 ago 2026: a guarda era
      // `s.clientApproved`, então um item aprovado pelo cliente mas AINDA
      // NÃO faturado (checkout nunca rodou) já era rejeitado aqui como
      // "já faturado" -- invoicedAt é o sinal certo de "já virou fatura",
      // independente do cliente ter aprovado ou não.
      const alreadyInvoiced = specs.find((s) => s.invoicedAt);
      if (alreadyInvoiced) {
        throw new ApiError(
          'SPECS_ALREADY_APPROVED',
          `A especificação ${alreadyInvoiced.id} já foi faturada antes — não é possível faturar de novo.`,
          422,
        );
      }

      const missingPrice = specs.find((s) => s.unitPrice === null);
      if (missingPrice) {
        throw new ApiError(
          'MISSING_PRICE',
          `A especificação ${missingPrice.id} não tem unitPrice definido — não é possível somar no orçamento.`,
          422,
        );
      }

      const total = round2(
        specs.reduce((sum, s) => {
          const lineTotal =
            s.quantity * Number(s.unitPrice) * (1 + Number(s.markupPercent ?? 0));
          return sum + lineTotal;
        }, 0),
      );

      const claim = await tx.productSpecification.updateMany({
        where: { id: { in: specificationIds }, invoicedAt: null },
        data: { invoicedAt: new Date() },
      });
      if (claim.count !== specificationIds.length) {
        throw new ApiError(
          'SPECS_ALREADY_APPROVED',
          'Outra aprovação para parte destes itens aconteceu ao mesmo tempo — recarregue e tente de novo.',
          422,
        );
      }

      return tx.invoice.create({
        data: { projectId, amount: total, status: 'pendente' },
      });
    });
  }
}
