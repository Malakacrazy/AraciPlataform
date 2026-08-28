import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';
import { NotFoundError } from '../common/api-error';
import { NotificationsService } from '../notifications/notifications.service';
import { setAuditActor } from '../audit/audit-context';
import { GoogleDriveService } from '../office/google-drive.service';
import { MoodboardsService, type MoodboardCommentInput } from '../ffe/moodboards.service';

// Só clientApproved/clientComment — nunca productId/quantity/unitPrice/
// markupPercent. O cliente aprova e comenta; preço e quantidade
// continuam decisão da equipe, mesmo schema de risco que já vale para
// AuthGuard: o que não está aqui, a API não aceita, não é "esquecemos de
// bloquear na UI".
export const publicSpecUpdateSchema = z.object({
  clientApproved: z.boolean().optional(),
  clientComment: z.string().max(2000).optional(),
});

export type PublicSpecUpdateInput = z.infer<typeof publicSpecUpdateSchema>;

// Mesma fórmula usada em bi.service.ts (lineTotal) e
// specifications.service.ts (checkout que gera a fatura de verdade) --
// preço unitário já com o markup do estúdio aplicado. O cliente nunca
// recebe unitPrice cru nem markupPercent (achados C-03/C-04): a rota
// pública devolve só este número computado.
function unitSalePrice(unitPrice: unknown, markupPercent: unknown): string | null {
  if (unitPrice === null || unitPrice === undefined) return null;
  const sale = Number(unitPrice) * (1 + Number(markupPercent ?? 0));
  return sale.toFixed(2);
}

// Sem accountId em lugar nenhum aqui de propósito — quem chama este
// serviço não tem sessão, não é um User. A única autorização é "conhece
// o token", resolvido para um projectId uma vez em getLinkOrThrow() e
// usado para escopar tudo daí em diante (mesmo princípio de
// "polimórfico validado na service layer" do OfficeLink, mas aqui o
// escopo é um token de portador, não uma conta).
@Injectable()
export class PublicPresentationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
    private readonly googleDriveService: GoogleDriveService,
    private readonly moodboardsService: MoodboardsService,
  ) {}

  private async getLinkOrThrow(token: string) {
    const link = await this.prisma.db.presentationLink.findUnique({
      where: { token },
    });
    if (!link) {
      throw new NotFoundError('Link de apresentação');
    }
    return link;
  }

  async getPresentation(token: string) {
    const link = await this.getLinkOrThrow(token);
    // select explícito (achado C-03) -- o Prisma nunca devolve um campo
    // que não está listado aqui, diferente do include anterior que
    // repassava o Product e a ProductSpecification inteiros (custo,
    // markup, URL do fornecedor) pra fora do estúdio.
    const project = await this.prisma.db.project.findUnique({
      where: { id: link.projectId },
      select: {
        id: true,
        accountId: true,
        name: true,
        client: { select: { name: true } },
        areas: {
          orderBy: { name: 'asc' },
          select: {
            id: true,
            name: true,
            specifications: {
              orderBy: { createdAt: 'asc' },
              select: {
                id: true,
                quantity: true,
                unitPrice: true,
                markupPercent: true,
                clientApproved: true,
                clientComment: true,
                product: { select: { id: true, name: true, supplier: true, imageUrl: true } },
              },
            },
          },
        },
        // Só id/name aqui -- snapshot do tldraw pode ser um JSON grande
        // (shapes + assets), carregado sob demanda por prancha (ver
        // getMoodboardBoard abaixo), não de uma vez com o resto da
        // apresentação.
        moodboards: {
          orderBy: { createdAt: 'asc' },
          select: { id: true, name: true },
        },
      },
    });
    if (!project) {
      // Link órfão (projeto excluído sem revogar o link antes) — mesmo
      // resultado de um token inválido, do ponto de vista de quem chama.
      throw new NotFoundError('Link de apresentação');
    }

    // Item "grande" da lista de 11, adiado até a taxonomia documental
    // estar em uso real (ver GoogleDriveService.listClientVisibleDocuments):
    // só o que a equipe marcou visibleToClient=true e ainda não está
    // quebrado chega aqui — nunca a árvore de pastas inteira do projeto.
    const documents = await this.googleDriveService.listClientVisibleDocuments(project.accountId, project.id);

    return {
      id: project.id,
      name: project.name,
      client: project.client,
      areas: project.areas.map((area) => ({
        id: area.id,
        name: area.name,
        specifications: area.specifications.map((spec) => ({
          id: spec.id,
          quantity: spec.quantity,
          unitPrice: unitSalePrice(spec.unitPrice, spec.markupPercent),
          clientApproved: spec.clientApproved,
          clientComment: spec.clientComment,
          product: spec.product,
        })),
      })),
      moodboards: project.moodboards,
      documents: documents.map((doc) => ({
        id: doc.id,
        title: doc.title,
        documentType: doc.documentType,
        stage: doc.phase?.stage ?? null,
      })),
    };
  }

  // Mesmo princípio de escopo de updateSpecification/declineProposal: o
  // token só prova posse de UM projeto, resolvido aqui pra accountId
  // antes de delegar pro GoogleDriveService, que faz a checagem de
  // verdade (visibleToClient + não quebrado) antes de tocar no Drive.
  async downloadDocument(token: string, officeLinkId: string) {
    const link = await this.getLinkOrThrow(token);
    const project = await this.prisma.db.project.findUnique({
      where: { id: link.projectId },
      select: { accountId: true },
    });
    if (!project) {
      throw new NotFoundError('Link de apresentação');
    }
    return this.googleDriveService.downloadClientVisibleDocument(project.accountId, link.projectId, officeLinkId);
  }

  // Mesmo padrão de escopo de updateSpecification pro specId: o
  // moodboardId precisa pertencer ao projeto deste token, senão 404
  // (não vaza que a prancha existe noutro projeto).
  private async getOwnMoodboardAccountId(projectId: string, moodboardId: string) {
    const moodboard = await this.prisma.db.moodboard.findFirst({
      where: { id: moodboardId, projectId },
      select: { project: { select: { accountId: true } } },
    });
    if (!moodboard) {
      throw new NotFoundError('Prancha');
    }
    return moodboard.project.accountId;
  }

  // O quadro tldraw em si -- carregado sob demanda (ver comentário em
  // getPresentation). Cliente com o link tem acesso de escrita igual ao
  // resto do link de apresentação (posse do link = acesso, mesmo
  // princípio de updateSpecification): pode desenhar/comentar, não só
  // olhar.
  async getMoodboardBoard(token: string, moodboardId: string) {
    const link = await this.getLinkOrThrow(token);
    const accountId = await this.getOwnMoodboardAccountId(link.projectId, moodboardId);
    return this.moodboardsService.getMoodboard(accountId, moodboardId);
  }

  async saveMoodboardSnapshot(token: string, moodboardId: string, snapshot: unknown) {
    const link = await this.getLinkOrThrow(token);
    const accountId = await this.getOwnMoodboardAccountId(link.projectId, moodboardId);
    return this.moodboardsService.saveSnapshot(accountId, moodboardId, { snapshot });
  }

  async listMoodboardComments(token: string, moodboardId: string) {
    const link = await this.getLinkOrThrow(token);
    await this.getOwnMoodboardAccountId(link.projectId, moodboardId);
    return this.moodboardsService.listComments(moodboardId);
  }

  async addMoodboardComment(token: string, moodboardId: string, input: MoodboardCommentInput) {
    const link = await this.getLinkOrThrow(token);
    await this.getOwnMoodboardAccountId(link.projectId, moodboardId);
    const project = await this.prisma.db.project.findUnique({
      where: { id: link.projectId },
      select: { client: { select: { name: true } } },
    });
    return this.moodboardsService.addComment(moodboardId, 'client', project?.client.name ?? 'Cliente', input.body);
  }

  async updateSpecification(
    token: string,
    specId: string,
    input: PublicSpecUpdateInput,
  ) {
    const link = await this.getLinkOrThrow(token);
    const spec = await this.prisma.db.productSpecification.findFirst({
      where: { id: specId, area: { projectId: link.projectId } },
    });
    if (!spec) {
      throw new NotFoundError('Especificação');
    }

    // Buscado uma vez só, antes do update: dá o accountId pro ator de
    // auditoria (ver setAuditActor abaixo -- sem sessão de User aqui,
    // quem mutou o dado foi o Client dono do projeto) e é reaproveitado
    // pela notificação de aprovação mais abaixo, que já precisava do
    // mesmo project.accountId/name.
    const project = await this.prisma.db.project.findUnique({
      where: { id: link.projectId },
      select: { accountId: true, name: true, clientId: true, client: { select: { email: true } } },
    });
    if (project) {
      setAuditActor({
        accountId: project.accountId,
        actorType: 'client',
        actorId: project.clientId,
        actorEmail: project.client.email ?? undefined,
      });
    }

    const updated = await this.prisma.db.productSpecification.update({
      where: { id: specId },
      data: input,
      select: {
        id: true,
        quantity: true,
        unitPrice: true,
        markupPercent: true,
        clientApproved: true,
        clientComment: true,
        product: { select: { id: true, name: true, supplier: true, imageUrl: true } },
      },
    });

    // Notifica só na transição pra aprovado -- reenviar o mesmo
    // comentário numa especificação já aprovada não deveria mandar
    // e-mail de novo. Achado da auditoria: antes disso, nada avisava a
    // equipe quando um cliente de fato aprovava algo por aqui.
    if (input.clientApproved === true && !spec.clientApproved && project) {
      await this.notificationsService.notifySpecificationApproved(project.accountId, {
        projectId: link.projectId,
        projectName: project.name,
        productName: updated.product.name,
        clientComment: updated.clientComment,
      });
    }

    return {
      id: updated.id,
      quantity: updated.quantity,
      unitPrice: unitSalePrice(updated.unitPrice, updated.markupPercent),
      clientApproved: updated.clientApproved,
      clientComment: updated.clientComment,
      product: updated.product,
    };
  }
}
