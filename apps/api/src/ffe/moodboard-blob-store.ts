import { PrismaService } from '../prisma/prisma.service';

// 4 métodos, ver plano de migração tldraw->Excalidraw §5.2/D3 -- interface
// só pra poder trocar o backend (Supabase Storage) depois sem tocar em
// quem chama (moodboard-files.service.ts). Postgres é o único
// implementado por ora: não existe SUPABASE_* em apps/api hoje, um bucket
// novo seria um segredo de alto poder mais um passo manual de dashboard,
// e este repo já foi queimado duas vezes por estado fora do repositório
// (supabase-realtime-policy.sql; as seis variáveis de render.yaml que
// check-deploy-config.mjs existe pra pegar).
export interface MoodboardBlobStore {
  put(storageKey: string, bytes: Buffer): Promise<void>;
  get(storageKey: string): Promise<Buffer | null>;
  has(storageKey: string): Promise<boolean>;
  delete(storageKey: string): Promise<void>;
}

// Bytes, não base64 TEXT -- +33% em storage/WAL/pg_dump sem benefício
// nenhum já que o transporte (Route Handlers) é binário de ponta a ponta.
// upsert com update vazio: conteúdo-endereçado, mesmo storageKey implica
// mesmo byte, uma segunda escrita do mesmo conteúdo não muda nada.
export class PostgresBlobStore implements MoodboardBlobStore {
  constructor(private readonly prisma: PrismaService) {}

  async put(storageKey: string, bytes: Buffer): Promise<void> {
    await this.prisma.db.moodboardFileBytes.upsert({
      where: { storageKey },
      // new Uint8Array(bytes), não o Buffer cru: o tipo gerado pelo
      // Prisma 7 pro Bytes quer um Uint8Array<ArrayBuffer> estrito, e
      // Buffer.buffer é tipado como ArrayBufferLike (aceitaria
      // SharedArrayBuffer) -- incompatível na checagem estrita do TS.
      create: { storageKey, bytes: new Uint8Array(bytes) },
      update: {},
    });
  }

  async get(storageKey: string): Promise<Buffer | null> {
    const row = await this.prisma.db.moodboardFileBytes.findUnique({ where: { storageKey } });
    return row ? Buffer.from(row.bytes) : null;
  }

  async has(storageKey: string): Promise<boolean> {
    const row = await this.prisma.db.moodboardFileBytes.findUnique({
      where: { storageKey },
      select: { storageKey: true },
    });
    return row !== null;
  }

  async delete(storageKey: string): Promise<void> {
    await this.prisma.db.moodboardFileBytes.deleteMany({ where: { storageKey } });
  }
}

// prisma passado por quem chama (já injetado pelo Nest em MoodboardsService/
// MoodboardFilesService) em vez deste módulo instanciar o próprio
// PrismaService -- este não é um provider do Nest, é uma função de fábrica
// simples, sem ciclo de vida de módulo pra gerenciar.
export function getMoodboardBlobStore(prisma: PrismaService): MoodboardBlobStore {
  if (process.env.SUPABASE_STORAGE_BUCKET) {
    // Adapter de Supabase Storage ainda não existe (ver comentário acima)
    // -- falha alto e cedo em vez de continuar gravando no Postgres
    // silenciosamente enquanto uma variável de ambiente promete outra
    // coisa (mesmo espírito de validateEnv em main.ts).
    throw new Error(
      'SUPABASE_STORAGE_BUCKET configurado, mas o adapter de Supabase Storage ainda não foi implementado ' +
        '(ver plano de migração tldraw->Excalidraw §5.2/D3) -- remova a variável ou implemente ' +
        'MoodboardBlobStore para Supabase antes de configurá-la.',
    );
  }
  return new PostgresBlobStore(prisma);
}
