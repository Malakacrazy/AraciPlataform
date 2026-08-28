import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';
import { UnauthorizedError } from '../common/api-error';
import { NotificationsService } from '../notifications/notifications.service';
import { PresentationLinksService } from '../presentation/presentation-links.service';

export const requestLinkSchema = z.object({ email: z.email() });
export type RequestLinkInput = z.infer<typeof requestLinkSchema>;

export const consumeTokenSchema = z.object({ token: z.string().min(1) });
export type ConsumeTokenInput = z.infer<typeof consumeTokenSchema>;

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
    const link = `${webUrl ?? 'http://localhost:3000'}/portal/verify?token=${token}`;

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
  async consumeMagicLink(input: ConsumeTokenInput) {
    const magicLink = await this.prisma.db.clientMagicLink.findUnique({
      where: { token: input.token },
      include: { client: true },
    });
    if (!magicLink || magicLink.consumedAt || magicLink.expiresAt < new Date()) {
      throw new UnauthorizedError('Link inválido, já usado ou expirado.');
    }

    await this.prisma.db.clientMagicLink.update({
      where: { id: magicLink.id },
      data: { consumedAt: new Date() },
    });

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
}
