import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MoodboardsService } from './moodboards.service';
import { BadRequestError, NotFoundError, PayloadTooLargeError, UnsupportedMediaTypeError } from '../common/api-error';
import { getMoodboardBlobStore } from './moodboard-blob-store';

// Mesmo número de main.ts (IMAGE_UPLOAD_LIMIT) -- os dois precisam
// concordar, mesmo raciocínio de SNAPSHOT_BODY_LIMIT/
// serverActions.bodySizeLimit. MAX_ALLOWED_FILE_BYTES do próprio
// Excalidraw também é 4 MiB (enforced depois do resize).
export const IMAGE_UPLOAD_LIMIT_BYTES = 4 * 1024 * 1024;

// SVG não é rasterizado antes de guardar -- normalizeSVG do Excalidraw
// não sanitiza (só ajusta xmlns/width/height/viewBox e devolve o
// outerHTML), então aceitar SVG aqui seria abrir um vetor de XSS em
// qualquer surface que reexiba a imagem depois (ver plano de migração
// tldraw->Excalidraw §5.2, achados A32/A45 da auditoria de 30 ago 2026).
const REJECTED_MIME_TYPES = new Set(['image/svg+xml']);

// Bytes de imagem NUNCA no snapshot/scene do Moodboard -- ver
// MoodboardFile/MoodboardFileBytes em schema.prisma. Este service é o
// único jeito de escrever/ler um blob; a autorização em si é
// getMoodboard(accountId, moodboardId), a mesma checagem que já guarda
// snapshot/comments, então as três surfaces (staff, present, guest)
// resolvem o próprio accountId (ver moodboards.controller.ts,
// public-presentation.service.ts, whiteboard-guest-portal.service.ts) e
// chamam este service exatamente como já fazem para saveSnapshot.
@Injectable()
export class MoodboardFilesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly moodboardsService: MoodboardsService,
  ) {}

  async putFile(accountId: string, moodboardId: string, fileId: string, mimeType: string, bytes: Buffer) {
    await this.moodboardsService.getMoodboard(accountId, moodboardId); // 404 se a prancha não é desta conta

    if (!Buffer.isBuffer(bytes) || bytes.byteLength === 0) {
      throw new BadRequestError(
        'Corpo da imagem ausente ou inválido -- envie os bytes com um Content-Type de imagem (ver IMAGE_UPLOAD_LIMIT em main.ts).',
      );
    }
    if (REJECTED_MIME_TYPES.has(mimeType)) {
      throw new UnsupportedMediaTypeError(`Tipo de arquivo não suportado: ${mimeType}.`);
    }
    if (bytes.byteLength > IMAGE_UPLOAD_LIMIT_BYTES) {
      throw new PayloadTooLargeError('Imagem maior que o limite permitido (4 MiB).');
    }

    // Conteúdo-endereçado: o hash dos bytes É a storageKey, então colar a
    // mesma imagem em pranchas diferentes (ou duas vezes na mesma)
    // reaproveita o blob em vez de duplicar (ver moodboard-blob-store.ts).
    const storageKey = createHash('sha256').update(bytes).digest('hex');
    const store = getMoodboardBlobStore(this.prisma);
    if (!(await store.has(storageKey))) {
      await store.put(storageKey, bytes);
    }

    await this.prisma.db.moodboardFile.upsert({
      where: { moodboardId_fileId: { moodboardId, fileId } },
      create: { moodboardId, fileId, mimeType, byteSize: bytes.byteLength, storageKey },
      update: { mimeType, byteSize: bytes.byteLength, storageKey },
    });

    return { fileId, mimeType, byteSize: bytes.byteLength };
  }

  // credencial -> moodboardId -> MoodboardFile(moodboardId, fileId): um
  // fileId forjado de outra prancha simplesmente não bate no unique
  // composto abaixo, então 404 sem vazar se o arquivo existe em algum
  // outro lugar (ver plano de migração §5.2).
  async getFile(accountId: string, moodboardId: string, fileId: string) {
    await this.moodboardsService.getMoodboard(accountId, moodboardId);

    const record = await this.prisma.db.moodboardFile.findUnique({
      where: { moodboardId_fileId: { moodboardId, fileId } },
    });
    if (!record) {
      throw new NotFoundError('Arquivo');
    }

    const store = getMoodboardBlobStore(this.prisma);
    const bytes = await store.get(record.storageKey);
    if (!bytes) {
      // Defensivo -- a linha de autorização existe mas o blob sumiu; não
      // deveria acontecer fora de uma inconsistência manual no banco.
      throw new NotFoundError('Arquivo');
    }

    return { mimeType: record.mimeType, bytes };
  }
}
