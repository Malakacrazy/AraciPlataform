import Link from "next/link";
import { redirect } from "next/navigation";
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import {
  getGuestBoard,
  listGuestBoardComments,
  WhiteboardGuestPortalApiError,
  SESSION_COOKIE,
} from "@/lib/whiteboardGuestPortalApi";
import { saveGuestSnapshot, addGuestComment } from "@/components/whiteboard-guest-portal/actions";
import { CollaborativeBoard } from "@/components/moodboards/collaborative-board";

export default async function QuadroBoardPage({ params }: { params: Promise<{ boardId: string }> }) {
  const { boardId } = await params;
  const sessionToken = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!sessionToken) {
    redirect(`/quadro/login?board=${encodeURIComponent(boardId)}`);
  }

  let board: Awaited<ReturnType<typeof getGuestBoard>>;
  let comments: Awaited<ReturnType<typeof listGuestBoardComments>>;
  try {
    [board, comments] = await Promise.all([
      getGuestBoard(sessionToken, boardId),
      listGuestBoardComments(sessionToken, boardId),
    ]);
  } catch (err) {
    if (err instanceof WhiteboardGuestPortalApiError && err.status === 401) {
      redirect("/quadro/login");
    }
    // 403 (sessão válida, mas sem acesso a ESTE quadro) e 404 caem aqui
    // -- mesmo raciocínio de CollaboratorPortalService.getProject:
    // sessão continua boa, só não abrange este recurso.
    if (err instanceof WhiteboardGuestPortalApiError) {
      notFound();
    }
    throw err;
  }

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-4 px-6 py-12">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/quadro" className="text-xs text-zinc-500 hover:underline dark:text-zinc-400">
            ← Meus quadros
          </Link>
          <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">{board.name}</h1>
        </div>
      </div>

      <CollaborativeBoard
        boardId={board.id}
        initialSnapshot={board.snapshot}
        initialComments={comments}
        onSaveSnapshot={saveGuestSnapshot.bind(null, board.id)}
        onAddComment={addGuestComment.bind(null, board.id)}
      />
    </main>
  );
}
