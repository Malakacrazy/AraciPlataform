import { z } from "zod";
import { prisma } from "@araci/db";
import { NotFoundError } from "../../lib/api";

export const roleRateInputSchema = z.object({
  role: z.string().min(1),
  hourlyRate: z.number().positive(),
});

export type RoleRateInput = z.infer<typeof roleRateInputSchema>;

export function listRoleRates(accountId: string) {
  return prisma.roleRate.findMany({ where: { accountId }, orderBy: { role: "asc" } });
}

// Upsert por (accountId, role) — nomenclatura de papel ainda não está
// reconciliada entre o PEP e a planilha (decisoes-pos-descoberta.md #2),
// então "role" continua string livre em vez de enum por ora.
export function upsertRoleRate(accountId: string, input: RoleRateInput) {
  return prisma.roleRate.upsert({
    where: { accountId_role: { accountId, role: input.role } },
    update: { hourlyRate: input.hourlyRate },
    create: { accountId, role: input.role, hourlyRate: input.hourlyRate },
  });
}

export async function deleteRoleRate(accountId: string, id: string) {
  const rate = await prisma.roleRate.findFirst({ where: { id, accountId } });
  if (!rate) {
    throw new NotFoundError("Tarifa de papel");
  }
  await prisma.roleRate.delete({ where: { id } });
}
