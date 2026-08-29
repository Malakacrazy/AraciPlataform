# Bloqueador 07 da auditoria: não existia nenhum artefato de
# empacotamento. Serviço PRIVADO (ver render.yaml) -- nunca deve ganhar
# um domínio público; apps/web fala com ele por HTTP simples dentro da
# rede interna do Render, carregando o INTERNAL_API_SECRET em texto
# claro (ver AuthGuard), o que só é seguro numa rede privada.
#
# Mantém as devDependencies na imagem final de propósito (não faz um
# estágio "--omit=dev" separado): prisma migrate deploy precisa da
# árvore TypeScript e do CLI do Prisma (devDependency) pra rodar --
# achado da própria auditoria ("uma imagem npm ci --omit=dev não
# consegue migrar"). Rodar o Pre-Deploy Command do Render contra esta
# MESMA imagem, sem um job/init-container separado, é a troca deliberada
# aqui: zero infraestrutura extra pra manter.
#
# Multi-stage: o que sai da imagem final NÃO são as devDependencies (essas
# continuam, pelo motivo acima) -- é o TOOLCHAIN DE SISTEMA. A camada de
# apt (JDK + python3/make/g++) media 590MB numa imagem de 1,01GB, ou seja
# 59% do total, pra compilar coisas que ninguém executa em runtime.
# Medido, não estimado: 1,01GB antes deste estágio, ver commit.
#
# O `COPY --from=builder /repo ./` leva a árvore inteira já construída
# (node_modules com devDependencies, dist, prisma/schema+migrations,
# prisma.config.ts). O toolchain fica pra trás sozinho porque são pacotes
# do SO, instalados FORA de /repo -- não precisa listar o que excluir,
# que é justamente o tipo de lista que envelhece mal.
FROM node:22-bookworm-slim AS builder
WORKDIR /repo

# Toolchain de build nativo -- rede de segurança caso não exista binário
# pré-compilado de libxmljs2 (dependência transitiva de @nfewizard/shared
# via a integração de NFS-e) pra esta combinação exata de Node/arch/OS,
# e a instalação caia em node-gyp.
#
# default-jdk-headless: exigido pelo POSTINSTALL de xsd-schema-validator
# (dependência transitiva de @nfewizard/shared), que compila um helper
# Java e faz `npm ci` inteiro falhar sem JDK -- achado rodando
# `docker build` de verdade pela primeira vez:
#   [xsd-schema-validator] Compiling helper...
#   Error: Java SDK required at JAVA_HOME or in path
#
# O helper em si NÃO é usado por este projeto: @nfewizard/shared tem dois
# validadores de schema, e o padrão documentado é o
# `validateSchemaJsBased` (libxmljs2 + xsd-assembler, sem JDK) -- o
# Java-based só entra se `lib.useForSchemaValidation` pedir. Prova
# prática: neste repositório o helper nunca chegou a compilar (só o
# XMLValidator.java existe em node_modules/xsd-schema-validator/support,
# sem .class) e mesmo assim as emissões reais contra a Homologação da
# SEFIN funcionaram. Ou seja: o JDK está aqui só pra satisfazer um
# postinstall de código que não executamos.
#
# Custo: ~200MB na imagem. A alternativa (multi-stage, JDK só no estágio
# de instalação) é uma otimização legítima mas mexe no desenho de estágio
# único que este arquivo escolheu de propósito (ver comentário no topo:
# o Pre-Deploy Command do Render roda `prisma migrate deploy` contra
# ESTA mesma imagem). Fica registrado como melhoria possível, não feita
# junto com a correção que faz o build passar.
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ ca-certificates default-jdk-headless \
  && rm -rf /var/lib/apt/lists/*

# Copia só os manifests primeiro -- cache de camada do Docker permite
# reusar o `npm ci` (a etapa mais lenta) entre builds que só mudaram
# código-fonte, não dependências.
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/db/package.json packages/db/package.json
RUN npm ci

COPY . .

# turbo resolve a ordem certa sozinho (build de api depende do build de
# @araci/db, que por sua vez depende de `generate` -- ver turbo.json).
#
# DATABASE_URL de mentira só pra ESTE comando: `prisma generate` carrega
# packages/db/prisma.config.ts, que resolve datasource.url na hora e
# aborta com `PrismaConfigEnvError: Cannot resolve environment variable:
# DATABASE_URL` se ela não existir. Nenhum passo deste build conecta em
# banco nenhum -- é o mesmo truque (e o mesmo motivo) do env DATABASE_URL
# no .github/workflows/ci.yml.
#
# Inline no RUN de propósito, NÃO como `ENV`: assim não fica gravada na
# imagem e não há risco de, em runtime, uma variável de brincadeira
# sombrear a real que o Render injeta (ver render.yaml, fromDatabase).
#
# Isto só apareceu depois do .dockerignore passar a excluir `.env`: antes
# o build vinha pegando o packages/db/.env copiado junto pelo `COPY . .`
# -- ou seja, dependia silenciosamente de um arquivo de segredo entrar na
# imagem. Corrigir o vazamento expôs a dependência real.
RUN DATABASE_URL="postgresql://build:build@localhost:5432/build" \
    npx turbo run build --filter=api...

# Poda: reinstala node_modules só com os workspaces que o api precisa,
# DEPOIS de compilar. Medido dentro da imagem anterior: o `npm ci` da
# raiz instala TODOS os workspaces, então a imagem do api carregava o
# apps/web inteiro junto -- `next` 201MB, `@next` 94MB, `@img` (sharp)
# 27MB, mais react/tldraw. Nada disso roda aqui.
#
# `--omit=dev` NÃO resolveria: `next`/`react`/`tldraw` são dependências
# de PRODUÇÃO do apps/web (só somem excluindo o workspace), e o `prisma`
# -- que o Pre-Deploy Command precisa -- é devDependency do packages/db,
# então seria removido junto. Selecionar workspace é o corte certo.
#
# Feito AQUI, e não no estágio final, porque este `npm ci` também dispara
# o postinstall do xsd-schema-validator, que exige o JDK. No estágio
# final isso obrigaria a reinstalar 590MB de JDK e anularia a economia
# inteira (tentado, falhou exatamente assim).
RUN npm ci --include-workspace-root --workspace=apps/api --workspace=packages/db

# `npm ci` apaga o node_modules, e com ele o client gerado do Prisma
# (node_modules/.prisma) -- precisa gerar de novo depois da poda.
RUN DATABASE_URL="postgresql://build:build@localhost:5432/build" \
    npm run generate --workspace=packages/db

# ---------------------------------------------------------------------
# Imagem final: mesma base, SEM o toolchain de compilação nem o JDK.
# ---------------------------------------------------------------------
FROM node:22-bookworm-slim AS runner
WORKDIR /repo

# openssl + ca-certificates: NÃO é excesso de zelo, é regressão real que
# este estágio introduziu e que só apareceu testando a imagem pronta.
# No estágio único o libssl.so.3 vinha de carona junto do toolchain
# (ca-certificates/JDK); ao largar aquela camada, a imagem final ficou
# SEM libssl nenhum, e o motor do Prisma (Rust) reclamava:
#   prisma:warn Prisma failed to detect the libssl/openssl version to
#   use... Defaulting to "openssl-1.1.x"
# em Debian 12, que é openssl 3.x. Medido: `clean` 0 avisos e
# libssl.so.3 presente; `multi` sem a linha abaixo, 2 avisos e nenhum
# libssl. O Postgres do Render exige SSL, então isso tinha chance real
# de quebrar a conexão em produção.
#
# ca-certificates junto porque o motor do Prisma e as chamadas de saída
# (SEFIN, Asaas, ZapSign, Resend, Google) validam TLS contra a store do
# SISTEMA -- o Node traz CAs próprias embutidas, o resto não.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# Árvore já construída E já podada (ver o passo de poda no builder). O
# toolchain fica pra trás sozinho porque é pacote do SO, fora de /repo.
COPY --from=builder /repo ./

ENV NODE_ENV=production
EXPOSE 3001

# dist/main.js já inclui `import 'dotenv/config'` no topo (ver
# src/main.ts) -- não afeta produção porque process.env já vem populado
# pela plataforma; só é um no-op quando não existe .env pra carregar.
CMD ["node", "apps/api/dist/main.js"]
