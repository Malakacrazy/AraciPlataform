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
| DSN do Sentry (opcional) | sentry.io → Client Keys |

> **Banco**: o `render.yaml` declara um Postgres gerenciado do próprio
> Render (`araci-postgres`). Se você preferir o Prisma Postgres, veja
> "Variante: banco externo" no fim.

---

## 1. Aplicar o blueprint

1. Render → **New** → **Blueprint**.
2. Conecte o repositório `Malakacrazy/AraciPlataform`, branch `main`.
3. O Render lê o `render.yaml` e propõe **3 recursos**: `araci-postgres`
   (banco), `araci-api` (privado, sem domínio) e `araci-web` (público).
4. **Não confirme ainda** — ele vai pedir os valores marcados
   `sync: false` (passo 2).

---

## 2. Segredos que você digita (`sync: false`)

**`araci-api`** — `ALLOWED_EMAILS`, `GOOGLE_CLIENT_ID`,
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
6. **Supabase** → no projeto que produção usa, aplique
   `docs/fase-0/supabase-realtime-policy.sql` (SQL Editor). É estado do
   banco, **não viaja com o repositório** — sem isso o quadro sobe sem
   sincronização ao vivo.
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
- [ ] `/team` → conectar o Drive funciona (valida `GOOGLE_CLIENT_*` no api)
- [ ] Abrir um moodboard em duas abas → traço aparece nos dois
      (valida `NEXT_PUBLIC_SUPABASE_*` + policy; é o item do passo 3)
- [ ] Portal do cliente: pedir magic link e entrar (valida Resend + `WEB_URL`)
- [ ] `/quadro/login` → login de convidado via Logto
- [ ] Log do `araci-web` sem `AVISO:`

---

## Variante: banco externo (Prisma Postgres etc.)

O `render.yaml` cria um Postgres do Render e injeta `DATABASE_URL` via
`fromDatabase`. Pra usar outro banco: remova o bloco `databases:` e a
referência `fromDatabase` no `araci-api`, e declare `DATABASE_URL` como
`sync: false`, colando a connection string. O resto não muda —
`prisma migrate deploy` roda igual no `preDeployCommand`.

---

## Pendências conhecidas

- **Tamanho das imagens: resolvido.** O `araci-api` era 1,9GB; hoje é
  **412MB**. Duas correções: excluir o `.turbo` do contexto de build
  (1,92GB → 1,01GB) e passar a imagem pra multi-stage, largando a camada
  de apt que sozinha era 590MB dos 960MB (59%). O `araci-web` é 94MB.
  As devDependencies **continuam** na imagem final de propósito — o
  Pre-Deploy roda `prisma migrate deploy` contra ela.
- **JDK só existe pra satisfazer um postinstall** (`xsd-schema-validator`,
  transitivo da NFS-e) de código que não executamos — o validador padrão
  é o JS-based. Hoje ele fica só no estágio de build, fora da imagem
  final. Se a lib um dia tornar isso opcional, sai de vez.
- **Cuidado ao mexer no estágio final**: `openssl`/`ca-certificates` são
  instalados explicitamente ali. No estágio único o `libssl.so.3` vinha
  de carona com o toolchain; sem ele o motor do Prisma cai pra
  `openssl-1.1.x` em Debian 12 e a conexão com o Postgres do Render (que
  exige SSL) pode quebrar — e isso NÃO aparece em build, boot nem
  smoke test, só comparando os avisos do `prisma migrate` entre as duas
  imagens. Não remova aquelas duas linhas achando que são supérfluas.
- **Nada aqui foi executado contra o Render de verdade** — as duas
  imagens constroem localmente e estão sem segredos dentro, mas o
  blueprint em si (nomes de campo, `fromService`, `secretFiles`) só é
  validado de fato no primeiro `Apply`.
