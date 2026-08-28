"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import {
  requestPortalLink,
  declineProposal,
  submitProspectComment,
  PortalApiError,
  SESSION_COOKIE,
} from "@/lib/portalApi";

async function requireSessionToken(): Promise<string> {
  const sessionToken = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!sessionToken) {
    throw new Error("Sessão inválida ou expirada — entre novamente.");
  }
  return sessionToken;
}

export async function requestLink(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  if (!email) {
    redirect("/portal/login?error=" + encodeURIComponent("Informe seu e-mail."));
  }
  // Achado "Médio" da auditoria: antes, uma falha do backend aqui subia
  // sem tratamento e quebrava a tela de login do portal (que não tem
  // error.tsx nenhum -- só (dashboard) tem, ver achado A-01). Mesmo
  // padrão já usado em portal/verify/route.ts: captura, redireciona com
  // o erro na query, a própria página já sabe exibir (ver ?error= mais
  // abaixo no return normal).
  try {
    await requestPortalLink(email);
  } catch (err) {
    const message = err instanceof PortalApiError ? err.message : "Não foi possível enviar o link.";
    redirect(`/portal/login?error=${encodeURIComponent(message)}`);
  }
  redirect("/portal/login?sent=1");
}

// Lacuna da matriz (portal pré-venda) -- "recusa" reaproveita markLost
// do lado da API, aqui só passa a sessão do portal em vez de credencial
// de staff.
export async function declineProposalAction(opportunityId: string) {
  const sessionToken = await requireSessionToken();
  try {
    await declineProposal(sessionToken, opportunityId);
  } catch (err) {
    throw new Error(err instanceof PortalApiError ? err.message : "Não foi possível registrar a recusa.");
  }
  revalidatePath("/portal");
}

export async function submitProspectCommentAction(opportunityId: string, formData: FormData) {
  const comment = String(formData.get("comment") ?? "").trim();
  if (!comment) return;
  const sessionToken = await requireSessionToken();
  try {
    await submitProspectComment(sessionToken, opportunityId, comment);
  } catch (err) {
    throw new Error(err instanceof PortalApiError ? err.message : "Não foi possível enviar sua pergunta.");
  }
  revalidatePath("/portal");
}

export async function logoutPortal() {
  // path precisa bater com o usado no set (route.ts de /portal/verify) --
  // sem isso o delete() vira um cookie diferente e não some (achado
  // testando o fluxo de verdade no navegador).
  (await cookies()).delete({ name: SESSION_COOKIE, path: "/portal" });
  redirect("/portal/login");
}
