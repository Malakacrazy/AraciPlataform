import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

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
