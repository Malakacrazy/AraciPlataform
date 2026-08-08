import { z } from "zod";
import { prisma } from "@araci/db";
import { NotFoundError } from "@/lib/api";

// Papel/cargo sugerido: apps/web/src/lib/roles.ts (CANONICAL_ROLES) — não
// é uma trava no schema, `role` continua string livre (ver
// decisoes-pos-descoberta.md #2). Sem POST aqui: um User só nasce via o
// bootstrap de login (lib/session.ts), não por criação direta na API —
// não existe convite/pré-cadastro de conta ainda.
export const userUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  role: z.string().min(1).optional(),
  specialty: z.string().min(1).optional(),
  costPerHour: z.number().nonnegative().optional(),
});

export type UserUpdateInput = z.infer<typeof userUpdateSchema>;

export function listUsers(accountId: string) {
  return prisma.user.findMany({ where: { accountId }, orderBy: { name: "asc" } });
}

export async function getUser(accountId: string, id: string) {
  const user = await prisma.user.findFirst({ where: { id, accountId } });
  if (!user) {
    throw new NotFoundError("Colaborador");
  }
  return user;
}

export async function updateUser(accountId: string, id: string, input: UserUpdateInput) {
  await getUser(accountId, id);
  return prisma.user.update({ where: { id }, data: input });
}
