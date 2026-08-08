import { prisma } from "@araci/db";
import { PEP_STAGE_ORDER } from "../../lib/pep";

export interface CreateProjectFromOpportunityInput {
  accountId: string;
  clientId: string;
  opportunityId: string;
  name: string;
  feeModel: string;
}

// Chamado por modules/crm/convertOpportunityToProject — não é chamado
// diretamente pelas rotas de CRM, respeitando a regra de que um módulo só
// acessa dados de outro através de uma função exportada do módulo dono
// (especificacao-tecnica.md, "Limites dos módulos dentro do monólito").
//
// Semeia as 5 ProjectPhase do PEP, todas `contracted: true` por padrão —
// isso deveria vir da Proposal assinada (quais estágios o cliente
// realmente contratou), mas ainda não há um jeito de saber qual Proposal
// foi a aceita. Ver decisoes-pos-descoberta.md para o acompanhamento.
export function createProjectFromOpportunity(input: CreateProjectFromOpportunityInput) {
  return prisma.project.create({
    data: {
      accountId: input.accountId,
      clientId: input.clientId,
      opportunityId: input.opportunityId,
      name: input.name,
      feeModel: input.feeModel,
      status: "ativo",
      phases: {
        create: PEP_STAGE_ORDER.map((stage, index) => ({
          stage,
          contracted: true,
          order: index + 1,
        })),
      },
    },
    include: { phases: true },
  });
}
