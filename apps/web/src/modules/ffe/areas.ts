import { z } from "zod";
import { prisma } from "@araci/db";
import { NotFoundError } from "@/lib/api";
import { getProject } from "@/modules/erp/projects";

export const areaInputSchema = z.object({
  name: z.string().min(1), // ex.: "Sala de estar", "Quarto principal"
});

export type AreaInput = z.infer<typeof areaInputSchema>;

export async function listAreas(accountId: string, projectId: string) {
  await getProject(accountId, projectId);
  return prisma.area.findMany({ where: { projectId }, orderBy: { name: "asc" } });
}

export async function getArea(accountId: string, id: string) {
  const area = await prisma.area.findFirst({ where: { id, project: { accountId } } });
  if (!area) {
    throw new NotFoundError("Ambiente");
  }
  return area;
}

export async function createArea(accountId: string, projectId: string, input: AreaInput) {
  await getProject(accountId, projectId);
  return prisma.area.create({ data: { ...input, projectId } });
}

export async function deleteArea(accountId: string, id: string) {
  await getArea(accountId, id);
  await prisma.area.delete({ where: { id } });
}
