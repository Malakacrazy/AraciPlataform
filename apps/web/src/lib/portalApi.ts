// Contraparte pública de api.ts, mesmo espírito de publicApi.ts: quem
// está no portal do cliente não tem sessão NextAuth (é um cliente, não
// um colaborador via Google Workspace), então nunca usar
// apiFetch()/mintInternalToken() aqui. As duas primeiras chamadas
// (request-link, consume) não têm credencial nenhuma ainda -- é
// exatamente o que elas existem pra criar. listPortalProjects já leva o
// token de sessão do cliente (cookie httpOnly setado em
// /portal/verify), verificado do lado do apps/api, não decodificado
// aqui.
const API_URL = process.env.API_URL ?? "http://localhost:3001";

export const SESSION_COOKIE = "client_session";

export class PortalApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function portalFetch(path: string, init: RequestInit = {}) {
  return fetch(`${API_URL}/v1/client-portal${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init.headers },
    cache: "no-store",
  });
}

export async function requestPortalLink(email: string): Promise<void> {
  const res = await portalFetch("/request-link", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new PortalApiError(res.status, body?.error?.message ?? "Não foi possível enviar o link.");
  }
}

export async function consumePortalToken(token: string): Promise<{ sessionToken: string; clientName: string }> {
  const res = await portalFetch("/consume", {
    method: "POST",
    body: JSON.stringify({ token }),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new PortalApiError(res.status, body?.error?.message ?? "Link inválido ou expirado.");
  }
  return body.data;
}

export interface PortalProject {
  id: string;
  name: string;
  status: string;
  presentationToken: string;
}

export async function listPortalProjects(sessionToken: string): Promise<{ clientName: string; projects: PortalProject[] }> {
  const res = await portalFetch("/projects", {
    headers: { "X-Client-Session": sessionToken },
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new PortalApiError(res.status, body?.error?.message ?? "Não foi possível carregar seus projetos.");
  }
  return body.data;
}
