import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';
import { NotFoundError } from '../common/api-error';
import { NotificationsService } from '../notifications/notifications.service';
import { setAuditActor } from '../audit/audit-context';

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
        moodboards: {
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            name: true,
            items: {
              orderBy: { order: 'asc' },
              select: {
                id: true,
                kind: true,
                label: true,
                colorHex: true,
                swatchImageUrl: true,
                order: true,
                x: true,
                y: true,
                width: true,
                product: { select: { id: true, name: true, imageUrl: true } },
              },
            },
          },
        },
      },
    });
    if (!project) {
      // Link órfão (projeto excluído sem revogar o link antes) — mesmo
      // resultado de um token inválido, do ponto de vista de quem chama.
      throw new NotFoundError('Link de apresentação');
    }
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
    };
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
