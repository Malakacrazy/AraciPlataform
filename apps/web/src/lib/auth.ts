import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";

// SSO stub for the Office module requirement ("Login único via conta
// Google Workspace"). GOOGLE_CLIENT_ID/SECRET are unset until Fase 0
// provisions real OAuth credentials — see apps/web/.env.example.
// `hd` restricts sign-in to the studio's Workspace domain (confirmed in
// discovery, resposta 15).
export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      authorization: { params: { hd: "studioaraci.com.br" } },
    }),
  ],
  session: { strategy: "jwt" },
};
