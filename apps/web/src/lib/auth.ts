import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";

// SSO stub for the Office module requirement ("Login único via conta
// Google Workspace"). GOOGLE_CLIENT_ID/SECRET are unset until Fase 0
// provisions real OAuth credentials — see apps/web/.env.example.
// Discovery (docs/fase-0/descoberta-questionario.md, resposta 15)
// confirmed the studio has a single corporate Workspace domain, so `hd`
// should be set — but the exact domain string wasn't given, so it's left
// unset rather than guessed. Fill in before Fase 1 sign-in testing.
export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      // authorization: { params: { hd: "TODO: dominio-do-workspace.com.br" } },
    }),
  ],
  session: { strategy: "jwt" },
};
