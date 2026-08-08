import { z } from "zod";
import { prisma } from "@araci/db";
import { NotFoundError } from "../../lib/api";
import { getClient } from "./clients";

export const opportunityInputSchema = z.object({
  clientId: z.string().min(1),
  title: z.string().min(1), // vira Project.name na conversão automática
  // Estágio do kanban de CRM (novo_lead | qualificacao | proposta_enviada |
  // negociacao | ganho | perdido) — NÃO confundir com ProjectStageName
  // (os 5 estágios do PEP do ERP). São dois conceitos de "estágio"
  // diferentes que só coincidem em nome.
  stage: z.string().min(1),
  feeModel: z.string().min(1), // "hora_tecnica" é o único em uso real hoje
  estimatedValue: z.number().nonnegative().optional(),
});

export type OpportunityInput = z.infer<typeof opportunityInputSchema>;

export function listOpportunities(accountId: string) {
  return prisma.opportunity.findMany({
    where: { client: { accountId } },
    include: { client: true, project: true },
    orderBy: { createdAt: "desc" },
  });
}

export async function getOpportunity(accountId: string, id: string) {
  const opportunity = await prisma.opportunity.findFirst({
    where: { id, client: { accountId } },
    include: { client: true, project: true },
  });
  if (!opportunity) {
    throw new NotFoundError("Oportunidade");
  }
  return opportunity;
}

export async function createOpportunity(accountId: string, input: OpportunityInput) {
  await getClient(accountId, input.clientId); // 404 se o cliente não é desta conta
  return prisma.opportunity.create({ data: input });
}

// Só atualiza a Opportunity em si. A conversão automática em Project
// (convertOpportunityToProject) é disparada pela rota PATCH depois de um
// update bem-sucedido que sete wonAt — não fica aqui dentro para manter
// esta função com uma única responsabilidade (update) e testável sem
// precisar simular a criação de projeto.
export async function updateOpportunity(
  accountId: string,
  id: string,
  input: Partial<OpportunityInput> & { wonAt?: Date | null; lostAt?: Date | null }
) {
  await getOpportunity(accountId, id);
  if (input.clientId) {
    await getClient(accountId, input.clientId);
  }
  return prisma.opportunity.update({ where: { id }, data: input });
}

export async function deleteOpportunity(accountId: string, id: string) {
  await getOpportunity(accountId, id);
  await prisma.opportunity.delete({ where: { id } });
}
