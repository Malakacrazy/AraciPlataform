import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';
import { UnauthorizedError } from '../common/api-error';
import { withScheme } from '../common/url';
import { NotificationsService } from '../notifications/notifications.service';
import { PresentationLinksService } from '../presentation/presentation-links.service';
import { ClientsService } from '../crm/clients.service';
import { OpportunitiesService } from '../crm/opportunities.service';

export const requestLinkSchema = z.object({ email: z.email() });
export type RequestLinkInput = z.infer<typeof requestLinkSchema>;

export const consumeTokenSchema = z.object({ token: z.string().min(1) });
export type ConsumeTokenInput = z.infer<typeof consumeTokenSchema>;

export const prospectCommentSchema = z.object({ comment: z.string().min(1).max(2000) });
export type ProspectCommentInput = z.infer<typeof prospectCommentSchema>;

const MAGIC_LINK_TTL_MS = 15 * 60 * 1000; // 15 minutos
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 dias

// Autenticação de cliente pra um portal persistente (login/senha não
// existe -- é magic link só), separada por completo do AuthGuard
// interno (esse é pra staff, via JWT curto forjado por apps/web depois
// de validar a sessão NextAuth/Google real). Mesmo modelo de segurança
// já usado no PresentationLink: o token na tabela É a credencial,
// verificado aqui mesmo, não um JWT decodificado do lado do apps/web --
// por isso os métodos abaixo recebem o token puro, não um accountId.
@Injectable()
export class ClientPortalService {
  private readonly logger = new Logger(ClientPortalService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
    private readonly presentationLinksService: PresentationLinksService,
    private readonly clientsService: ClientsService,
    private readonly opportunitiesService: OpportunitiesService,
  ) {}

  // Sempre devolve sucesso genérico pra quem chamou, exista o e-mail ou
  // não (evita enumeração -- mesmo motivo de "usuário ou senha
  // inválidos" em vez de dizer qual dos dois está errado). Um pedido
  // novo invalida qualquer link anterior ainda não consumido do mesmo
  // cliente.
  async requestMagicLink(input: RequestLinkInput): Promise<void> {
    // findUnique em vez do findFirst+mode:'insensitive' de antes -- agora
    // que Client.email é @unique e sempre gravado em minúsculas (ver
    // ClientsService, achado A-05 da auditoria), a busca não precisa mais
    // tolerar múltiplas linhas nem comparação case-insensitive no banco;
    // é exatamente uma linha ou nenhuma.
    const client = await this.prisma.db.client.findUnique({
      where: { email: input.email.toLowerCase() },
    });
    if (!client || !client.email) {
      return;
    }

    await this.prisma.db.clientMagicLink.deleteMany({
      where: { clientId: client.id, consumedAt: null },
    });

    const token = randomUUID();
    await this.prisma.db.clientMagicLink.create({
      data: {
        clientId: client.id,
        token,
        expiresAt: new Date(Date.now() + MAGIC_LINK_TTL_MS),
      },
    });

    // Achado (bloqueador 06 da auditoria): sem WEB_URL configurado, o
    // cliente recebia um e-mail correto e bonito com um link pra
    // localhost -- inútil fora da máquina de quem está desenvolvendo.
    // O fallback continua existindo pro ambiente local (não travar dev
    // sem .env), mas agora avisa alto o suficiente pra aparecer no boot
    // de produção: ver validação de config obrigatória em main.ts.
    const webUrl = process.env.WEB_URL;
    if (!webUrl) {
      this.logger.warn('WEB_URL não configurado -- magic link será gerado com http://localhost:3000, inútil fora de dev.');
    }
    // withScheme (achado A12 da auditoria de 30 ago 2026): WEB_URL vem de
    // render.yaml fromService/host, sem protocolo -- sem isto, o link no
    // e-mail vira algo como "araci-web.onrender.com/portal/verify?...",
    // que o cliente de e-mail trata como caminho relativo, não um link.
    const link = `${withScheme(webUrl ?? 'http://localhost:3000')}/portal/verify?token=${token}`;

    try {
      await this.notificationsService.sendClientMagicLink(client.email, client.name, link);
    } catch (error) {
      // Não propaga -- a resposta pro chamador já é sempre a mesma
      // genérica, então um erro de envio aqui não pode se diferenciar
      // de "e-mail não cadastrado" no que o cliente vê. Fica só o log
      // pra alguém da equipe perceber se o Resend começar a falhar.
      this.logger.warn(`Falha ao enviar magic link: ${(error as Error).message}`);
    }
  }

  // Token de uso único: consumido aqui, uma tentativa de reuso (link
  // clicado duas vezes, aba antiga reaberta) cai no mesmo 401 de um
  // token que nunca existiu.
  // Achado A66 da auditoria de 30 ago 2026 (mesmo desenho documentado em
  // collaborator-portal.service.ts): findUnique + update separados é um
  // TOCTOU -- duas requisições concorrentes com o mesmo token (o clique
  // real do cliente e um prefetch/scanner de e-mail que segue o link
  // antes dele) passavam as duas pela checagem de consumedAt null e
  // criavam DUAS ClientSession de 7 dias a partir de um link "de uso
  // único". updateMany condicional numa instrução só é atômico.
  async consumeMagicLink(input: ConsumeTokenInput) {
    const magicLink = await this.prisma.db.clientMagicLink.findUnique({
      where: { token: input.token },
      include: { client: true },
    });
    if (!magicLink || magicLink.expiresAt < new Date()) {
      throw new UnauthorizedError('Link inválido, já usado ou expirado.');
    }

    const claim = await this.prisma.db.clientMagicLink.updateMany({
      where: { id: magicLink.id, consumedAt: null },
      data: { consumedAt: new Date() },
    });
    if (claim.count !== 1) {
      throw new UnauthorizedError('Link inválido, já usado ou expirado.');
    }

    const sessionToken = randomUUID();
    await this.prisma.db.clientSession.create({
      data: {
        clientId: magicLink.clientId,
        token: sessionToken,
        expiresAt: new Date(Date.now() + SESSION_TTL_MS),
      },
    });

    return { sessionToken, clientName: magicLink.client.name };
  }

  private async resolveSession(sessionToken: string) {
    const session = await this.prisma.db.clientSession.findUnique({
      where: { token: sessionToken },
    });
    if (!session || session.expiresAt < new Date()) {
      throw new UnauthorizedError('Sessão inválida ou expirada — entre novamente.');
    }
    return session;
  }

  // Achado de revisão de segurança: "sair" só apagava o cookie do
  // navegador -- o token continuava válido no banco por até 7 dias, então
  // quem tivesse copiado ele antes (log, histórico, máquina
  // compartilhada) seguia dentro mesmo depois do logout. deleteMany em
  // vez de delete pra sair sem erro quando o token já não existe (clique
  // duplo em "sair", sessão já expirada e limpa).
  async logout(sessionToken: string): Promise<void> {
    await this.prisma.db.clientSession.deleteMany({ where: { token: sessionToken } });
  }

  // Lacuna da matriz (LGPD, "seção 'Meus dados' no portal do titular") --
  // reaproveita ClientsService.exportClientData, só autorizado pela
  // sessão do portal (posse do token) em vez de accountId/accessLevel de
  // staff. accountId não vem da sessão (ela só guarda clientId) --
  // resolvido aqui a partir do próprio Client antes de chamar o service
  // que espera esse escopo.
  async exportOwnData(sessionToken: string) {
    const session = await this.resolveSession(sessionToken);
    const client = await this.prisma.db.client.findUnique({
      where: { id: session.clientId },
      select: { accountId: true },
    });
    if (!client) {
      throw new UnauthorizedError('Sessão inválida ou expirada — entre novamente.');
    }
    // Achados A48/A67 da auditoria de 30 ago 2026: exportClientData (a
    // versão de staff) devolvia a composição interna de preço, o motivo
    // de perda e as notas internas da equipe pro próprio cliente --
    // exportClientDataForSubject é a projeção segura pro titular.
    return this.clientsService.exportClientDataForSubject(client.accountId, session.clientId);
  }

  // Um link de apresentação por projeto é criado sob demanda na
  // primeira vez que o cliente entra no portal -- antes disso, ele só
  // existia se alguém da equipe tivesse gerado manualmente em
  // /projects/:id. O portal não deveria depender desse passo manual ter
  // acontecido antes.
  async listProjects(sessionToken: string) {
    const session = await this.resolveSession(sessionToken);
    const client = await this.prisma.db.client.findUnique({
      where: { id: session.clientId },
      include: {
        projects: {
          select: { id: true, name: true, status: true, accountId: true },
          orderBy: { createdAt: 'desc' },
        },
      },
    });
    if (!client) {
      throw new UnauthorizedError('Sessão inválida ou expirada — entre novamente.');
    }

    const projects = await Promise.all(
      client.projects.map(async (project) => {
        let link = await this.presentationLinksService.getLink(project.accountId, project.id);
        if (!link) {
          link = await this.presentationLinksService.regenerateLink(project.accountId, project.id);
        }
        return {
          id: project.id,
          name: project.name,
          status: project.status,
          presentationToken: link.token,
        };
      }),
    );

    return { clientName: client.name, projects };
  }

  // Lacuna da matriz (portal pré-venda) -- PresentationLink.projectId é
  // obrigatório e único, então a entidade de pré-venda (Opportunity sem
  // Project ainda) não é endereçável por aquele mecanismo. Estende o
  // portal magic link em vez disso: o prospecto já tem e-mail conhecido,
  // e o portal já sabe autenticá-lo sem senha (achado da auditoria: essa
  // é a causa estrutural da lacuna, não falta de vontade).
  async listPendingProposals(sessionToken: string) {
    const session = await this.resolveSession(sessionToken);
    const opportunities = await this.prisma.db.opportunity.findMany({
      where: { clientId: session.clientId, project: null, wonAt: null, lostAt: null },
      select: {
        id: true,
        title: true,
        prospectComment: true,
        proposals: {
          // Só a versão mais recente interessa ao prospecto -- versões
          // anteriores já viraram "expired" (ver ProposalsService.createProposal).
          orderBy: { version: 'desc' },
          take: 1,
          select: {
            id: true,
            value: true,
            status: true,
            zapsignSignUrl: true,
            sentAt: true,
            // Sem baseCost/adjustedCost/complexityMultiplier/
            // packageDiscountPercent de propósito -- mesmo precedente de
            // C-03/C-04: é composição interna de preço, não o que o
            // prospecto aprova.
            stages: { select: { stage: true, contracted: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // "draft" nunca saiu da equipe -- não faz sentido pro prospecto ver
    // uma proposta que ninguém decidiu enviar ainda.
    return opportunities
      .filter((o) => o.proposals[0] && o.proposals[0].status !== 'draft')
      .map((o) => ({
        id: o.id,
        title: o.title,
        prospectComment: o.prospectComment,
        proposal: o.proposals[0],
      }));
  }

  private async getOwnOpportunityAccountId(clientId: string, opportunityId: string) {
    const opportunity = await this.prisma.db.opportunity.findFirst({
      where: { id: opportunityId, clientId },
      select: { client: { select: { accountId: true } } },
    });
    if (!opportunity) {
      throw new UnauthorizedError('Oportunidade não encontrada.');
    }
    return opportunity.client.accountId;
  }

  // "Aceite" é handoff pra ZapSign (zapsignSignUrl já existe, gerado por
  // sendForSignature) -- não duplica a assinatura que já funciona, só
  // aponta pra ela. "Recusa" reaproveita markLost, que já impede reverter
  // uma oportunidade ganha (mesma irreversibilidade de sempre).
  async declineProposal(sessionToken: string, opportunityId: string) {
    const session = await this.resolveSession(sessionToken);
    const accountId = await this.getOwnOpportunityAccountId(session.clientId, opportunityId);
    await this.opportunitiesService.markLost(accountId, opportunityId, 'Recusado pelo prospecto no portal');
  }

  // Lacuna da matriz (portal pré-venda, "perguntas do prospecto") --
  // campo livre único (mesmo padrão de ProductSpecification.clientComment),
  // não uma thread: Activity não serve aqui porque Activity.authorId
  // exige um User de verdade, e o prospecto não é um.
  async submitProspectComment(sessionToken: string, opportunityId: string, comment: string) {
    const session = await this.resolveSession(sessionToken);
    await this.getOwnOpportunityAccountId(session.clientId, opportunityId);
    await this.prisma.db.opportunity.update({
      where: { id: opportunityId },
      data: { prospectComment: comment },
    });
  }
}
