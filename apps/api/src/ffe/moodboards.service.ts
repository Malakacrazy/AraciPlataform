import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';
import { NotFoundError } from '../common/api-error';
import { ProjectsService } from '../erp/projects.service';
import { getMoodboardBlobStore } from './moodboard-blob-store';

export const moodboardInputSchema = z.object({
  name: z.string().min(1), // ex.: "Sala de Estar — Conceito 1"
});

export type MoodboardInput = z.infer<typeof moodboardInputSchema>;

// Achado A59 da auditoria de 30 ago 2026: z.unknown() aceitava
// LITERALMENTE qualquer JSON (`123`, `{"lixo":true}`, etc.) -- do outro
// lado, o editor embutido carregava o snapshot sem try/catch, e uma
// rejeição da própria lib LANÇA dentro de um useEffect, subindo até o
// error boundary e derrubando a tela inteira de FF&E/apresentação pra
// todo mundo, de forma persistente (o snapshot ruim já foi gravado,
// sobrescrevendo o anterior sem histórico). As validações abaixo não
// entendem a lib -- só garantem a forma mínima que um snapshot de
// verdade tem em cada formato, sem acoplar este service a uma versão
// específica (.loose() aceita qualquer coisa além disso, inclusive o
// campo `marker` dos fixtures de smoke-test).
//
// Migração tldraw->Excalidraw (ver plano, §5.1/§7 e achado B5 da
// revisão): /present é alcançável por abas anônimas que não podem ser
// forçadas a recarregar, então o contrato precisa aceitar os DOIS
// formatos durante toda a janela de troca -- nunca revertido para
// z.unknown(). `files` é rejeitado no formato novo de propósito: bytes
// de imagem saem do snapshot (ver moodboard-files.service.ts); aceitar
// `files` aqui reabriria o mesmo estouro de SNAPSHOT_BODY_LIMIT que a
// aritmética do plano (§5.2) resolveu tirando as imagens daqui.
const tldrawSnapshotSchema = z
  .object({
    store: z.record(z.string(), z.unknown()),
    schema: z.object({ schemaVersion: z.number() }).loose(),
  })
  .loose();

const excalidrawSnapshotSchema = z
  .object({
    schemaVersion: z.number(),
    elements: z.array(
      z
        .object({
          id: z.string(),
          type: z.string(),
          version: z.number(),
        })
        .loose(),
    ),
    appState: z.record(z.string(), z.unknown()).optional(),
    files: z.never().optional(),
  })
  .loose();

export const moodboardSnapshotInputSchema = z.object({
  snapshot: z.union([tldrawSnapshotSchema, excalidrawSnapshotSchema]),
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

// Correção "moodboard vira quadro colaborativo": o canvas livre próprio
// (posição/tamanho de produto/amostra, ver MoodboardItem no histórico
// do git) foi trocado por um quadro embutido de verdade -- tldraw
// originalmente, Excalidraw desde o plano de migração tldraw->
// Excalidraw. Este service não sabe desenhar nada -- só guarda a cena
// que o cliente manda (debounce no frontend, ver use-board-sync.ts) e
// devolve pra quem reabre a prancha depois.
@Injectable()
export class MoodboardsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projectsService: ProjectsService,
  ) {}

  // Sem `snapshot` (nem a futura `scene`) aqui: a tela de FF&E lista todas
  // as pranchas do projeto de uma vez só pra desenhar os cabeçalhos/botões
  // -- trazer a cena inteira de cada uma nessa mesma query buscaria N
  // quadros completos sem necessidade. Quem precisa do conteúdo de uma
  // prancha busca via GET /moodboards/:id (getMoodboard), prancha por
  // prancha, como o frontend já faz para comentários e convidados.
  async listMoodboards(accountId: string, projectId: string) {
    await this.projectsService.getProject(accountId, projectId);
    return this.prisma.db.moodboard.findMany({
      where: { projectId },
      orderBy: { createdAt: 'asc' },
      select: { id: true, projectId: true, name: true, createdAt: true },
    });
  }

  // Sem `snapshot` (Fase 5 da migração tldraw->Excalidraw: "stop
  // returning snapshot from reads") -- nada no frontend lê mais esse
  // campo desde que collaborative-board.tsx passou a usar `scene`
  // (Fase 4), e o TLStoreSnapshot do tldraw pode ser um JSON grande sem
  // razão pra sair pela API por padrão. A coluna continua intacta no
  // banco (decisão D1: nenhum dado apagado, D7: as fotos ainda podem
  // ser extraídas dela depois) -- quem precisar dela de verdade
  // consulta o Prisma direto, não por aqui.
  async getMoodboard(accountId: string, id: string) {
    const moodboard = await this.prisma.db.moodboard.findFirst({
      where: { id, project: { accountId } },
      select: { id: true, projectId: true, name: true, createdAt: true, scene: true },
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
    await this.deleteOrphanedBlobs(id);
    // As linhas MoodboardFile em si cascadeiam com este delete (ver
    // schema.prisma) -- só o blob (MoodboardFileBytes) precisava da
    // checagem de referência acima antes de sumir.
    await this.prisma.db.moodboard.delete({ where: { id } });
  }

  // Blobs de imagem são conteúdo-endereçados (ver moodboard-blob-store.ts)
  // -- outra prancha pode ter colado a mesma imagem e compartilhar o
  // storageKey, então CASCADE sozinho apagaria um blob ainda em uso.
  // Achado do plano de migração §5.2: nenhum dos dois desenhos revisados
  // limpava isso, deixando o blob órfão pra sempre em todo delete.
  private async deleteOrphanedBlobs(moodboardId: string): Promise<void> {
    const files = await this.prisma.db.moodboardFile.findMany({
      where: { moodboardId },
      select: { storageKey: true },
    });
    if (files.length === 0) return;

    const store = getMoodboardBlobStore(this.prisma);
    for (const { storageKey } of files) {
      const stillReferenced = await this.prisma.db.moodboardFile.count({
        where: { storageKey, moodboardId: { not: moodboardId } },
      });
      if (stillReferenced === 0) {
        await store.delete(storageKey);
      }
    }
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
    const snapshot = input.snapshot as Record<string, unknown>;
    // `elements` só existe no formato novo (Excalidraw) -- decide pra
    // qual coluna grava, NUNCA as duas. Decisão D3 do plano de migração:
    // o `snapshot` (tldraw) de uma prancha existente não pode ser tocado
    // por uma escrita no formato novo, senão o rollback de Phase 4 deixa
    // de ser um redeploy e vira uma restauração de backup.
    if ('elements' in snapshot) {
      return this.prisma.db.moodboard.update({ where: { id }, data: { scene: snapshot } });
    }
    return this.prisma.db.moodboard.update({ where: { id }, data: { snapshot } });
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
