// Contraparte pública de api.ts, mesmo espírito de portalApi.ts: quem
// preenche este formulário não tem sessão nenhuma (é um visitante
// anônimo do site, antes de qualquer contato) -- nunca usar
// apiFetch()/mintInternalToken() aqui, vai direto no endpoint @Public()
// do apps/api.
import { HttpApiError as LeadApiError } from "./httpError";

const API_URL = process.env.API_URL ?? "http://localhost:3001";

export { LeadApiError };

export async function submitLeadPublic(input: {
  name: string;
  email: string;
  phone?: string;
  message?: string;
  consent: true;
}): Promise<void> {
  const res = await fetch(`${API_URL}/v1/leads`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new LeadApiError(res.status, body?.error?.message ?? "Não foi possível enviar seu contato.");
  }
}
