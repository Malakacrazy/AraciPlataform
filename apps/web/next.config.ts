import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Bloqueador 07 da auditoria: sem isso, o Dockerfile teria que copiar
  // o node_modules inteiro do monorepo pra imagem final. `standalone`
  // faz o Next descobrir e empacotar só o subconjunto de dependências
  // que o servidor de produção de fato usa.
  output: "standalone",
};

export default nextConfig;
