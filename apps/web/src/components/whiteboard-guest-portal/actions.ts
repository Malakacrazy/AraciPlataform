"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import {
  SESSION_COOKIE,
  saveGuestBoardSnapshot,
  addGuestBoardComment,
  listGuestBoardComments,
  logoutGuestSession,
  WhiteboardGuestPortalApiError,
} from "@/lib/whiteboardGuestPortalApi";
import type { MoodboardComment } from "@/lib/types";

export async function logoutGuest() {
  // Revoga no servidor antes de apagar o cookie -- mesmo achado/racional
  // de portal/actions.ts#logoutPortal.
  const sessionToken = (await cookies()).get(SESSION_COOKIE)?.value;
  if (sessionToken) {
    await logoutGuestSession(sessionToken);
  }
  (await cookies()).delete({ name: SESSION_COOKIE, path: "/quadro" });
  redirect("/quadro/login");
}

// Sessão vem do cookie httpOnly, não de um argumento -- ninguém chamando
// isto do lado do cliente pode forjar a sessão de outro convidado
// passando um token diferente (mesmo raciocínio de logoutGuest acima).
// Sem redirect/revalidatePath de propósito, mesmo motivo das ações
// equivalentes em components/moodboards/actions.ts e
// components/presentation/actions.ts: chamada com debounce a cada pausa
// no desenho, não pode recarregar a página inteira toda vez.
export async function saveGuestSnapshot(boardId: string, snapshot: unknown): Promise<void> {
  const sessionToken = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!sessionToken) {
    throw new Error("Sessão de convidado ausente.");
  }
  await saveGuestBoardSnapshot(sessionToken, boardId, snapshot);
}

export async function addGuestComment(boardId: string, body: string): Promise<MoodboardComment> {
  const sessionToken = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!sessionToken) {
    throw new Error("Sessão de convidado ausente.");
  }
  try {
    return await addGuestBoardComment(sessionToken, boardId, body);
  } catch (err) {
    throw new Error(err instanceof WhiteboardGuestPortalApiError ? err.message : "Não foi possível enviar o comentário.");
  }
}

// Ver comentário equivalente em components/moodboards/actions.ts: o canal
// Realtime só avisa, o conteúdo do comentário vem sempre do apps/api.
export async function listGuestComments(boardId: string): Promise<MoodboardComment[]> {
  const sessionToken = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!sessionToken) {
    throw new Error("Sessão de convidado ausente.");
  }
  return listGuestBoardComments(sessionToken, boardId);
}
