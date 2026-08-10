# Araci Plataforma

Plataforma de gestão integrada (Office, CRM, ERP Arquitetura, FF&E) para
um estúdio de arquitetura e design de interiores. Contexto completo do
produto em `Plataforma_Giulia_Plano_de_Desenvolvimento.docx`.

Este repositório está na Fase 0 (Descoberta & Arquitetura) do roadmap
descrito no plano — scaffold inicial, não um produto funcional.

## Estrutura

```
apps/web/       Next.js (App Router, TypeScript) — login (NextAuth) + proxy BFF, sem lógica de negócio
apps/api/       NestJS — API própria (CRM/ERP/FF&E), porta 3001
packages/db/    Prisma + PostgreSQL — schema de dados compartilhado, consumido pelos dois apps
docs/fase-0/    ADR de stack, notas do modelo de dados, questionário de descoberta
```

Backend separado de frontend desde a ADR 0002 (`docs/fase-0/adr-0002-nestjs-turborepo.md`)
— o navegador nunca fala com `apps/api` diretamente, só com o proxy em `apps/web`.

## Rodando localmente

Não é preciso instalar PostgreSQL à parte — `packages/db` roda um Postgres
embarcado (via `embedded-postgres`, sem Docker, sem instalador) com os
dados persistidos em `packages/db/.pgdata` (gitignored):

```
npm install
cp packages/db/.env.example packages/db/.env
cp apps/web/.env.example apps/web/.env.local    # preencha as credenciais Google OAuth
cp apps/api/.env.example apps/api/.env          # INTERNAL_API_SECRET precisa bater com o de apps/web
npm run db:local          # deixa rodando num terminal; Ctrl+C para parar
npm run db:migrate        # noutro terminal, uma vez (ou após mudar o schema)
npm run dev                # turbo sobe apps/web (3000) e apps/api (3001) juntos
```

`apps/web` funciona sem banco configurado para a página inicial e o login;
as rotas de API (via `apps/api`) precisam do Postgres local rodando.

`apps/web` roda `next dev --webpack` em vez do Turbopack padrão do
Next.js 16 — no Windows, o dev server do Turbopack processando
`globals.css` (Tailwind v4/PostCSS) trava o processo Node que ele mesmo
gera (`node process exited ... 0xc0000142`), reproduzido de forma
consistente mesmo sem OneDrive rodando e sem antivírus de terceiros
instalado. É um bug conhecido do Turbopack no Windows nesse pipeline de
CSS (ver [vercel/next.js#90860](https://github.com/vercel/next.js/issues/90860),
sintoma parecido mas não idêntico — o mesmo pipeline de worker do
PostCSS), ainda sem correção lançada na versão estável até
`next@16.3.0`. `next build`/`next start` usam Turbopack normalmente (não
afetados, só o dev server incremental). Revisitar quando o Next.js
lançar uma versão que resolva isso.

## Smoke test

`npm run smoke-test` roda os dois: `apps/api/scripts/smoke-test.ts` (64
checks, cobertura completa de regra de negócio — cliente → oportunidade →
proposta com motor de precificação → marcar como ganha → projeto e 5
fases do PEP criados automaticamente, vínculos de Office (Drive/Calendar)
com limpeza automática ao excluir o dono, além de casos de erro
401/404/400/409)
bate direto em `apps/api` forjando o token interno via `jose`; e
`apps/web/scripts/smoke-test.ts` (5 checks) prova só o proxy BFF, forjando
um cookie de sessão do NextAuth com o mesmo `NEXTAUTH_SECRET`. Nenhum dos
dois abre navegador nem depende do fluxo OAuth real.

## Decisões e próximos passos

Ver `docs/fase-0/adr-0001-stack.md` (por que este stack), `docs/fase-0/data-model.md`
(o que o schema cobre e o que ainda falta), `docs/fase-0/especificacao-tecnica.md`
(limites dos módulos, formato da API, requisitos não-funcionais) e
`docs/fase-0/descoberta-questionario.md` (perguntas validadas com a Giulia).

O questionário de descoberta já foi respondido — `docs/fase-0/decisoes-pos-descoberta.md`
resume o que mudou no schema/spec por causa disso (PEP real de 5 estágios,
motor de precificação) e o que ainda está em aberto.

`docs/fase-0/roadmap-atualizado.md` reescopa o que falta de Fase 0 até o
go-live com base nisso — o que cresceu, o que encolheu, e o que ainda
depende de decisão da Giulia antes de virar prazo.

`docs/fase-0/prototipo-navegavel.html` é o protótipo navegável de baixa
fidelidade — abra o arquivo direto no navegador, sem precisar rodar o projeto.
