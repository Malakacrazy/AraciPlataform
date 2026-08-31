import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';
import { NotFoundError } from '../common/api-error';
import { ProjectsService } from '../erp/projects.service';

export const moodboardInputSchema = z.object({
  name: z.string().min(1), // ex.: "Sala de Estar — Conceito 1"
});

export type MoodboardInput = z.infer<typeof moodboardInputSchema>;

// Achado A59 da auditoria de 30 ago 2026: z.unknown() aceitava
// LITERALMENTE qualquer JSON (`123`, `{"lixo":true}`, etc.) -- do outro
// lado, CollaborativeBoard chama loadSnapshot(store, snapshot) sem
// try/catch; a rejeição do tldraw (que existe e funciona -- é a defesa
// que barra javascript:/data:text/html, ver commit ec883be) LANÇA, e um
// throw dentro do useEffect sobe até o error boundary e derruba a tela
// inteira de FF&E/apresentação pra todo mundo, de forma persistente (o
// snapshot ruim já foi gravado, sobrescrevendo o anterior sem histórico).
// A validação abaixo não entende o tldraw -- só garante a forma mínima
// que TODO TLStoreSnapshot de verdade tem (store como mapa, schema com
// versão), sem acoplar este service a uma versão específica da
// biblioteca (.loose() aceita qualquer coisa além disso).
export const moodboardSnapshotInputSchema = z.object({
  snapshot: z
    .object({
      store: z.record(z.string(), z.unknown()),
      schema: z.object({ schemaVersion: z.number() }).loose(),
    })
    .loose(),
});

export type MoodboardSnapshotInput = z.infer<typeof moodboardSnapshotInputSchema>;

export const moodboardCommentInputSchema = z.object({
  body: z.string().min(1).max(2000),
});

export type MoodboardCommentInput = z.infer<typeof moodboardCommentInputSchema>;

// "user" | "client" | "guest" -- os três surfaces que embutem o quadro
// (tela do projeto, link de apresentação, portal do convidado). Sem
// enum no Prisma de propósito, mesmo espírito de AuditActor.actorType
// (string literal, não um tipo de banco): é rótulo de exibição, nunca
// usado em filtro/índice que precisasse de enum de verdade.
export type MoodboardCommentAuthorType = 'user' | 'client' | 'guest';

// Correção "moodboard vira quadro tldraw": o canvas livre próprio
// (posição/tamanho de produto/amostra, ver MoodboardItem no histórico
// do git) foi trocado por um quadro tldraw embutido de verdade. Este
// service não sabe desenhar nada -- só guarda o snapshot que o cliente
// manda (debounce no frontend, ver TldrawBoard) e devolve pra quem
// reabre a prancha depois.
@Injectable()
export class MoodboardsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projectsService: ProjectsService,
  ) {}

  async listMoodboards(accountId: string, projectId: string) {
    await this.projectsService.getProject(accountId, projectId);
    return this.prisma.db.moodboard.findMany({
      where: { projectId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async getMoodboard(accountId: string, id: string) {
    const moodboard = await this.prisma.db.moodboard.findFirst({
      where: { id, project: { accountId } },
    });
    if (!moodboard) {
      throw new NotFoundError('Prancha');
    }
    return moodboard;
  }

  async createMoodboard(accountId: string, projectId: string, input: MoodboardInput) {
    await this.projectsService.getProject(accountId, projectId);
    return this.prisma.db.moodboard.create({
      data: { ...input, projectId },
    });
  }

  async deleteMoodboard(accountId: string, id: string) {
    await this.getMoodboard(accountId, id);
    // WhiteboardGuestAccess não é cascade (mesmo padrão de
    // CollaboratorProjectAccess) -- limpo explicitamente antes, senão o
    // delete da prancha falha com P2003 pra qualquer convidado ainda
    // vinculado a ela.
    await this.prisma.db.whiteboardGuestAccess.deleteMany({ where: { moodboardId: id } });
    await this.prisma.db.moodboard.delete({ where: { id } });
  }

  // Chamado por quem tem acesso de escrita ao quadro -- staff (rota
  // autenticada normal), um WhiteboardGuest com WhiteboardGuestAccess pra
  // esta prancha (ver WhiteboardGuestPortalService), OU o cliente pelo
  // link de apresentação (PublicPresentationService.saveMoodboardSnapshot
  // chama isto direto -- é decisão de produto real, o cliente colabora no
  // quadro, não só visualiza; achado A51/A59 da auditoria de 30 ago 2026
  // corrigiu um comentário aqui que afirmava o contrário do código).
  async saveSnapshot(accountId: string, id: string, input: MoodboardSnapshotInput) {
    await this.getMoodboard(accountId, id);
    return this.prisma.db.moodboard.update({
      where: { id },
      data: { snapshot: input.snapshot as object },
    });
  }

  // Sem accountId no parâmetro de propósito -- as três chamadoras (rota
  // de staff, PublicPresentationService, WhiteboardGuestPortalService)
  // já resolveram e verificaram o próprio escopo (accountId da sessão,
  // token de apresentação, ou WhiteboardGuestAccess) antes de chegar
  // aqui; repetir a checagem seria redundante, não mais seguro.
  async listComments(moodboardId: string) {
    return this.prisma.db.moodboardComment.findMany({
      where: { moodboardId },
      orderBy: { createdAt: 'asc' },
    });
  }

  // Única chamadora que passa accountId+userId em vez de authorName
  // pronto -- as outras duas (client/guest) já tem o nome de exibição em
  // mãos (Client.name, WhiteboardGuest.name) sem precisar de outra
  // consulta.
  async addStaffComment(accountId: string, moodboardId: string, userId: string, body: string) {
    await this.getMoodboard(accountId, moodboardId);
    const user = await this.prisma.db.user.findUnique({ where: { id: userId }, select: { name: true } });
    return this.addComment(moodboardId, 'user', user?.name ?? 'Equipe', body);
  }

  async addComment(
    moodboardId: string,
    authorType: MoodboardCommentAuthorType,
    authorName: string,
    body: string,
  ) {
    return this.prisma.db.moodboardComment.create({
      data: { moodboardId, authorType, authorName, body },
    });
  }
}
