import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';
import { NotFoundError } from '../common/api-error';
import { NotificationsService } from '../notifications/notifications.service';

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
    const project = await this.prisma.db.project.findUnique({
      where: { id: link.projectId },
      include: {
        client: true,
        areas: {
          include: {
            specifications: {
              include: { product: true },
              orderBy: { createdAt: 'asc' },
            },
          },
          orderBy: { name: 'asc' },
        },
        moodboards: {
          include: {
            items: { include: { product: true }, orderBy: { order: 'asc' } },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!project) {
      // Link órfão (projeto excluído sem revogar o link antes) — mesmo
      // resultado de um token inválido, do ponto de vista de quem chama.
      throw new NotFoundError('Link de apresentação');
    }
    return project;
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

    const updated = await this.prisma.db.productSpecification.update({
      where: { id: specId },
      data: input,
      include: { product: true },
    });

    // Notifica só na transição pra aprovado -- reenviar o mesmo
    // comentário numa especificação já aprovada não deveria mandar
    // e-mail de novo. Achado da auditoria: antes disso, nada avisava a
    // equipe quando um cliente de fato aprovava algo por aqui.
    if (input.clientApproved === true && !spec.clientApproved) {
      const project = await this.prisma.db.project.findUnique({
        where: { id: link.projectId },
        select: { accountId: true, name: true },
      });
      if (project) {
        await this.notificationsService.notifySpecificationApproved(project.accountId, {
          projectId: link.projectId,
          projectName: project.name,
          productName: updated.product.name,
          clientComment: updated.clientComment,
        });
      }
    }

    return updated;
  }
}
