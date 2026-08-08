import { prisma } from "@araci/db";
import { createProjectFromOpportunity } from "../erp/projects";

// Fluxo automático #1 de especificacao-tecnica.md: Opportunity.wonAt
// setado → cria Project com clientId, feeModel e accountId já copiados da
// oportunidade, sem redigitação. Idempotente — se a oportunidade já tem
// um Project vinculado, retorna o existente em vez de tentar criar outro
// (Project.opportunityId é @unique, então uma segunda tentativa
// quebraria sem essa checagem).
export async function convertOpportunityToProject(accountId: string, opportunityId: string) {
  const opportunity = await prisma.opportunity.findFirst({
    where: { id: opportunityId, client: { accountId } },
    include: { project: true },
  });
  if (!opportunity) {
    return null;
  }
  if (opportunity.project) {
    return opportunity.project;
  }

  return createProjectFromOpportunity({
    accountId,
    clientId: opportunity.clientId,
    opportunityId: opportunity.id,
    name: opportunity.title,
    feeModel: opportunity.feeModel,
  });
}
