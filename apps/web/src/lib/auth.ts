import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";

const ALLOWED_EMAIL_DOMAINS = (process.env.ALLOWED_EMAIL_DOMAINS ?? "")
  .split(",")
  .map((d) => d.trim().toLowerCase())
  .filter(Boolean);

const ALLOWED_EMAILS = (process.env.ALLOWED_EMAILS ?? "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

// SSO stub for the Office module requirement ("Login único via conta
// Google Workspace"). GOOGLE_CLIENT_ID/SECRET are unset until Fase 0
// provisions real OAuth credentials — see apps/web/.env.example.
// `hd` é só uma dica pra tela de consentimento do Google escolher a conta
// certa — o próprio Google não impede login com outro domínio, então a
// checagem real é o callback signIn abaixo (achado C-01 da auditoria:
// qualquer conta Google conseguia logar e virava usuário 'staff'
// automaticamente via ensureAccountAndUser).
export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      authorization: { params: { hd: "studioaraci.com.br" } },
    }),
  ],
  session: { strategy: "jwt" },
  callbacks: {
    async signIn({ user }) {
      const email = user.email?.toLowerCase();
      if (!email) return false;
      const domain = email.split("@")[1];
      return ALLOWED_EMAIL_DOMAINS.includes(domain) || ALLOWED_EMAILS.includes(email);
    },
  },
};
