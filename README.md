# Araci Plataforma

Plataforma de gestão integrada (Office, CRM, ERP Arquitetura, FF&E) para
um estúdio de arquitetura e design de interiores. Contexto completo do
produto em `Plataforma_Giulia_Plano_de_Desenvolvimento.docx`.

O repositório cobre hoje as Fases 0 a 5 do roadmap descrito no plano. CRM,
ERP Arquitetura, FF&E, financeiro, BI, portal do cliente, portal do
consultor externo e quadro colaborativo estão implementados com API e
tela; a NFS-e é emitida de verdade pela plataforma; e existe caminho de
deploy (Docker multi-stage, `render.yaml`, CI).

**Antes de publicar, leia `docs/auditoria-2026-08-30.md`.** A revisão mais
recente encontrou um achado crítico de infraestrutura (a Data API do
projeto Supabase que hospeda o banco), lacunas de autorização entre staff
(`@AdminOnly` aplicado rota a rota deixa o mesmo dado acessível por outra
porta) e invariantes de dinheiro ausentes (sem arredondamento monetário,
"uma fatura por fase" sem constraint no banco). O blueprint de deploy
também nunca foi aplicado e tem três defeitos conhecidos que impedem a
primeira subida.

## Estrutura

```
apps/web/       Next.js (App Router, TypeScript) — login (NextAuth), proxy BFF e portais públicos
apps/api/       NestJS — API própria (CRM/ERP/FF&E/fiscal), porta 3001
packages/db/    Prisma + PostgreSQL — schema compartilhado (40 modelos, 38 migrações)
docs/           auditoria-2026-08-30.md — estado real do código, medido contra a matriz
docs/fase-0/    ADRs, modelo de dados, roadmap, runbook de deploy no Render
scripts/        check-deploy-config.mjs — CI confere se render.yaml bate com o que o código lê
render.yaml     blueprint dos dois serviços (web público, api privada)
```

Backend separado de frontend desde a ADR 0002 (`docs/fase-0/adr-0002-nestjs-turborepo.md`)
— o navegador nunca fala com `apps/api` diretamente, só com o proxy em `apps/web`.
Isso deixou de ser só arquitetura e passou a ser requisito de deploy: `apps/api`
sobe sem CORS e sem bind de host, e o `apps/web` fala com ela por `http://`
carregando um JWT interno de 60 s. Só o `apps/web` pode receber o domínio
público, e a API tem de rodar em **exatamente uma instância** (os `@Cron` são
in-process e não têm eleição de líder).

Há **quatro superfícies de sessão** distintas, com credenciais separadas e sem
aceitação cruzada: staff (NextAuth/Google), cliente (magic link), consultor
externo (`x-collaborator-session`) e convidado de quadro (Logto). O inventário
das rotas abertas fica em `apps/api/src/auth/public.decorator.ts` — mantenha-o
em sincronia, ele é checklist de segurança.

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

`npm run smoke-test` roda os dois: `apps/api/scripts/smoke-test.ts` (355
checks — cliente → oportunidade → proposta com motor de precificação →
marcar como ganha → projeto e 5 fases do PEP criados automaticamente;
gates de aprovação, faturamento por fase, timesheet, tarefas, alocação,
ausências, FF&E até o checkout, links de apresentação, portal do cliente,
portal do consultor, quadro/convidados, emissão e substituição de NFS-e,
documentos do Drive, permissões admin/staff, notificações, log de
auditoria e webhooks de Asaas/ZapSign, além de casos de erro
401/403/404/400/409) bate direto em `apps/api` forjando o token interno
via `jose`; e `apps/web/scripts/smoke-test.ts` (6 checks) prova só o proxy
BFF, forjando um cookie de sessão do NextAuth com o mesmo
`NEXTAUTH_SECRET`. Nenhum dos dois abre navegador nem depende do fluxo
OAuth real.

Duas ressalvas antes de confiar num verde:

- **O CI não roda esta suíte.** `.github/workflows/ci.yml` faz `npm ci`,
  `db:generate`, `turbo run build`, dois `tsc --noEmit` e
  `check:deploy-config` — e nenhum passo executa o smoke test. Rodar é
  manual, contra uma API de pé.
- **A troca de estágio do kanban não é exercitada** em ponto nenhum da
  suíte (`PATCH /opportunities/:id { stage }`), apesar de ser a operação
  que define o quadro.

## Decisões e próximos passos

Comece por **`docs/auditoria-2026-08-30.md`** — é o retrato mais recente e o
único documento verificado linha a linha contra o código. Lista o que bloqueia
a publicação, em que ordem atacar, e corrige afirmações que os documentos de
Fase 0 fazem e que não se sustentam mais.

`docs/fase-0/render-deploy-runbook.md` é o passo a passo do deploy no Render —
leia junto com a auditoria, porque o blueprint nunca foi aplicado e três dos
defeitos conhecidos estão no próprio `render.yaml`.

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
É artefato histórico da Fase 0: o app real tem hoje ~20 rotas de dashboard mais
quatro portais, bem mais que as 9 telas do protótipo. Serve para entender a
intenção original, não como referência do que existe.
