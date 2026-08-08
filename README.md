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

Não é preciso instalar PostgreSQL à parte — `packages/db` roda um Postgres
embarcado (via `embedded-postgres`, sem Docker, sem instalador) com os
dados persistidos em `packages/db/.pgdata` (gitignored):

```
npm install
cp packages/db/.env.example packages/db/.env
cp apps/web/.env.example apps/web/.env.local    # preencha as credenciais Google OAuth
npm run db:local          # deixa rodando num terminal; Ctrl+C para parar
npm run db:migrate        # noutro terminal, uma vez (ou após mudar o schema)
npm run dev
```

A página inicial e o build funcionam sem banco configurado; as rotas de
API precisam do Postgres local rodando.

## Smoke test

`npm run smoke-test` bate de verdade em `/api/v1/*` (client HTTP real,
banco real) com o servidor de dev rodando. Como não há credenciais reais
do Google OAuth configuradas, o script forja um cookie de sessão do
NextAuth usando o mesmo `NEXTAUTH_SECRET` do servidor — não abre
navegador nem depende do fluxo OAuth. Cobre o fluxo completo: criar
cliente → oportunidade → proposta (motor de precificação) → marcar como
ganha → checar que o projeto e as 5 fases do PEP foram criados
automaticamente — além de casos de erro (401, 404, 400, 409).

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
