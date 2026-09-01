import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // CORRIGIDO (01 set 2026): prisma migrate deploy travava
    // indefinidamente contra o pooler Supavisor em modo transaction
    // (porta 6543) -- esse modo não suporta prepared statements/locks de
    // sessão que o motor de migração do Prisma precisa (achado rodando
    // de verdade no Render; ver github.com/prisma/prisma/issues/22779).
    // O adapter-pg em src/index.ts (app rodando) continua na porta 6543
    // -- é o cenário certo pra pool de conexões curtas; só o CLI (este
    // arquivo) precisa do pooler em modo session (porta 5432) ou de uma
    // conexão direta. DIRECT_URL não existe em dev local (Postgres único,
    // sem pooler no meio) -- cai pra DATABASE_URL mesmo, que já serve
    // pros dois casos nesse cenário.
    url: process.env.DIRECT_URL ?? env("DATABASE_URL"),
  },
});
