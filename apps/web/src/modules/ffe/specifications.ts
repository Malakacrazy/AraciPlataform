import { z } from "zod";
import { prisma } from "@araci/db";
import { ApiError, NotFoundError } from "@/lib/api";
import { getProject } from "@/modules/erp/projects";
import { getArea } from "./areas";
import { getProduct } from "./products";

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

export async function listSpecifications(accountId: string, areaId: string) {
  await getArea(accountId, areaId);
  return prisma.productSpecification.findMany({
    where: { areaId },
    include: { product: true },
    orderBy: { createdAt: "asc" },
  });
}

async function getSpecification(accountId: string, id: string) {
  const spec = await prisma.productSpecification.findFirst({
    where: { id, area: { project: { accountId } } },
    include: { product: true },
  });
  if (!spec) {
    throw new NotFoundError("Especificação");
  }
  return spec;
}

export async function createSpecification(accountId: string, areaId: string, input: SpecificationInput) {
  await getArea(accountId, areaId);
  await getProduct(accountId, input.productId); // 404 se o produto não é desta conta
  return prisma.productSpecification.create({
    data: { areaId, ...input },
    include: { product: true },
  });
}

export async function updateSpecification(accountId: string, id: string, input: SpecificationUpdateInput) {
  await getSpecification(accountId, id);
  return prisma.productSpecification.update({ where: { id }, data: input, include: { product: true } });
}

export async function deleteSpecification(accountId: string, id: string) {
  await getSpecification(accountId, id);
  await prisma.productSpecification.delete({ where: { id } });
}

// Fluxo automático #3 (especificacao-tecnica.md): checkout em lote do
// carrinho de FF&E → soma os itens escolhidos, marca clientApproved e
// gera um Invoice rascunho (sem phaseId — não é um estágio do PEP, é o
// orçamento de mobiliário) com o total. Cada checkout gera uma nova
// fatura em vez de atualizar uma existente — o cliente pode aprovar o
// carrinho em rodadas ao longo do projeto, e cada rodada é seu próprio
// registro de faturamento.
export async function approveCartToInvoiceDraft(
  accountId: string,
  projectId: string,
  specificationIds: string[]
) {
  await getProject(accountId, projectId);

  const specs = await prisma.productSpecification.findMany({
    where: { id: { in: specificationIds }, area: { projectId } },
  });
  if (specs.length !== specificationIds.length) {
    throw new NotFoundError("Uma ou mais especificações");
  }

  const missingPrice = specs.find((s) => s.unitPrice === null);
  if (missingPrice) {
    throw new ApiError(
      "MISSING_PRICE",
      `A especificação ${missingPrice.id} não tem unitPrice definido — não é possível somar no orçamento.`,
      422
    );
  }

  const total = specs.reduce((sum, s) => {
    const lineTotal = s.quantity * Number(s.unitPrice) * (1 + Number(s.markupPercent ?? 0));
    return sum + lineTotal;
  }, 0);

  const [, invoice] = await prisma.$transaction([
    prisma.productSpecification.updateMany({
      where: { id: { in: specificationIds } },
      data: { clientApproved: true },
    }),
    prisma.invoice.create({
      data: { projectId, amount: total, status: "pendente" },
    }),
  ]);

  return invoice;
}
