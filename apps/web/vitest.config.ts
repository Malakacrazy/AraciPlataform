import { defineConfig } from "vitest/config";
import path from "node:path";

// apps/web não tinha nenhuma infra de teste de componente (achado do
// próprio plano de migração tldraw->Excalidraw, §8) -- Vitest em vez de
// Jest (o runner que apps/api usa) de propósito: @excalidraw/excalidraw
// é ESM puro ("type": "module", sem build CJS -- ver package.json da
// lib), e Jest exigiria uma configuração de interop ESM/CJS frágil só
// pra essa dependência. Vitest resolve ESM nativamente (roda sobre
// Vite/esbuild), sem esse atrito.
export default defineConfig({
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    // @excalidraw/excalidraw e sua dependência roughjs usam specifiers
    // ESM sem extensão (ex.: "roughjs/bin/rough") que o resolver nativo
    // do Node em modo ESM estrito rejeita -- funcionam num bundler
    // (webpack/Turbopack do próprio Next, achado real rodando isto)
    // porque bundlers são mais permissivos com extensão. `inline` força
    // essas duas a passar pelo resolver do próprio Vite (mais parecido
    // com um bundler) em vez do loader nativo do Node.
    server: {
      deps: {
        inline: [/@excalidraw\//, /roughjs/],
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
