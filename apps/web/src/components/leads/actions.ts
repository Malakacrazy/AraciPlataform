"use server";

import { redirect } from "next/navigation";
import { submitLeadPublic } from "@/lib/leadApi";

export async function submitLead(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const message = String(formData.get("message") ?? "").trim();
  const consent = formData.get("consent") === "on";

  if (!name || !email) {
    redirect("/lead?error=" + encodeURIComponent("Nome e e-mail são obrigatórios."));
  }
  if (!consent) {
    redirect("/lead?error=" + encodeURIComponent("É necessário aceitar para enviarmos seu contato."));
  }

  try {
    await submitLeadPublic({
      name,
      email,
      phone: phone || undefined,
      message: message || undefined,
      consent: true,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Não foi possível enviar seu contato.";
    redirect("/lead?error=" + encodeURIComponent(message));
  }
  redirect("/lead?sent=1");
}
