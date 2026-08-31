import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

// Achado A11 da auditoria de 30 ago 2026 (auditoria-2026-08-30-detalhada.md):
// node-postgres (o driver por trás do @prisma/adapter-pg) tem `ssl: false`
// por padrão, e a connection string que o painel do Supabase entrega não
// traz `sslmode` nenhum. Sem isso, todo o tráfego entre o Render e o
// Supabase -- a senha do banco no handshake, e depois cada linha de
// Client/Invoice/GoogleCredential -- atravessa a internet pública em texto
// claro, e nada no boot/log/smoke-test acusa (a aplicação funciona igual).
// Falha alto e explicitamente aqui em vez de conectar sem criptografia em
// silêncio -- só exigido fora de localhost, pra não quebrar o Postgres
// local de dev (sem TLS configurado).
function assertTlsForRemoteDatabase(url: string | undefined): void {
  if (!url) return; // ausência tratada em outro lugar -- Prisma recusa sozinho
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    return; // formato inválido -- Prisma recusa com um erro melhor que o nosso
  }
  const isLocal = host === "localhost" || host === "127.0.0.1" || host === "::1";
  if (!isLocal && !/[?&]sslmode=/.test(url)) {
    throw new Error(
      "DATABASE_URL aponta para um host remoto sem 'sslmode=' -- a conexão sairia sem TLS " +
        "(pg tem ssl:false por padrão, achado A11 da auditoria de 30 ago 2026). Adicione " +
        "'?sslmode=require' (ou 'verify-full' com CA) à connection string do Supabase.",
    );
  }
}

assertTlsForRemoteDatabase(process.env.DATABASE_URL);

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });

export const prisma = globalForPrisma.prisma ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

// Type-only wildcard: erased at compile time, so it doesn't trip up
// bundlers trying to statically analyze a CJS module's runtime exports.
export type * from "@prisma/client";
// Runtime enum/namespace values (needed as values, not just types) must be
// named explicitly instead of wildcarded — see the "export * used with
// ... CommonJS module" Turbopack warning this replaces. Prisma's error
// classes live under the `Prisma` namespace (Prisma.PrismaClientKnownRequestError),
// not as top-level exports.
export { ProjectStageName, OfficeLinkProvider, OfficeLinkEntityType, Prisma } from "@prisma/client";
