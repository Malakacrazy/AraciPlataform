# Araci Plataforma

Plataforma de gestão integrada (Office, CRM, ERP Arquitetura, FF&E) para
um estúdio de arquitetura e design de interiores. Contexto completo do
produto em `Plataforma_Giulia_Plano_de_Desenvolvimento.docx`.

Este repositório está na Fase 0 (Descoberta & Arquitetura) do roadmap
descrito no plano — scaffold inicial, não um produto funcional.

## Estrutura

```
apps/web/       Next.js (App Router, TypeScript) — app web + API própria
packages/db/    Prisma + PostgreSQL — schema de dados compartilhado
docs/fase-0/    ADR de stack, notas do modelo de dados, questionário de descoberta
```

## Rodando localmente

```
npm install
cp packages/db/.env.example packages/db/.env   # ajuste DATABASE_URL
cp apps/web/.env.example apps/web/.env.local    # credenciais Google OAuth
npm run db:generate
npm run dev
```

Requer PostgreSQL local (ou remoto) para as rotas que usam `@araci/db`; a
página inicial e o build funcionam sem banco configurado.

## Decisões e próximos passos

Ver `docs/fase-0/adr-0001-stack.md` (por que este stack), `docs/fase-0/data-model.md`
(o que o schema cobre e o que ainda falta) e `docs/fase-0/descoberta-questionario.md`
(perguntas a validar com a Giulia antes de avançar para a Fase 1).
