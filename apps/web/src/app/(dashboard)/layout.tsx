import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { apiGet, ApiError } from "@/lib/api";
import type { Me, NotificationsResponse } from "@/lib/types";
import { Nav } from "@/components/nav";

// Achado A-01 da auditoria: antes, um 401/403 aqui (ex.: colaborador
// desativado no backend enquanto o JWT do NextAuth ainda é válido)
// derrubava as 20 rotas do dashboard na tela de erro genérica do Next,
// sem caminho de volta além de digitar /api/auth/signout na mão -- este
// layout embrulha todas elas, então qualquer throw aqui é o pior lugar
// possível pra deixar sem tratamento.
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    redirect("/api/auth/signin");
  }

  let me: Me;
  try {
    me = await apiGet<Me>("me");
  } catch (err) {
    if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
      // Sessão do NextAuth ainda válida, mas o backend não reconhece mais
      // este usuário -- recarregar a mesma página só repetiria o erro.
      // Encerrar a sessão é a única saída real, não uma tela de erro.
      redirect("/api/auth/signout");
    }
    throw err;
  }

  // Não crítico pro shell renderizar: um sino de notificação vazio é bem
  // melhor do que derrubar as 20 rotas por uma falha só nesta chamada.
  let notifications: NotificationsResponse;
  try {
    notifications = await apiGet<NotificationsResponse>("notifications");
  } catch {
    notifications = { notifications: [], unreadCount: 0 };
  }

  return (
    <>
      <Nav accessLevel={me.accessLevel} notifications={notifications} />
      {children}
    </>
  );
}
