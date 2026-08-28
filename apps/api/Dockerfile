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
# aqui: imagem um pouco maior, zero infraestrutura extra pra manter.
FROM node:22-bookworm-slim AS base
WORKDIR /repo

# Toolchain de build nativo -- rede de segurança caso não exista binário
# pré-compilado de libxmljs2 (dependência transitiva de @nfewizard/shared
# via a integração de NFS-e) pra esta combinação exata de Node/arch/OS,
# e a instalação caia em node-gyp.
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
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
RUN npx turbo run build --filter=api...

ENV NODE_ENV=production
EXPOSE 3001

# dist/main.js já inclui `import 'dotenv/config'` no topo (ver
# src/main.ts) -- não afeta produção porque process.env já vem populado
# pela plataforma; só é um no-op quando não existe .env pra carregar.
CMD ["node", "apps/api/dist/main.js"]
