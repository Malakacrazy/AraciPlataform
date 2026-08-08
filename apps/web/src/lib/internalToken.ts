import { SignJWT } from "jose";
import { getServerSession } from "next-auth";
import { authOptions } from "./auth";

// Assinado com INTERNAL_API_SECRET — segredo diferente de
// NEXTAUTH_SECRET, compartilhado só entre apps/web e apps/api, nunca
// exposto ao navegador. Vida curta (60s) porque é reemitido a cada
// requisição ao proxy, nunca armazenado em lugar nenhum. Ver
// docs/fase-0/ ("BFF") para o desenho completo: apps/api nunca é
// chamado pelo navegador, só por este servidor, depois de confirmar a
// sessão NextAuth real.
export async function mintInternalToken(): Promise<string | null> {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email;
  if (!email) {
    return null;
  }

  const secret = process.env.INTERNAL_API_SECRET;
  if (!secret) {
    throw new Error("INTERNAL_API_SECRET não configurado.");
  }

  return new SignJWT({ email })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("60s")
    .sign(new TextEncoder().encode(secret));
}
