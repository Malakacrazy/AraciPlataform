# ADR 0001 — Stack técnico inicial

Status: proposto (a validar em Fase 0)

## Contexto

O Plano de Desenvolvimento (`Plataforma_Giulia_Plano_de_Desenvolvimento.docx`)
define a Fase 0 como responsável por "escolher stack tecnológico" antes de
iniciar o MVP (Fase 1). Este ADR registra a escolha inicial usada para
montar o scaffold do repositório, para ser confirmada ou revisada durante a
Fase 0 com a equipe real do projeto.

Restrições relevantes do plano:
- Equipe pequena (1–2 devs full-stack) e horizonte de 6–12+ meses.
- Prioridade é web responsivo; mobile nativo é opcional e fica para a Fase 4.
- "Arquitetura extensível": dados por conta/empresa e API própria desde o
  início, para permitir módulos futuros (Procurement, Obras) sem redesenho.
- Localização brasileira desde o dia 1 (NFS-e, Simples Nacional, Fator R).
- Login único via Google Workspace.

## Decisão

- **Monorepo** com npm workspaces (`apps/*`, `packages/*`). pnpm/Turborepo
  foram considerados, mas não instalados no ambiente sem privilégios de
  admin; npm workspaces resolve o mesmo problema sem dependência extra.
- **Aplicação web full-stack única**: Next.js 16 (App Router, TypeScript),
  em vez de frontend e backend separados. Para uma equipe de 1–2 devs, um
  monólito bem organizado reduz a superfície de operação; os módulos
  (Office/CRM/ERP/FF&E) continuam separáveis em rotas/serviços internos.
- **Banco de dados**: PostgreSQL, acessado via Prisma ORM (`packages/db`).
  Modelo multi-tenant por `Account` (conta/empresa) desde o primeiro schema.
- **Autenticação**: Auth.js / NextAuth v4 (estável; a v5 segue em beta) com
  provider Google, cobrindo o requisito de SSO via Google Workspace.
- **API própria**: Route Handlers do Next.js sob `/api/*`, versionável e
  reutilizável por um futuro app mobile ou módulo de Procurement, sem expor
  o schema do banco diretamente.

## Alternativas consideradas

- **Backend separado (NestJS) + frontend Next.js**: mais próximo de "API
  própria" em espírito, mas dobra a operação (dois deploys, dois times de
  config) para um time de 1–2 devs. Descartado por ora; a estrutura em
  `apps/` e `packages/db` isolado permite migrar para isso depois sem
  redesenhar o modelo de dados.
- **Supabase/Firebase como BaaS**: acelera Fase 1, mas particularidades
  fiscais brasileiras (NFS-e, Fator R) exigem lógica de negócio própria de
  qualquer forma, reduzindo o ganho de um BaaS genérico.

## Consequências / pontos em aberto para a Fase 0

- Escolher provedor de hospedagem com atenção a residência de dados no
  Brasil (dado que o CRM guarda dados pessoais de clientes — LGPD).
- Confirmar qual parceiro fiscal (Asaas, eNotas, NFE.io ou Focus NFe) será
  integrado para emissão de NFS-e antes da Fase 2.
- Avaliar se a comunicação frontend↔backend deve migrar de Route Handlers
  soltos para algo tipado ponta a ponta (ex. tRPC) conforme a superfície de
  API cresce — não necessário para o escopo do MVP.
