// Auto-hospeda as fontes do Excalidraw em vez de deixar o navegador
// buscar em https://esm.sh/@excalidraw/excalidraw@.../dist/prod/ -- ver
// plano de migração tldraw->Excalidraw §6.5. Precisa rodar ANTES de
// `next build` (chamado do próprio script "build", ver package.json):
// a imagem final (apps/web/Dockerfile) só copia .next/standalone,
// .next/static e apps/web/public depois do build já ter terminado, e o
// bootstrap de EXCALIDRAW_ASSET_PATH="/" (ver app/layout.tsx) espera
// encontrar public/fonts/<Família>/<arquivo>.woff2 -- mesma estrutura
// de dist/prod/fonts na própria lib, só copiada pra dentro do domínio
// da própria aplicação em vez de servida por um CDN de terceiro numa
// superfície não-autenticada (/present/[token]).
import { cp, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const src = path.resolve(here, "../../../node_modules/@excalidraw/excalidraw/dist/prod/fonts");
const dest = path.resolve(here, "../public/fonts");

if (!existsSync(src)) {
  console.error(`[copy-excalidraw-fonts] fonte não encontrada: ${src} -- @excalidraw/excalidraw instalado?`);
  process.exit(1);
}

await rm(dest, { recursive: true, force: true });
await cp(src, dest, { recursive: true });
console.log(`[copy-excalidraw-fonts] copiado ${src} -> ${dest}`);
