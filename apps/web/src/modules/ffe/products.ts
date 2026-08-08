import { z } from "zod";
import { prisma } from "@araci/db";
import { NotFoundError } from "@/lib/api";

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

export function listProducts(accountId: string) {
  return prisma.product.findMany({ where: { accountId }, orderBy: { name: "asc" } });
}

export async function getProduct(accountId: string, id: string) {
  const product = await prisma.product.findFirst({ where: { id, accountId } });
  if (!product) {
    throw new NotFoundError("Produto");
  }
  return product;
}

export function createProduct(accountId: string, input: ProductInput) {
  return prisma.product.create({ data: { ...input, accountId } });
}

export async function updateProduct(accountId: string, id: string, input: Partial<ProductInput>) {
  await getProduct(accountId, id);
  return prisma.product.update({ where: { id }, data: input });
}

export async function deleteProduct(accountId: string, id: string) {
  await getProduct(accountId, id);
  await prisma.product.delete({ where: { id } });
}
