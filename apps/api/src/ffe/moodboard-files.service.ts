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

// ALLOWLIST, não denylist -- mesmo padrão de SAFE_INLINE_MIME_TYPES em
// public-presentation.controller.ts (achados A32/A45 da auditoria de 30
// ago 2026), e pelo mesmo motivo. A primeira versão disto era um
// `new Set(['image/svg+xml'])` consultado com o header CRU: qualquer
// parâmetro ou caixa diferente (`image/svg+xml; charset=utf-8`,
// `IMAGE/SVG+XML`) escapava do teste, enquanto o raw() do express
// aceitava do mesmo jeito (type-is ignora parâmetros e é
// case-insensitive) -- o SVG era gravado e depois servido de volta COM
// esse Content-Type, na mesma origem do dashboard autenticado. Isso é
// XSS armazenado, e nosniff não ajuda em nada quando o tipo declarado
// já É svg. Rasterizados only: normalizeSVG do Excalidraw não sanitiza
// (só ajusta xmlns/width/height/viewBox e devolve o outerHTML).
const SAFE_IMAGE_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/bmp',
  'image/avif',
  'image/x-icon',
]);

// Aliases que o navegador/Excalidraw podem mandar pro mesmo formato
// (IMAGE_MIME_TYPES da lib inclui jfif e vnd.microsoft.icon).
const MIME_ALIASES: Record<string, string> = {
  'image/jpg': 'image/jpeg',
  'image/jfif': 'image/jpeg',
  'image/pjpeg': 'image/jpeg',
  'image/vnd.microsoft.icon': 'image/x-icon',
  'image/ico': 'image/x-icon',
};

// Devolve o tipo canônico se for seguro pra servir inline, senão null.
// Descarta parâmetros (`; charset=...`, `; boundary=...`) e normaliza
// caixa ANTES de comparar -- era exatamente essa a brecha.
export function normalizeImageMimeType(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const base = raw.split(';', 1)[0].trim().toLowerCase();
  const canonical = MIME_ALIASES[base] ?? base;
  return SAFE_IMAGE_MIME_TYPES.has(canonical) ? canonical : null;
}

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
    const safeMimeType = normalizeImageMimeType(mimeType);
    if (!safeMimeType) {
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

    // Guarda o tipo CANÔNICO, não o header cru -- é ele que volta como
    // Content-Type em getFile.
    await this.prisma.db.moodboardFile.upsert({
      where: { moodboardId_fileId: { moodboardId, fileId } },
      create: { moodboardId, fileId, mimeType: safeMimeType, byteSize: bytes.byteLength, storageKey },
      update: { mimeType: safeMimeType, byteSize: bytes.byteLength, storageKey },
    });

    return { fileId, mimeType: safeMimeType, byteSize: bytes.byteLength };
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

    // Renormaliza NA LEITURA também, não só na escrita: uma linha
    // gravada antes desta correção (ou por qualquer caminho futuro que
    // esqueça a validação) não pode virar um Content-Type executável na
    // origem da aplicação. Fora da allowlist vira octet-stream +
    // attachment, exatamente o que downloadDocument já faz.
    const safeMimeType = normalizeImageMimeType(record.mimeType);
    return {
      mimeType: safeMimeType ?? 'application/octet-stream',
      disposition: safeMimeType ? ('inline' as const) : ('attachment' as const),
      bytes,
    };
  }
}
