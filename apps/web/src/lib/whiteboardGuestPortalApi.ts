// Contraparte de collaboratorPortalApi.ts, mesmo espírito -- quem está
// no portal do quadro não tem sessão NextAuth (não é staff, nem cliente,
// nem consultor externo de projeto inteiro): é um convidado de UM quadro
// específico, autenticado via Logto (ver app/quadro/callback/route.ts).
// Nunca usar apiFetch()/mintInternalToken() aqui.
import type { WhiteboardGuestBoard, MoodboardComment } from "./types";

const API_URL = process.env.API_URL ?? "http://localhost:3001";

export const SESSION_COOKIE = "whiteboard_guest_session";

export class WhiteboardGuestPortalApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function portalFetch(path: string, init: RequestInit = {}) {
  return fetch(`${API_URL}/v1/whiteboard-guest-portal${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init.headers },
    cache: "no-store",
  });
}

// Chamado pelo callback OAuth do Logto (servidor-a-servidor, claims já
// verificadas pelo próprio token endpoint/userinfo do Logto -- ver
// app/quadro/callback/route.ts) -- nunca pelo navegador do convidado
// diretamente.
export async function verifyLogtoLogin(input: {
  email: string;
  name: string;
  logtoSubjectId: string;
}): Promise<{ sessionToken: string; guestName: string }> {
  const res = await portalFetch("/verify-login", {
    method: "POST",
    body: JSON.stringify(input),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new WhiteboardGuestPortalApiError(res.status, body?.error?.message ?? "Não foi possível confirmar seu login.");
  }
  return body.data;
}

export async function listGuestBoards(
  sessionToken: string,
): Promise<{ guestName: string; boards: WhiteboardGuestBoard[] }> {
  const res = await portalFetch("/boards", {
    headers: { "X-Whiteboard-Guest-Session": sessionToken },
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new WhiteboardGuestPortalApiError(res.status, body?.error?.message ?? "Não foi possível carregar seus quadros.");
  }
  return body.data;
}

// Mesmo racional de logoutPortal em portalApi.ts.
export async function logoutGuestSession(sessionToken: string): Promise<void> {
  try {
    await portalFetch("/logout", {
      method: "POST",
      headers: { "X-Whiteboard-Guest-Session": sessionToken },
    });
  } catch {
    // silencioso de propósito -- "sair" não pode falhar por causa do apps/api
  }
}

export async function getGuestBoard(
  sessionToken: string,
  boardId: string,
): Promise<{ id: string; name: string; snapshot: unknown }> {
  const res = await portalFetch(`/boards/${boardId}`, {
    headers: { "X-Whiteboard-Guest-Session": sessionToken },
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new WhiteboardGuestPortalApiError(res.status, body?.error?.message ?? "Não foi possível carregar o quadro.");
  }
  return body.data;
}

export async function saveGuestBoardSnapshot(sessionToken: string, boardId: string, snapshot: unknown): Promise<void> {
  const res = await portalFetch(`/boards/${boardId}/snapshot`, {
    method: "PATCH",
    headers: { "X-Whiteboard-Guest-Session": sessionToken },
    body: JSON.stringify({ snapshot }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new WhiteboardGuestPortalApiError(res.status, body?.error?.message ?? "Não foi possível salvar o quadro.");
  }
}

export async function listGuestBoardComments(sessionToken: string, boardId: string): Promise<MoodboardComment[]> {
  const res = await portalFetch(`/boards/${boardId}/comments`, {
    headers: { "X-Whiteboard-Guest-Session": sessionToken },
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new WhiteboardGuestPortalApiError(res.status, body?.error?.message ?? "Não foi possível carregar os comentários.");
  }
  return body.data;
}

export async function addGuestBoardComment(sessionToken: string, boardId: string, body: string): Promise<MoodboardComment> {
  const res = await portalFetch(`/boards/${boardId}/comments`, {
    method: "POST",
    headers: { "X-Whiteboard-Guest-Session": sessionToken },
    body: JSON.stringify({ body }),
  });
  const resBody = await res.json().catch(() => null);
  if (!res.ok) {
    throw new WhiteboardGuestPortalApiError(res.status, resBody?.error?.message ?? "Não foi possível enviar o comentário.");
  }
  return resBody.data;
}
