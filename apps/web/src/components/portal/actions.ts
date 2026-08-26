"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { requestPortalLink, SESSION_COOKIE } from "@/lib/portalApi";

export async function requestLink(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  if (!email) {
    throw new Error("Informe seu e-mail.");
  }
  await requestPortalLink(email);
  redirect("/portal/login?sent=1");
}

export async function logoutPortal() {
  // path precisa bater com o usado no set (route.ts de /portal/verify) --
  // sem isso o delete() vira um cookie diferente e não some (achado
  // testando o fluxo de verdade no navegador).
  (await cookies()).delete({ name: SESSION_COOKIE, path: "/portal" });
  redirect("/portal/login");
}
