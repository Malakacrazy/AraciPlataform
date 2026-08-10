import { mintInternalToken } from "./internalToken";

// Helper de servidor (Server Components, Server Actions) para chamar
// apps/api direto, sem o hop HTTP de um Server Component chamando sua
// própria rota /api/v1/[...path] (que exigiria repassar o cookie de
// sessão manualmente). Reaproveita mintInternalToken(), a mesma função
// que route.ts usa — mesma verificação de sessão, mesmo segredo, mesmo
// formato de token; só evita duplicar a chamada em route.ts, que fica
// intacta para o caminho navegador → proxy BFF → apps/api.
const API_URL = process.env.API_URL ?? "http://localhost:3001";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function apiFetch(path: string, init: RequestInit = {}) {
  const token = await mintInternalToken();
  if (!token) {
    throw new ApiError(401, "Sessão inválida ou ausente.");
  }

  return fetch(`${API_URL}/v1/${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...init.headers,
    },
    cache: "no-store",
  });
}

export async function apiGet<T>(path: string): Promise<T> {
  const res = await apiFetch(path);
  const body = await res.json();
  if (!res.ok) {
    throw new ApiError(res.status, body?.error?.message ?? "Erro na API.");
  }
  return body.data as T;
}
