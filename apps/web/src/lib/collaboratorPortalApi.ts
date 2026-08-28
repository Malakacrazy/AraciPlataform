// Contraparte de portalApi.ts, mesmo espírito -- quem está no portal do
// consultor não tem sessão NextAuth (não é staff via Google Workspace,
// nem cliente do estúdio), então nunca usar apiFetch()/mintInternalToken()
// aqui. Lacuna da matriz ("colaboração com consultores externos").
import type { CollaboratorProject, CollaboratorProjectDetail } from "./types";

const API_URL = process.env.API_URL ?? "http://localhost:3001";

export const SESSION_COOKIE = "collaborator_session";

export class CollaboratorPortalApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function portalFetch(path: string, init: RequestInit = {}) {
  return fetch(`${API_URL}/v1/collaborator-portal${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init.headers },
    cache: "no-store",
  });
}

export async function requestCollaboratorLink(email: string): Promise<void> {
  const res = await portalFetch("/request-link", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new CollaboratorPortalApiError(res.status, body?.error?.message ?? "Não foi possível enviar o link.");
  }
}

export async function consumeCollaboratorToken(token: string): Promise<{ sessionToken: string; collaboratorName: string }> {
  const res = await portalFetch("/consume", {
    method: "POST",
    body: JSON.stringify({ token }),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new CollaboratorPortalApiError(res.status, body?.error?.message ?? "Link inválido ou expirado.");
  }
  return body.data;
}

export async function listCollaboratorProjects(
  sessionToken: string,
): Promise<{ collaboratorName: string; projects: CollaboratorProject[] }> {
  const res = await portalFetch("/projects", {
    headers: { "X-Collaborator-Session": sessionToken },
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new CollaboratorPortalApiError(res.status, body?.error?.message ?? "Não foi possível carregar seus projetos.");
  }
  return body.data;
}

export async function getCollaboratorProject(sessionToken: string, projectId: string): Promise<CollaboratorProjectDetail> {
  const res = await portalFetch(`/projects/${projectId}`, {
    headers: { "X-Collaborator-Session": sessionToken },
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new CollaboratorPortalApiError(res.status, body?.error?.message ?? "Não foi possível carregar o projeto.");
  }
  return body.data;
}
