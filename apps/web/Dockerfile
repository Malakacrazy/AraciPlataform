# Bloqueador 07 da auditoria: não existia nenhum artefato de
# empacotamento. Serviço PÚBLICO (ver render.yaml) -- é o único dos dois
# apps que pode ganhar o domínio plataforma.studioaraci.com.br.
FROM node:22-bookworm-slim AS builder
WORKDIR /repo

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/db/package.json packages/db/package.json
RUN npm ci

COPY . .

# NEXT_PUBLIC_* precisam existir NESTE momento -- são embutidos no
# bundle do cliente em tempo de build, não lidos em runtime (ver
# turbo.json: por isso entraram na lista de env vars que invalidam o
# cache do turbo). Passados como build arg porque não são segredo (ver
# comentário em .env.example) -- client ID/API key do Picker, já
# públicos em qualquer chamada OAuth/Picker do navegador.
ARG NEXT_PUBLIC_GOOGLE_CLIENT_ID
ARG NEXT_PUBLIC_GOOGLE_API_KEY
ARG NEXT_PUBLIC_GOOGLE_APP_ID
ARG NEXT_PUBLIC_SENTRY_DSN
# Achado real conferindo o Dockerfile contra o que o código de fato usa:
# estes dois faltavam. Foram introduzidos junto com o quadro colaborativo
# (Supabase Realtime), depois deste arquivo ter sido escrito, e ninguém
# voltou aqui. Sem eles a imagem sai com `undefined` embutido no bundle e
# a sincronização ao vivo nasce morta em produção -- e, pior, NÃO dá pra
# consertar pelo painel do Render depois, porque valor NEXT_PUBLIC_* é
# congelado no build, não lido em runtime.
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_GOOGLE_CLIENT_ID=$NEXT_PUBLIC_GOOGLE_CLIENT_ID
ENV NEXT_PUBLIC_GOOGLE_API_KEY=$NEXT_PUBLIC_GOOGLE_API_KEY
ENV NEXT_PUBLIC_GOOGLE_APP_ID=$NEXT_PUBLIC_GOOGLE_APP_ID
ENV NEXT_PUBLIC_SENTRY_DSN=$NEXT_PUBLIC_SENTRY_DSN
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY

# O modo de falha desta classe de bug é silencioso: build "passa", imagem
# sobe, e só semanas depois alguém percebe que uma feature nunca
# funcionou em produção. Como o valor fica congelado no bundle, descobrir
# tarde custa um rebuild inteiro. Então: avisa alto no log do build pra
# cada NEXT_PUBLIC_* vazio, dizendo o que especificamente quebra.
RUN for v in NEXT_PUBLIC_GOOGLE_CLIENT_ID:"seletor de arquivos do Google Drive (Picker)" \
             NEXT_PUBLIC_GOOGLE_API_KEY:"seletor de arquivos do Google Drive (Picker)" \
             NEXT_PUBLIC_GOOGLE_APP_ID:"seletor de arquivos do Google Drive (Picker)" \
             NEXT_PUBLIC_SUPABASE_URL:"sincronizacao ao vivo do quadro" \
             NEXT_PUBLIC_SUPABASE_ANON_KEY:"sincronizacao ao vivo do quadro" \
             NEXT_PUBLIC_SENTRY_DSN:"rastreamento de erro no navegador"; do \
      name="${v%%:*}"; what="${v#*:}"; \
      if [ -z "$(eval echo \$$name)" ]; then \
        echo "AVISO: $name vazio no build -- $what nao vai funcionar nesta imagem, e o valor fica congelado no bundle (nao adianta setar no painel depois)."; \
      fi; \
    done

RUN npx turbo run build --filter=web

# `output: "standalone"` (next.config.ts) traça, a partir da raiz do
# monorepo, só o subconjunto de node_modules que o servidor de produção
# de fato usa -- muito menor que copiar o node_modules inteiro do
# workspace. .next/standalone espelha a estrutura do monorepo
# (apps/web/server.js), não só o diretório do app.
FROM node:22-bookworm-slim AS runner
WORKDIR /repo

ENV NODE_ENV=production
COPY --from=builder /repo/apps/web/.next/standalone ./
COPY --from=builder /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /repo/apps/web/public ./apps/web/public

EXPOSE 3000
CMD ["node", "apps/web/server.js"]
