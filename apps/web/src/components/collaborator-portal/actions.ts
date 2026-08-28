"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { requestCollaboratorLink, CollaboratorPortalApiError, SESSION_COOKIE } from "@/lib/collaboratorPortalApi";

export async function requestLink(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  if (!email) {
    redirect("/colaborador/login?error=" + encodeURIComponent("Informe seu e-mail."));
  }
  // Mesmo padrão de portal/actions.ts#requestLink -- captura e redireciona
  // com o erro na query em vez de deixar subir sem tratamento (achado
  // "Médio" da auditoria, já corrigido lá; replicado aqui desde o início).
  try {
    await requestCollaboratorLink(email);
  } catch (err) {
    const message = err instanceof CollaboratorPortalApiError ? err.message : "Não foi possível enviar o link.";
    redirect(`/colaborador/login?error=${encodeURIComponent(message)}`);
  }
  redirect("/colaborador/login?sent=1");
}

export async function logoutCollaborator() {
  (await cookies()).delete({ name: SESSION_COOKIE, path: "/colaborador" });
  redirect("/colaborador/login");
}
