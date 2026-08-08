import { getServerSession } from "next-auth";
import { prisma } from "@araci/db";
import { authOptions } from "./auth";
import { UnauthorizedError } from "./api";

export interface SessionAccount {
  accountId: string;
  userId: string;
  email: string;
}

// Fase 1 tem uma única conta (o estúdio) — não existe fluxo de signup
// ainda. No primeiro login, garante que exista uma Account e um User
// vinculado ao e-mail autenticado. Isso muda quando a plataforma passar a
// atender mais de uma firma (ver data-model.md, "Multi-tenancy: decisão
// pendente").
async function ensureAccountAndUser(email: string, name: string) {
  const existingUser = await prisma.user.findUnique({ where: { email } });
  if (existingUser) {
    return existingUser;
  }

  const account =
    (await prisma.account.findFirst()) ??
    (await prisma.account.create({ data: { name: "Studio Araci" } }));

  return prisma.user.create({
    data: {
      accountId: account.id,
      email,
      name,
      role: "admin",
    },
  });
}

// Toda rota de API própria escopa dados via esta função — nenhum endpoint
// aceita accountId vindo do cliente (docs/fase-0/especificacao-tecnica.md,
// "Formato da API própria").
export async function requireSessionAccount(): Promise<SessionAccount> {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email;
  if (!email) {
    throw new UnauthorizedError();
  }

  const user = await ensureAccountAndUser(email, session.user?.name ?? email);
  return { accountId: user.accountId, userId: user.id, email };
}
