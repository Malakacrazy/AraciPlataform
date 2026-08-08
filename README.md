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
(o que o schema cobre e o que ainda falta), `docs/fase-0/especificacao-tecnica.md`
(limites dos módulos, formato da API, requisitos não-funcionais) e
`docs/fase-0/descoberta-questionario.md` (perguntas validadas com a Giulia).

O questionário de descoberta já foi respondido — `docs/fase-0/decisoes-pos-descoberta.md`
resume o que mudou no schema/spec por causa disso (PEP real de 5 estágios,
motor de precificação) e o que ainda está em aberto.

`docs/fase-0/prototipo-navegavel.html` é o protótipo navegável de baixa
fidelidade — abra o arquivo direto no navegador, sem precisar rodar o projeto.
