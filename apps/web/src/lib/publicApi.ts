import type { PresentationData, PresentationMoodboardBoard, MoodboardComment } from "./types";

// Contraparte pública de api.ts: quem abre /present/[token] não tem
// sessão NextAuth, então não há como mintInternalToken() (precisa de
// getServerSession). O token da URL É a credencial aqui -- ver
// PublicPresentationController/@Public() em apps/api. Nunca usar
// apiFetch()/mintInternalToken() neste caminho, e nunca chamar isto fora
// de /present/[token].
const API_URL = process.env.API_URL ?? "http://localhost:3001";

export class PublicApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function presentationFetch(token: string, path: string, init: RequestInit = {}) {
  return fetch(`${API_URL}/v1/present/${token}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init.headers },
    cache: "no-store",
  });
}

export async function getPresentation(token: string): Promise<PresentationData> {
  const res = await presentationFetch(token, "");
  const body = await res.json();
  if (!res.ok) {
    throw new PublicApiError(res.status, body?.error?.message ?? "Erro ao carregar apresentação.");
  }
  return body.data as PresentationData;
}

export async function getPresentationMoodboardBoard(token: string, moodboardId: string): Promise<PresentationMoodboardBoard> {
  const res = await presentationFetch(token, `/moodboards/${moodboardId}`);
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new PublicApiError(res.status, body?.error?.message ?? "Não foi possível carregar o quadro.");
  }
  return body.data;
}

export async function savePresentationMoodboardSnapshot(token: string, moodboardId: string, snapshot: unknown): Promise<void> {
  const res = await presentationFetch(token, `/moodboards/${moodboardId}/snapshot`, {
    method: "PATCH",
    body: JSON.stringify({ snapshot }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new PublicApiError(res.status, body?.error?.message ?? "Não foi possível salvar o quadro.");
  }
}

export async function listPresentationMoodboardComments(token: string, moodboardId: string): Promise<MoodboardComment[]> {
  const res = await presentationFetch(token, `/moodboards/${moodboardId}/comments`);
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new PublicApiError(res.status, body?.error?.message ?? "Não foi possível carregar os comentários.");
  }
  return body.data;
}

export async function addPresentationMoodboardComment(token: string, moodboardId: string, body: string): Promise<MoodboardComment> {
  const res = await presentationFetch(token, `/moodboards/${moodboardId}/comments`, {
    method: "POST",
    body: JSON.stringify({ body }),
  });
  const resBody = await res.json().catch(() => null);
  if (!res.ok) {
    throw new PublicApiError(res.status, resBody?.error?.message ?? "Não foi possível enviar o comentário.");
  }
  return resBody.data;
}

export async function updatePublicSpecification(
  token: string,
  specId: string,
  input: { clientApproved?: boolean; clientComment?: string },
) {
  const res = await presentationFetch(token, `/specifications/${specId}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new PublicApiError(res.status, body?.error?.message ?? "Não foi possível salvar.");
  }
}
