import { notFound } from "next/navigation";
import {
  getPresentation,
  getPresentationMoodboardBoard,
  listPresentationMoodboardComments,
  PublicApiError,
} from "@/lib/publicApi";
import type { PresentationData } from "@/lib/types";
import {
  setSpecificationApproval,
  submitSpecificationComment,
  saveMoodboardSnapshot,
  addMoodboardComment,
  listMoodboardComments,
} from "@/components/presentation/actions";
import { mintBoardRealtimeToken } from "@/lib/supabaseBoardToken";
import { STAGE_LABELS } from "@/lib/pep-stages";
import { CollaborativeBoard } from "@/components/moodboards/collaborative-board";

// Pedido direto do usuário: plantas do SketchUp LayOut chegam aqui pelo
// mesmo pipeline de "Documentos" já existente (Drive + visibleToClient).
// O PDF do LayOut em si é só um passo intermediário do processo interno
// (editado no Illustrator depois -- Photoshop não lida bem com PDF
// vetorial) -- o cliente nunca vê esse PDF, só a IMAGEM final exportada
// do Illustrator (PNG/JPEG), que é o que de fato sobe pro Drive marcado
// visível. O ramo "pdf" abaixo continua existindo pra outros documentos
// que legitimamente são PDF pro cliente (contrato, ART), não pra planta.
// Sem mimeType guardado no OfficeLink (só existe no momento do download,
// ver GoogleDriveService.downloadFile), a extensão do título é o sinal
// disponível sem esperar o arquivo inteiro só pra decidir como mostrar.
// Link puro (extensão desconhecida) cai no "other" -- mesmo
// comportamento de antes desta prévia inline existir.
// Achados A32/A45 da auditoria de 30 ago 2026: esta função é só um
// palpite de UX (que tag mostrar) -- não é mais o que decide se o
// conteúdo pode executar. PublicPresentationController.downloadDocument
// agora normaliza o Content-Type numa allowlist e força
// Content-Disposition: attachment pra qualquer coisa fora dela, então um
// título "planta.pdf" cujo conteúdo real seja HTML aparece aqui como
// iframe/PDF mas o navegador recebe application/octet-stream (não
// executa, no máximo baixa um arquivo vazio-parecendo-quebrado).
function previewKind(title: string): "pdf" | "image" | "other" {
  const lower = title.toLowerCase();
  if (lower.endsWith(".pdf")) return "pdf";
  if (/\.(png|jpe?g|gif|webp)$/.test(lower)) return "image";
  return "other";
}

// Rota pública -- sem getServerSession/redirect. Quem abre este link não
// tem conta: a única "autenticação" é possuir o token da URL (ver
// lib/publicApi.ts e PublicPresentationController em apps/api).
export default async function PresentationPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { token } = await params;
  const { error } = await searchParams;

  let data: PresentationData;
  try {
    data = await getPresentation(token);
  } catch (err) {
    if (err instanceof PublicApiError && err.status === 404) {
      notFound();
    }
    throw err;
  }

  // getPresentation acima já provou que este token vale pra este projeto,
  // e getPresentationMoodboardBoard reconfere que a prancha é dele (ver
  // PublicPresentationService.getOwnMoodboardAccountId) -- só então o
  // token do canal privado é emitido.
  const boards = await Promise.all(
    data.moodboards.map(async (board) => ({
      board: await getPresentationMoodboardBoard(token, board.id),
      comments: await listPresentationMoodboardComments(token, board.id),
      realtimeToken: await mintBoardRealtimeToken(board.id),
    })),
  );

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-8 px-6 py-12">
      <div>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">{data.client.name}</p>
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">{data.name}</h1>
      </div>

      {error && (
        <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      )}

      {data.documents.length > 0 && (
        <section className="flex flex-col gap-4">
          <h2 className="text-lg font-medium text-zinc-900 dark:text-zinc-50">Documentos</h2>
          <ul className="flex flex-col gap-4">
            {data.documents.map((doc) => {
              const href = `/present/${token}/documents/${doc.id}`;
              const kind = previewKind(doc.title);
              return (
                <li
                  key={doc.id}
                  className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm text-zinc-900 dark:text-zinc-50">{doc.title}</span>
                    <a
                      href={href}
                      target="_blank"
                      rel="noreferrer"
                      className="shrink-0 text-xs text-zinc-500 hover:underline dark:text-zinc-400"
                    >
                      Abrir em nova aba →
                    </a>
                  </div>
                  {(doc.documentType || doc.stage) && (
                    <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                      {doc.documentType}
                      {doc.documentType && doc.stage && " · "}
                      {doc.stage && (STAGE_LABELS[doc.stage] ?? doc.stage)}
                    </p>
                  )}
                  {/* Plantas exportadas do SketchUp LayOut (PDF) e outros
                      documentos com prévia direta -- iframe/img aponta pro
                      mesmo proxy de download, só embutido em vez de exigir
                      abrir em outra aba (ver PublicPresentationController.
                      downloadDocument). */}
                  {kind === "pdf" && (
                    <iframe
                      src={href}
                      title={doc.title}
                      className="mt-3 h-[70vh] w-full rounded-md border border-zinc-200 dark:border-zinc-800"
                    />
                  )}
                  {kind === "image" && (
                    // eslint-disable-next-line @next/next/no-img-element -- fonte é o proxy de download (Drive via credencial de admin), não um asset estático do build
                    <img
                      src={href}
                      alt={doc.title}
                      className="mt-3 max-h-[70vh] w-full rounded-md border border-zinc-200 object-contain dark:border-zinc-800"
                    />
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {boards.length > 0 && (
        <section className="flex flex-col gap-4">
          <h2 className="text-lg font-medium text-zinc-900 dark:text-zinc-50">Pranchas</h2>
          {boards.map(({ board, comments, realtimeToken }) => (
            <div
              key={board.id}
              className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950"
            >
              <h3 className="font-medium text-zinc-900 dark:text-zinc-50">{board.name}</h3>
              <div className="mt-3">
                <CollaborativeBoard
                  boardId={board.id}
                  initialSnapshot={board.snapshot}
                  initialComments={comments}
                  onSaveSnapshot={saveMoodboardSnapshot.bind(null, token, board.id)}
                  onAddComment={addMoodboardComment.bind(null, token, board.id)}
                  onRefreshComments={listMoodboardComments.bind(null, token, board.id)}
                  realtimeToken={realtimeToken}
                />
              </div>
            </div>
          ))}
        </section>
      )}

      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-medium text-zinc-900 dark:text-zinc-50">Especificações por ambiente</h2>
        {data.areas.length === 0 && (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">Nenhum ambiente especificado ainda.</p>
        )}
        {data.areas.map((area) => (
          <div
            key={area.id}
            className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950"
          >
            <h3 className="font-medium text-zinc-900 dark:text-zinc-50">{area.name}</h3>
            {area.specifications.length === 0 ? (
              <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">Nenhum produto especificado ainda.</p>
            ) : (
              <ul className="mt-3 flex flex-col gap-4">
                {area.specifications.map((spec) => (
                  <li key={spec.id} className="flex flex-col gap-2 border-t border-zinc-100 pt-3 dark:border-zinc-900 first:border-0 first:pt-0">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm text-zinc-900 dark:text-zinc-50">
                          {spec.product.name} <span className="text-zinc-500 dark:text-zinc-400">× {spec.quantity}</span>
                        </p>
                        {spec.unitPrice && (
                          <p className="mt-1 font-mono text-xs text-zinc-500 dark:text-zinc-400">
                            R$ {Number(spec.unitPrice).toLocaleString("pt-BR")}
                          </p>
                        )}
                      </div>
                      <form action={setSpecificationApproval.bind(null, token, spec.id, !spec.clientApproved)}>
                        <button
                          type="submit"
                          className={
                            spec.clientApproved
                              ? "rounded-md border border-emerald-600 px-3 py-1 text-xs text-emerald-700 dark:text-emerald-400"
                              : "rounded-md bg-zinc-900 px-3 py-1 text-xs text-white dark:bg-zinc-50 dark:text-zinc-900"
                          }
                        >
                          {spec.clientApproved ? "Aprovado ✓ (desfazer)" : "Aprovar"}
                        </button>
                      </form>
                    </div>
                    <form
                      action={submitSpecificationComment.bind(null, token, spec.id)}
                      className="flex items-center gap-2"
                    >
                      <input
                        name="comment"
                        defaultValue={spec.clientComment ?? ""}
                        placeholder="Deixe um comentário…"
                        className="w-full rounded border border-zinc-300 bg-transparent px-2 py-1 text-sm text-zinc-900 dark:border-zinc-700 dark:text-zinc-50"
                      />
                      <button type="submit" className="text-xs text-zinc-500 hover:underline dark:text-zinc-400">
                        Salvar
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </section>
    </main>
  );
}
