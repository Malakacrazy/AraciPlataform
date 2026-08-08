import { z } from "zod";
import { prisma } from "@araci/db";
import { NotFoundError } from "@/lib/api";

export const clientInputSchema = z.object({
  name: z.string().min(1, "Nome é obrigatório."),
  document: z.string().optional(),
  email: z.email().optional(),
  phone: z.string().optional(),
  // site | whatsapp | instagram | indicacao | email | telefone — convenção
  // livre, mesma flexibilidade do campo no schema (não é um enum no banco).
  source: z.string().optional(),
});

export type ClientInput = z.infer<typeof clientInputSchema>;

export function listClients(accountId: string) {
  return prisma.client.findMany({
    where: { accountId },
    orderBy: { createdAt: "desc" },
  });
}

export async function getClient(accountId: string, id: string) {
  const client = await prisma.client.findFirst({ where: { id, accountId } });
  if (!client) {
    throw new NotFoundError("Cliente");
  }
  return client;
}

export function createClient(accountId: string, input: ClientInput) {
  return prisma.client.create({ data: { ...input, accountId } });
}

export async function updateClient(accountId: string, id: string, input: Partial<ClientInput>) {
  await getClient(accountId, id); // 404 antes de tentar atualizar fora do escopo da conta
  return prisma.client.update({ where: { id }, data: input });
}

export async function deleteClient(accountId: string, id: string) {
  await getClient(accountId, id);
  await prisma.client.delete({ where: { id } });
}
