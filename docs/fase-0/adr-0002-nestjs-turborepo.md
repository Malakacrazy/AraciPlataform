# ADR 0002 — Backend separado (NestJS) + Turborepo, revertendo ADR 0001

Status: implementado

## Contexto

ADR 0001 escolheu deliberadamente um monólito Next.js (frontend + API própria
via Route Handlers, tudo em `apps/web`) sobre um backend NestJS separado,
citando o custo operacional de dois serviços para um time de 1–2 devs. Boa
parte de Fase 1 (CRM, ERP, FF&E — ~30 endpoints, 16 módulos de regra de
negócio) foi construída sobre esse monólito, com smoke tests reais contra
Postgres local provando o comportamento ponta a ponta.

A decisão foi revertida explicitamente: o estúdio quer um backend NestJS
separado do frontend Next.js, com Turborepo no lugar de npm workspaces puro.
Este ADR registra a migração executada — a arquitetura final, não as
alternativas descartadas (essas já estão documentadas na tentativa anterior,
ADR 0001).

## Decisão

**Estrutura do monorepo** (Turborepo por cima de npm workspaces — resolve o
mesmo grafo de tarefas que ADR 0001 evitou por causa de privilégios de admin
com pnpm, mas o `turbo` em si é só uma devDependency npm comum, sem esse
problema):

```
apps/
  web/     Next.js — só UI + login (NextAuth) + um proxy BFF
  api/     NestJS — toda a lógica de negócio (CRM/ERP/FF&E)
packages/
  db/      Prisma — inalterado, consumido pelos dois via build próprio
```

`packages/db` ganhou um passo de build real (`tsc` para CommonJS,
`tsconfig.build.json`) — antes `main`/`types` apontavat direto pro `.ts` fonte
porque só o bundler do Next.js consumia o pacote; o build do NestJS (`tsc`
puro, sem bundler) precisa de JS/`.d.ts` já compilados.

**Autenticação — BFF (Backend for Frontend), não NestJS com login próprio.**
Essa foi a decisão de segurança mais importante da migração:

- `apps/web` continua sendo a **única** integração com Google OAuth
  (NextAuth, já testada, com `hd` restringindo a `studioaraci.com.br`).
  Não foi duplicada em `apps/api`.
- `apps/api` **nunca é chamado pelo navegador**. A única chamadora é
  `apps/web`, server-to-server, através de um proxy genérico
  (`apps/web/src/app/api/v1/[...path]/route.ts`).
- A cada request, `apps/web` confirma a sessão NextAuth real e forja um
  token interno de vida curta (~60s, JWT HS256 via `jose`), assinado com
  `INTERNAL_API_SECRET` — um segredo **diferente** de `NEXTAUTH_SECRET`,
  compartilhado só entre os dois serviços, nunca exposto ao navegador.
- `apps/api` valida esse token com um `AuthGuard` global (nenhuma rota
  esquece de exigir autenticação por omissão) e resolve
  `email → User → accountId` com a mesma lógica de bootstrap que existia em
  `apps/web/src/lib/session.ts` (agora `AuthService.ensureAccountAndUser`).

Por que este desenho e não NestJS com seu próprio login ou o navegador
chamando `apps/api` direto com um token de sessão: menos superfície de
ataque (só um serviço fala OAuth, o outro nunca recebe requisição de
navegador — pode inclusive rodar numa rede privada em produção, sem porta
pública), e zero retrabalho na parte de login que já funcionava.
**Não adotado**: sessões via banco de dados (`@auth/prisma-adapter`) para
revogação instantânea — colide de frente com os models `Account`/`User` já
existentes no schema (conceitos diferentes, mesmo nome), e não há confiança
suficiente numa contorno limpo sem testar. Fica como hardening futuro.

**Módulos NestJS**: cada domínio (`crm/`, `erp/`, `ffe/`) virou um
`@Module()` com Controllers (HTTP) + Services (regra de negócio, injeção via
DI) + os mesmos schemas Zod já testados (reaproveitados via um
`ZodValidationPipe` — não reescritos para `class-validator`). O limite de
módulo que já existia como convenção ("um módulo só acessa outro através de
uma função exportada") virou export/import de `@Module` de verdade, aplicado
pelo container de DI em vez de combinado.

## Consequências

- **Dois serviços para rodar em dev** (`apps/web` em 3000, `apps/api` em
  3001) em vez de um. `turbo run dev` sobe os dois em paralelo.
- **Dois smoke tests**: `apps/api/scripts/smoke-test.ts` (51 checks,
  cobertura completa de regra de negócio, direto contra `apps/api`) e
  `apps/web/scripts/smoke-test.ts` (5 checks, só prova que o proxy BFF
  funciona — a lógica de negócio já está provada no outro).
- Um bug real apareceu na migração e ficou documentado onde apareceu, não
  escondido: `@Post()` do Nest usa 201 como padrão, mas vários endpoints de
  ação (aprovar gate, aprovar hora) esperavam 200 (comportamento original do
  Next.js). Todo `@Post()` do backend agora tem `@HttpCode` explícito — sem
  depender do default de novo, em lugar nenhum.
- `apps/web` não toca mais em `@araci/db`/Postgres diretamente — perdeu essa
  dependência inteira, só fala HTTP com `apps/api`.

## Verificação

`npx turbo run build` (4 tasks: `@araci/db#generate`, `@araci/db#build`,
`api#build`, `web#build`) e `npx turbo run test` (jest em `apps/api`) —
ambos limpos. Os dois smoke tests, 56/56 checks, contra Postgres local real.
