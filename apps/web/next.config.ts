import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Bloqueador 07 da auditoria: sem isso, o Dockerfile teria que copiar
  // o node_modules inteiro do monorepo pra imagem final. `standalone`
  // faz o Next descobrir e empacotar só o subconjunto de dependências
  // que o servidor de produção de fato usa.
  output: "standalone",
  // Achado A58 da auditoria de 30 ago 2026: Server Actions do Next têm
  // teto próprio de 1MB por padrão -- o snapshot do tldraw (shapes +
  // assets, imagem de referência vira base64 embutido) estoura isso.
  // MESMO número de apps/api/src/main.ts (SNAPSHOT_BODY_LIMIT) -- os
  // dois lados do corpo (Server Action → apps/api) precisam concordar.
  experimental: {
    serverActions: {
      bodySizeLimit: "5mb",
    },
  },
  // Achados A32/A45 da auditoria de 30 ago 2026: o app não emitia NENHUM
  // cabeçalho de segurança. nosniff/Referrer-Policy/frame-ancestors são
  // baixo risco de quebrar algo (não restringem script/conexão que o
  // próprio app precisa, só o que OUTRA origem pode fazer com esta) --
  // uma CSP completa (default-src etc.) fica de fora deliberadamente
  // desta rodada: exige testar toda página real num navegador pra não
  // quebrar Supabase Realtime/Google OAuth/Sentry/fontes sem aviso, o
  // que esta sessão não consegue fazer (ver docs/fase-0/roadmap-atualizado.md).
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
        ],
      },
    ];
  },
};

export default nextConfig;
