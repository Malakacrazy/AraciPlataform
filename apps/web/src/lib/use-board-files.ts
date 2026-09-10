"use client";

// Mesma fronteira client-only de board-scene.ts/use-board-sync.ts -- só
// alcançado através de excalidraw-canvas.tsx (atrás do next/dynamic
// ssr:false em collaborative-board.tsx). Os TIPOS importados aqui são
// import type (erasados em compilação), então não recriam o problema de
// SSR mesmo se este arquivo fosse alcançado de outro lugar -- mas o uso
// de `api.onChange`/`api.getFiles`/`api.addFiles` só faz sentido dentro
// do próprio Excalidraw montado de qualquer forma.
import { useEffect, useRef } from "react";
import * as Sentry from "@sentry/nextjs";
import type { ExcalidrawImperativeAPI, BinaryFileData } from "@excalidraw/excalidraw/types";

// Espelha MAX_ALLOWED_FILE_BYTES da própria lib (enforced depois do
// resize, ver constants.ts) e IMAGE_UPLOAD_LIMIT_BYTES do backend
// (moodboard-files.service.ts) -- mesma disciplina de comentário gêmeo
// já usada em SNAPSHOT_BODY_LIMIT/IMAGE_UPLOAD_LIMIT em main.ts.
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

// SVG fica de fora aqui também (ver plano de migração tldraw->Excalidraw
// §5.2, achados A32/A45 da auditoria) -- normalizeSVG da própria lib não
// sanitiza, e o backend já rejeita com 415; recusar antes de tentar o
// upload evita o round-trip.
const REJECTED_MIME_TYPES = new Set(["image/svg+xml"]);

// Backoff do "trigger de reparo". fetchMissingFile roda a cada onChange
// -- ou seja ~60x por segundo enquanto alguém arrasta o mouse -- e a
// primeira versão limpava fetchingRef no finally sem memorizar NADA sobre
// a falha. Um fileId que devolve 404 (o caso comum e legítimo: o upload
// do peer ainda não chegou ao Postgres) virava uma requisição por
// onChange, indefinidamente, pra CADA participante ao mesmo tempo: o
// board tenta se reparar e, ao fazê-lo, martela a própria API.
//
// Nem "desiste pra sempre" serve, porque aí a imagem do peer nunca
// apareceria. Tentativas com backoff exponencial, teto pequeno, e um
// aviso no Sentry no fim -- desistir em silêncio é o que a regra 12
// proíbe.
const MAX_FETCH_ATTEMPTS = 6;
const FETCH_BACKOFF_BASE_MS = 1_000;

function dataUrlToBytes(dataUrl: string): { bytes: Uint8Array; labelMimeType: string } {
  const commaIdx = dataUrl.indexOf(",");
  const header = dataUrl.slice(0, commaIdx);
  const base64 = dataUrl.slice(commaIdx + 1);
  const mimeMatch = /^data:([^;]+)/.exec(header);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return { bytes, labelMimeType: mimeMatch?.[1] ?? "application/octet-stream" };
}

// Deriva do CONTEÚDO, nunca do rótulo -- ver plano §5.2: resizeImageFile
// roda image-blob-reduce -> pica.toBlob(canvas, blob.type), e por spec
// canvas.toBlob cai pra image/png quando o navegador não sabe codificar
// o tipo pedido (nenhum navegador reencoda GIF/AVIF a partir de canvas).
// O dataURL que a própria lib produz pode ficar rotulado com o mimeType
// ORIGINAL (ex. image/gif) mesmo carregando bytes PNG de verdade -- os
// bytes nunca mentem.
function sniffMimeType(bytes: Uint8Array): string | null {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return "image/png";
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (bytes.length >= 6 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38) {
    return "image/gif";
  }
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) {
    return "image/webp";
  }
  if (bytes.length >= 2 && bytes[0] === 0x42 && bytes[1] === 0x4d) {
    return "image/bmp";
  }
  return null;
}

interface Options {
  // "/api/moodboards/:id/files" (staff) | "/present/:token/files/:id"
  // (cliente) | "/quadro/files/:id" (convidado) -- montado pelo chamador
  // (collaborative-board.tsx), que é quem sabe qual surface é este.
  filesBaseUrl: string;
  surface: "staff" | "client" | "guest";
  boardId: string;
  excalidrawAPI: ExcalidrawImperativeAPI | null;
}

// Imagens nunca atravessam o canal Realtime nem o snapshot/scene salvo
// (ver plano §5.2/B5) -- elementos carregam só um `fileId`, os bytes em
// si sobem/descem por aqui, através das Route Handlers da Fase 2 (nunca
// Server Actions, ver lib/binaryProxy.ts). "Trigger de reparo" do plano
// §5.1.2 ("elemento de imagem cujo fileId não está em getFiles()") é
// exatamente o que fetchMissingFile cobre -- roda a cada onChange,
// inclusive o disparado pela própria aplicação de um delta remoto.
export function useBoardFiles({ filesBaseUrl, surface, boardId, excalidrawAPI }: Options) {
  const uploadedRef = useRef(new Set<string>());
  const fetchingRef = useRef(new Set<string>());
  const failedRef = useRef(new Map<string, { attempts: number; retryAfter: number }>());

  useEffect(() => {
    if (!excalidrawAPI) return;
    const api = excalidrawAPI;

    async function uploadFile(fileId: string, file: BinaryFileData) {
      if (uploadedRef.current.has(fileId)) return;
      // Otimista, antes do fetch -- files[fileId] é o MESMO objeto em
      // todo onChange subsequente enquanto nada muda nele, sem isto
      // reenviaríamos a mesma imagem a cada traço em QUALQUER lugar da
      // cena (onChange dispara pra qualquer mudança, não só na imagem).
      uploadedRef.current.add(fileId);

      try {
        const { bytes, labelMimeType } = dataUrlToBytes(file.dataURL);
        const mimeType = sniffMimeType(bytes) ?? labelMimeType;
        if (REJECTED_MIME_TYPES.has(mimeType)) {
          Sentry.captureMessage(`upload de imagem pulado: tipo rejeitado ${mimeType}`, { tags: { surface, boardId } });
          return;
        }
        if (bytes.byteLength > MAX_IMAGE_BYTES) {
          Sentry.captureMessage(`upload de imagem pulado: ${bytes.byteLength} bytes acima do limite`, {
            tags: { surface, boardId },
          });
          return;
        }
        const res = await fetch(`${filesBaseUrl}/${fileId}`, {
          method: "PUT",
          headers: { "Content-Type": mimeType },
          // Blob, não o Uint8Array cru -- mesmo motivo do new Uint8Array()
          // em moodboard-blob-store.ts: TS lib.dom quer um BlobPart
          // estrito (ArrayBufferView<ArrayBuffer>), e o Uint8Array vindo
          // de dataUrlToBytes é tipado como ArrayBufferLike (aceitaria
          // SharedArrayBuffer) -- reenvolver reseta o tipo genérico.
          body: new Blob([new Uint8Array(bytes)], { type: mimeType }),
        });
        if (!res.ok) {
          uploadedRef.current.delete(fileId); // libera pra tentar de novo no próximo onChange
          const body = await res.json().catch(() => null);
          Sentry.captureException(new Error(`upload de imagem falhou: ${body?.error?.message ?? res.status}`), {
            tags: { surface, boardId },
          });
        }
      } catch (err) {
        uploadedRef.current.delete(fileId);
        Sentry.captureException(err, { tags: { surface, boardId } });
      }
    }

    // `permanent` pros status em que tentar de novo não muda nada (403 do
    // token/sessão, 400 de caminho inválido): vai direto pro teto em vez
    // de queimar seis rodadas de backoff.
    function noteFetchFailure(fileId: string, reason: string, permanent: boolean) {
      const prev = failedRef.current.get(fileId);
      const attempts = permanent ? MAX_FETCH_ATTEMPTS : (prev?.attempts ?? 0) + 1;
      failedRef.current.set(fileId, {
        attempts,
        retryAfter: Date.now() + FETCH_BACKOFF_BASE_MS * 2 ** Math.min(attempts - 1, 5),
      });
      if (attempts >= MAX_FETCH_ATTEMPTS && (prev?.attempts ?? 0) < MAX_FETCH_ATTEMPTS) {
        // Uma vez só, na virada -- não um evento por onChange.
        Sentry.captureMessage(`imagem ${fileId} não pôde ser carregada (${reason}); desistindo`, {
          tags: { surface, boardId },
        });
      }
    }

    async function fetchMissingFile(fileId: string) {
      if (fetchingRef.current.has(fileId) || api.getFiles()[fileId]) return;
      const failure = failedRef.current.get(fileId);
      if (failure && (failure.attempts >= MAX_FETCH_ATTEMPTS || Date.now() < failure.retryAfter)) return;
      fetchingRef.current.add(fileId);
      try {
        const res = await fetch(`${filesBaseUrl}/${fileId}`, { cache: "force-cache" });
        if (!res.ok) {
          // Degrada quieto na tela (mesmo espírito de updateImageCache da
          // própria lib), mas com memória: um 404 aqui quase sempre é "o
          // upload do peer ainda não chegou", que o backoff cobre.
          noteFetchFailure(fileId, `HTTP ${res.status}`, res.status === 400 || res.status === 401 || res.status === 403);
          return;
        }
        const mimeType = res.headers.get("content-type") ?? "application/octet-stream";
        const blob = await res.blob();
        const dataURL = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = () => reject(reader.error ?? new Error("FileReader falhou"));
          reader.readAsDataURL(blob);
        });
        api.addFiles([
          {
            id: fileId as BinaryFileData["id"],
            dataURL: dataURL as BinaryFileData["dataURL"],
            mimeType: mimeType as BinaryFileData["mimeType"],
            created: Date.now(),
          },
        ]);
        uploadedRef.current.add(fileId); // já veio de algum lugar -- nunca precisa "subir" de novo
        failedRef.current.delete(fileId);
      } catch (err) {
        // Pelo mesmo caminho do !res.ok: sem isso, uma falha de rede
        // gerava um captureException por onChange -- o mesmo storm, só
        // que no Sentry em vez da API.
        noteFetchFailure(fileId, (err as Error).message, false);
      } finally {
        fetchingRef.current.delete(fileId);
      }
    }

    const unsubOnChange = api.onChange((elements, _appState, files) => {
      for (const [fileId, file] of Object.entries(files)) {
        void uploadFile(fileId, file);
      }
      for (const el of elements) {
        if (el.type === "image" && el.fileId && !files[el.fileId]) {
          void fetchMissingFile(el.fileId);
        }
      }
    });

    return () => {
      unsubOnChange();
    };
  }, [excalidrawAPI, filesBaseUrl, surface, boardId]);
}
