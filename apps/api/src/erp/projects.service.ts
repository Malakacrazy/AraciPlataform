import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';
import { NotFoundError } from '../common/api-error';
import { PEP_STAGE_ORDER } from '../pep';

export const projectUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  status: z.string().min(1).optional(), // free-form, ex.: "ativo" | "pausado" | "encerrado"
});

export type ProjectUpdateInput = z.infer<typeof projectUpdateSchema>;

export interface CreateProjectFromOpportunityInput {
  accountId: string;
  clientId: string;
  opportunityId: string;
  name: string;
  feeModel: string;
}

@Injectable()
export class ProjectsService {
  constructor(private readonly prisma: PrismaService) {}

  listProjects(accountId: string) {
    return this.prisma.db.project.findMany({
      where: { accountId },
      include: { client: true, phases: { orderBy: { order: 'asc' } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getProject(accountId: string, id: string) {
    const project = await this.prisma.db.project.findFirst({
      where: { id, accountId },
      include: { client: true, phases: { orderBy: { order: 'asc' } } },
    });
    if (!project) {
      throw new NotFoundError('Projeto');
    }
    return project;
  }

  async updateProject(
    accountId: string,
    id: string,
    input: ProjectUpdateInput,
  ) {
    await this.getProject(accountId, id);
    return this.prisma.db.project.update({ where: { id }, data: input });
  }

  async deleteProject(accountId: string, id: string) {
    await this.getProject(accountId, id);
    // OfficeLink não tem FK para Project (polimórfico — ver
    // office-links.service.ts), então o delete do projeto não seria
    // bloqueado por P2003 nem levaria os vínculos junto: eles ficariam
    // órfãos e, pior, inacessíveis (listForProject faria 404 antes de
    // listar). Limpa explicitamente na mesma transação — mesmo que hoje
    // este delete já sempre 409 antes de chegar aqui, por causa das 5
    // ProjectPhase que toda Project tem e que phases.controller.ts não
    // permite excluir; mantido por paridade com
    // ClientsService.deleteClient (esse sim alcançável hoje) e para não
    // deixar a limpeza faltando se um caminho de delete de fases for
    // aberto no futuro.
    // Activity é o mesmo padrão polimórfico do OfficeLink (achado A-02 da
    // auditoria) -- limpa junto, mesma razão.
    // Achado A64 da auditoria de 30 ago 2026: mesma classe do A-02 acima,
    // reaberta na tabela nova -- CollaboratorProjectAccess tem FK real
    // pra Project SEM onDelete (default RESTRICT), e não era limpa aqui.
    // MoodboardsService.deleteMoodboard já trata o caso análogo
    // (WhiteboardGuestAccess) com o mesmo comentário "não é cascade,
    // limpo explicitamente antes".
    await this.prisma.db.$transaction([
      this.prisma.db.officeLink.deleteMany({
        where: { accountId, entityType: 'PROJECT', entityId: id },
      }),
      this.prisma.db.activity.deleteMany({
        where: { accountId, entityType: 'PROJECT', entityId: id },
      }),
      this.prisma.db.collaboratorProjectAccess.deleteMany({ where: { projectId: id } }),
      this.prisma.db.project.delete({ where: { id } }),
    ]);
  }

  // Chamado por CrmModule (OpportunitiesService.convertToProject) — não
  // exposto diretamente por nenhuma rota de CRM, respeitando a regra de
  // que um módulo só acessa dados de outro através de um serviço
  // exportado do módulo dono (especificacao-tecnica.md, "Limites dos
  // módulos").
  //
  // Semeia as 5 ProjectPhase do PEP, todas `contracted: true` por padrão —
  // isso deveria vir da Proposal assinada (quais estágios o cliente
  // realmente contratou), mas ainda não há um jeito de saber qual Proposal
  // foi a aceita. Ver decisoes-pos-descoberta.md para o acompanhamento.
  createProjectFromOpportunity(input: CreateProjectFromOpportunityInput) {
    return this.prisma.db.project.create({
      data: {
        accountId: input.accountId,
        clientId: input.clientId,
        opportunityId: input.opportunityId,
        name: input.name,
        feeModel: input.feeModel,
        status: 'ativo',
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
}
