import { z } from "zod";
import { prisma } from "@araci/db";
import { NotFoundError } from "@/lib/api";
import { PEP_STAGE_ORDER } from "@/lib/pep";

export const projectUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  status: z.string().min(1).optional(), // free-form, ex.: "ativo" | "pausado" | "encerrado"
});

export type ProjectUpdateInput = z.infer<typeof projectUpdateSchema>;

export function listProjects(accountId: string) {
  return prisma.project.findMany({
    where: { accountId },
    include: { client: true, phases: { orderBy: { order: "asc" } } },
    orderBy: { createdAt: "desc" },
  });
}

export async function getProject(accountId: string, id: string) {
  const project = await prisma.project.findFirst({
    where: { id, accountId },
    include: { client: true, phases: { orderBy: { order: "asc" } } },
  });
  if (!project) {
    throw new NotFoundError("Projeto");
  }
  return project;
}

export async function updateProject(accountId: string, id: string, input: ProjectUpdateInput) {
  await getProject(accountId, id);
  return prisma.project.update({ where: { id }, data: input });
}

export async function deleteProject(accountId: string, id: string) {
  await getProject(accountId, id);
  await prisma.project.delete({ where: { id } });
}

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
