# Runbook — primeiro deploy no Render

Passo a passo pra sair do zero (conta criada, nada conectado) até a
plataforma no ar. Escrito depois de `docker build` rodar de verdade nas
duas imagens — o que corrigiu 5 bloqueadores que só apareceram
construindo (ver "Correção — deriva de configuração..." e o commit
`964637d` no `roadmap-atualizado.md`).

**Quem executa: você.** Isto cria infraestrutura paga e publica um
serviço na internet — nenhuma dessas ações é automatizável daqui sem as
credenciais da sua conta, e nenhuma deveria ser.

---

## 0. Antes de começar — tenha em mãos

| Item | Onde pegar |
| --- | --- |
| Certificado `StudioAraci.pfx` | O arquivo real (hoje na raiz do repositório, **não** versionado) |
| Senha do certificado | Com você / contador |
| CNPJ do certificado | `53554180000110` (confirmar) |
| `GOOGLE_CLIENT_ID` / `SECRET` | Google Cloud Console → Credentials |
| Chave de API do Google (Picker) + App ID | Mesma tela |
| `ASAAS_API_KEY` | Painel Asaas (produção) |
| `ZAPSIGN_PRODUCTION_API_TOKEN` | Painel ZapSign |
| `RESEND_API_KEY` | Painel Resend |
| `LOGTO_ENDPOINT` / `APP_ID` / `APP_SECRET` | Console Logto → seu app |
| `NEXT_PUBLIC_SUPABASE_URL` / `ANON_KEY` / `SUPABASE_JWT_SECRET` | Supabase → Settings → API |
| `DATABASE_URL` (connection string do POOLER, porta 6543, `?sslmode=require`) | Supabase → Settings → Database → Connection string |
| DSN do Sentry (opcional) | sentry.io → Client Keys |

> **Banco**: decisão consciente de custo — o `render.yaml` **não**
> provisiona Postgres do Render. Usa o Postgres do MESMO projeto
> Supabase já configurado pro Realtime do quadro (você já tem a conta;
> ver comentário no topo do `render.yaml` pro raciocínio completo:
> ~$20/mês rodando tudo no Render vira ~$7/mês, só o `araci-api`, que é
> o único custo que não tem como evitar — serviço privado não tem
> instância grátis no Render).
>
> **Correção (achados A11/A15 da auditoria de 30 ago 2026,
> `docs/auditoria-2026-08-30-detalhada.md`)** -- esta seção dizia antes
> pra usar a connection string DIRETA (porta 5432), não o pooler (6543),
> com a justificativa de que "o pooler conflita com prepared statements
> do Prisma". Duas coisas erradas nisso:
> 1. Essa justificativa é sobre o ENGINE Rust do Prisma -- este projeto
>    usa `@prisma/adapter-pg` (node-postgres), que não tem esse
>    conflito com o Supavisor em modo transação.
> 2. O endpoint direto (`db.<ref>.supabase.co:5432`) só resolve em
>    IPv6 sem o add-on IPv4 pago do Supabase, e a saída de rede do
>    Render é IPv4 -- ou seja, a instrução antiga apontava pro caminho
>    com MAIOR chance de simplesmente não conectar (`ETIMEDOUT`).
>    Use o **pooler** (`aws-0-<região>.pooler.supabase.com:6543`) como
>    conexão primária.
> 3. **Sempre com `?sslmode=require` no final** -- `pg` (o driver por
>    trás do adapter) tem `ssl: false` por padrão, e a string que o
>    painel do Supabase entrega não traz `sslmode` nenhum. Sem isso, o
>    tráfego entre Render e Supabase (senha do banco, e depois cada
>    linha de Client/Invoice/GoogleCredential) vai sem criptografia,
>    sem nenhum sinal de erro -- a aplicação funciona igual.
>    `packages/db/src/index.ts` agora FALHA NO BOOT se `DATABASE_URL`
>    for um host remoto sem `sslmode=`, então esquecer isso aqui já não
>    passa despercebido.

---

## 0.5. Antes do primeiro Apply — backup do Supabase

**Achado A18 da auditoria de 30 ago 2026** (`docs/auditoria-2026-08-30-detalhada.md`):
o `preDeployCommand` (`npm run db:migrate:deploy`, passo 1 abaixo) aplica
TODAS as migrações pendentes sem confirmação nenhuma, contra o MESMO
projeto Supabase que você já usa em desenvolvimento (não um banco
zerado). Pelo menos uma migração já mergeada faz `DROP TABLE` sem
backfill (`MoodboardItem`, substituída por `Moodboard.snapshot`) --
`prisma migrate deploy` não tem rollback. Antes de dar Apply pela
primeira vez:

1. Supabase → **Database → Backups** → confirme que existe um backup
   recente (ou dispare um manual, se o plano permitir).
2. Regra pra qualquer migração nova daqui pra frente: um `DROP TABLE`/
   `DROP COLUMN` que perderia dado existente precisa de uma migração de
   dados explícita ANTES do drop (copiar pro destino novo), não só o
   drop direto -- mesmo que hoje o ambiente seja só de desenvolvimento.

---

## 1. Aplicar o blueprint

1. Render → **New** → **Blueprint**.
2. Conecte o repositório `Malakacrazy/AraciPlataform`, branch `main`.
3. O Render lê o `render.yaml` e propõe **2 recursos**: `araci-api`
   (privado, sem domínio) e `araci-web` (público). Sem banco — o
   `DATABASE_URL` do Supabase entra como segredo no passo 2.
4. **Não confirme ainda** — ele vai pedir os valores marcados
   `sync: false` (passo 2).

---

## 2. Segredos que você digita (`sync: false`)

**`araci-api`** — `DATABASE_URL` (Supabase, connection string do pooler + `?sslmode=require`),
`ALLOWED_EMAILS`, `GOOGLE_CLIENT_ID`,
`GOOGLE_CLIENT_SECRET`, `NFSE_CERTIFICATE_PASSWORD`,
`NFSE_CERTIFICATE_CPFCNPJ`, `ASAAS_API_KEY`,
`ZAPSIGN_PRODUCTION_API_TOKEN`, `RESEND_API_KEY`, `SENTRY_DSN`

**`araci-web`** — `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`,
`NEXT_PUBLIC_GOOGLE_CLIENT_ID`, `NEXT_PUBLIC_GOOGLE_API_KEY`,
`NEXT_PUBLIC_GOOGLE_APP_ID`, `ALLOWED_EMAILS`, `SENTRY_DSN`,
`NEXT_PUBLIC_SENTRY_DSN`, `LOGTO_ENDPOINT`, `LOGTO_APP_ID`,
`LOGTO_APP_SECRET`, `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_JWT_SECRET`

`GOOGLE_CLIENT_ID`/`SECRET` aparecem **nos dois** de propósito: o
`apps/api` também usa o par pra renovar o access token do Drive
(`GoogleCredentialsService.getAccessToken`).

Gerados sozinhos pelo Render (não digite): `INTERNAL_API_SECRET`,
`GOOGLE_CREDENTIAL_ENCRYPTION_KEY`, `NEXTAUTH_SECRET`,
`ASAAS_WEBHOOK_AUTH_TOKEN`, `ZAPSIGN_WEBHOOK_AUTH_TOKEN`.

---

## 3. ⚠️ O ponto que mais provavelmente vai quebrar

As duas variáveis `NEXT_PUBLIC_SUPABASE_*` são **congeladas no bundle em
tempo de build** — não são lidas em runtime. Se o Render não repassar
`envVars` como **build arg** pro Docker, elas entram como `undefined` e
**setar no painel depois não resolve**; só um rebuild resolve.

Não deu pra confirmar isso daqui (exige a conta real). Por isso o
`apps/web/Dockerfile` agora avisa. **No primeiro build do `araci-web`,
procure no log:**

```
AVISO: NEXT_PUBLIC_SUPABASE_URL vazio no build -- sincronizacao ao vivo do quadro nao vai funcionar
```

- **Sem `AVISO`** → chegaram certo, siga em frente.
- **Com `AVISO`** → declare essas variáveis como *build arguments* nas
  configurações do serviço `araci-web` (além de env var) e faça
  **Clear build cache & deploy**.

(O aviso foi testado: dispara pra variável faltando e fica quieto pras
presentes.)

---

## 4. Depois do primeiro deploy verde

1. **Migrações** rodam sozinhas: `preDeployCommand:
   npm run db:migrate:deploy`. Confira no log do `araci-api`.
2. **Certificado**: `araci-api` → **Secret Files** → suba o
   `StudioAraci.pfx` em `/etc/secrets/StudioAraci.pfx` (caminho já
   apontado por `NFSE_CERTIFICATE_PATH`).
3. **Domínio**: aponte `plataforma.studioaraci.com.br` pro `araci-web`.
4. **Google OAuth** → adicione a URI de redirect de produção:
   `https://<seu-dominio>/api/auth/callback/google` **e**
   `https://<seu-dominio>/api/google/callback`.
5. **Logto** → adicione o redirect URI:
   `https://<seu-dominio>/api/quadro/callback`.
6. **Supabase** → é o MESMO projeto já usado em desenvolvimento (mesma
   URL/anon key, ver passo 0), e a policy de
   `docs/fase-0/supabase-realtime-policy.sql` já foi aplicada e
   verificada nele nesta sessão -- só reaplique se um dia migrar pra um
   projeto Supabase diferente (é estado do banco, não viaja com o
   repositório). **Antes de ir pra produção de verdade**, resolva o
   achado crítico A10 da auditoria de 30 ago 2026
   (`docs/auditoria-2026-08-30-detalhada.md`):
   1. Settings → API → **desligue a Data API** (`/rest/v1`) -- o código
      nunca a usa, e é a correção mais barata e mais eficaz das quatro
      abaixo.
   2. Rode `docs/fase-0/supabase-rls-lockdown.sql` no SQL Editor (RLS +
      REVOKE em toda tabela do schema `public`) -- defesa em
      profundidade, não substitui o passo 1.
   3. Considere separar o projeto Supabase do Realtime do quadro do
      projeto que hospeda o schema da aplicação -- a `anon key` publicada
      no bundle e os dados do estúdio hoje coabitam o mesmo projeto.
7. **Webhooks** — leia os valores gerados no painel do `araci-api` e
   configure nos provedores:
   - Asaas → `https://<seu-dominio>/api/webhooks/asaas`, header
     `asaas-access-token` = `ASAAS_WEBHOOK_AUTH_TOKEN`
   - ZapSign → `https://<seu-dominio>/api/webhooks/zapsign`, header
     `zapsign-webhook-token` = `ZAPSIGN_WEBHOOK_AUTH_TOKEN`

   (Apontam pro `araci-web` de propósito: o `araci-api` é privado e não
   tem domínio — ver `webhookPassthrough.ts`.)
8. **NFS-e continua em Homologação.** `Account.nfseAmbiente` nasce
   `"homologacao"`; virar produção é decisão explícita em
   Financeiro & Fiscal, não um efeito colateral do deploy.

---

## 5. Verificação

- [ ] `https://<dominio>/api/health` → `ok` (o web alcança o api)
- [ ] Login Google entra e o dashboard carrega
- [ ] **Google Drive — conectar credencial de admin**: logue com um
      usuário `role: admin` (não vale um membro comum), `/team` →
      "Sincronização Google" → **Conectar**, aceite os 3 escopos
      (Calendar, Gmail, Drive). Sem isso, `GoogleDriveService` rejeita
      com `GOOGLE_DRIVE_NOT_CONNECTED` — pastas de projeto no Drive e
      arquivamento do XML fiscal (emitir/cancelar/substituir NFS-e)
      ficam quebrados em silêncio até alguém notar (valida
      `GOOGLE_CLIENT_*` no api + a URI de redirect do passo 4 acima).
- [ ] Abrir um moodboard em duas abas → traço aparece nos dois
      (valida `NEXT_PUBLIC_SUPABASE_*` + policy; é o item do passo 3)
- [ ] Portal do cliente: pedir magic link e entrar (valida Resend + `WEB_URL`)
- [ ] `/quadro/login` → login de convidado via Logto
- [ ] Log do `araci-web` sem `AVISO:`

---

## O que já foi provado localmente (não precisa descobrir no deploy)

A topologia inteira foi executada em Docker antes deste runbook existir:
Postgres + `araci-api` (privado, sem porta publicada, como o `pserv`) +
`araci-web` (público), na mesma rede, com as **imagens de produção de
verdade**. Resultado:

- **Migrações rodam pela imagem**: `npm run db:migrate:deploy` (o mesmo
  `preDeployCommand` do `render.yaml`) aplicou **36 migrations** e criou
  **42 tabelas** num Postgres limpo. É a prova de que manter as
  devDependencies na imagem final serve pra alguma coisa.
- **`/health` do `araci-api` → `{"status":"ok"}`** — e ele faz
  `SELECT 1` de verdade, ou seja, a conexão com o banco funciona (o que
  também valida a correção do `openssl`/libssl no estágio final).
- **`/api/health` do `araci-web` → `{"status":"ok"}`** — esse endpoint
  só responde ok se alcançar o `araci-api`. É a prova de que o desenho
  BFF funciona entre containers, com o api sem porta publicada.
- **Autenticação ativa nas duas pontas**: `GET /api/v1/me` sem sessão →
  401 no proxy do web; `GET /v1/me` direto no api sem Bearer → 401 pelo
  AuthGuard. Ninguém alcança o api por fora.
- **Rota pública de apresentação com token inválido → 404**, não 500.

Ou seja: se algo falhar no Render, o suspeito **não** é o build das
imagens, a migração nem a comunicação entre os serviços — tudo isso já
rodou. Olhe primeiro pro passo 3 (build args) e pro passo 4 (o que não
viaja com o repositório: URIs de redirect, URLs de webhook).

**Ressalva honesta**: o Postgres usado nesse teste local foi um
`postgres:16-alpine` genérico em Docker, não o Supabase de verdade —
prova que a imagem/migração/app funcionam contra Postgres padrão, não
que a connection string específica do Supabase (pooler, `sslmode=require`)
já foi testada de ponta a ponta. Primeira coisa a conferir se
`araci-api` não subir: o log dele ao tentar conectar.

---

## Pendências conhecidas

- **Tamanho das imagens: resolvido.** O `araci-api` era 1,9GB; hoje é
  **293MB** — 85% menor. Três correções, cada uma medida:
  1. `.turbo` fora do contexto de build (1,92GB → 1,01GB);
  2. multi-stage, largando a camada de apt que sozinha era 590MB de
     960MB (→ 412MB);
  3. poda por workspace no builder: o `npm ci` da raiz instala TODOS os
     workspaces, então a imagem do api carregava `next` (201MB),
     `@next` (94MB), `sharp`, react e tldraw — nada disso roda ali
     (→ 293MB).
  O `araci-web` é 94MB. As devDependencies **continuam** na imagem final
  de propósito — o Pre-Deploy roda `prisma migrate deploy` contra ela.
  Por isso a poda seleciona *workspaces* em vez de usar `--omit=dev`:
  `next`/`react`/`tldraw` são dependências de PRODUÇÃO do apps/web (não
  sairiam), e o `prisma` é devDependency do packages/db (sairia junto,
  quebrando a migração).
- **JDK só existe pra satisfazer um postinstall** (`xsd-schema-validator`,
  transitivo da NFS-e) de código que não executamos — o validador padrão
  é o JS-based. Hoje ele fica só no estágio de build, fora da imagem
  final. Se a lib um dia tornar isso opcional, sai de vez.
- **Cuidado ao mexer no estágio final**: `openssl`/`ca-certificates` são
  instalados explicitamente ali. No estágio único o `libssl.so.3` vinha
  de carona com o toolchain; sem ele o motor do Prisma cai pra
  `openssl-1.1.x` em Debian 12 e a conexão com o Postgres (que exige
  SSL, seja Render ou Supabase) pode quebrar — e isso NÃO aparece em
  build, boot nem smoke test, só comparando os avisos do
  `prisma migrate` entre as duas imagens. Não remova aquelas duas linhas
  achando que são supérfluas.
- **`araci-web` no plano `free`**: `healthCheckPath: /api/health` fica
  declarado mesmo assim (é o que o Render usa pra saber que o deploy
  subiu com sucesso), mas não achei confirmação oficial de que esse
  ping específico da plataforma impede a hibernação por inatividade —
  assumindo que não impede (senão o free tier não hibernaria nunca,
  contradizendo o próprio propósito dele). Primeiro request depois de
  15min ocioso paga ~1min de cold start; isso é esperado, não bug.
- **`araci-fiscal-xml` (disco de 1GB) continua declarado sem uso real**
  — nada em `apps/api/src` escreve em `/data/fiscal`. A feature de
  arquivamento de XML fiscal assinado **já foi implementada** (ver
  `roadmap-atualizado.md`, seção "Arquivamento do XML fiscal no Drive +
  redesenho da substituição de NFS-e"), mas deliberadamente **não usa
  este disco** — reaproveita o Drive via `GoogleDriveService`, porque o
  disco do Render é efêmero (some no redeploy) e o Drive já tem o
  pipeline de pastas por projeto. O disco continua declarado por decisão
  do usuário ("posso usar depois"), não por essa feature.
- **Nada aqui foi executado contra o Render de verdade** — as duas
  imagens constroem localmente e estão sem segredos dentro, mas o
  blueprint em si (nomes de campo, `fromService`, `secretFiles`, e a
  ausência do bloco `databases:` que nunca foi testada) só é validado de
  fato no primeiro `Apply`.
- **Conexão com o Supabase Postgres em si não foi testada.** O e2e local
  usou um `postgres:16-alpine` genérico, não o Supabase real (que exige
  SSL e tem dois modos de connection string, direto vs pooler) — ver
  ressalva na seção anterior.
