import { prisma } from "@araci/db";
import type { ApiFn, ReportFn } from "./types";

// Extraído de smoke-test.ts (revisão de qualidade de código) -- seção
// "Notificações in-app (sino da Nav)". Cria a Notification direto via
// prisma em vez de aprovar uma especificação de verdade: o gatilho real
// (updateSpecification na transição false→true) manda e-mail pro mesmo
// lote de admins através do MESMO sendEmail() já testado manualmente com
// a Giulia -- exercitar esse caminho aqui de novo reabriria o problema
// já decidido alhures (spam de e-mail real a cada run). O que este bloco
// testa é o CRUD/escopo do sino em si (listar, marcar lida, marcar
// todas), ortogonal a como a notificação nasce.
export async function runNotificationChecks({
  api,
  apiAsStaff,
  report,
  adminAccountId,
  adminUserId,
  projectId,
}: {
  api: ApiFn;
  apiAsStaff: ApiFn;
  report: ReportFn;
  adminAccountId: string;
  adminUserId: string;
  projectId: string;
}) {
  const testNotification = await prisma.notification.create({
    data: {
      accountId: adminAccountId,
      userId: adminUserId,
      type: "specification_approved",
      title: "Projeto de teste: item aprovado pelo cliente",
      body: "Comentário de teste do smoke suite.",
      projectId,
    },
  });

  const notificationsListRes = await api("/v1/notifications");
  const notificationsList = notificationsListRes.body?.data?.notifications ?? [];
  report(
    "GET /notifications → inclui a notificação criada, com unreadCount >= 1",
    notificationsListRes.status === 200 &&
      notificationsList.some((n: any) => n.id === testNotification.id) &&
      notificationsListRes.body?.data?.unreadCount >= 1,
    notificationsListRes.body
  );

  const staffNotificationsRes = await apiAsStaff("/v1/notifications");
  report(
    "GET /notifications como staff → não inclui notificação de outro usuário",
    staffNotificationsRes.status === 200 &&
      !staffNotificationsRes.body?.data?.notifications?.some((n: any) => n.id === testNotification.id),
    staffNotificationsRes.body
  );

  const markReadRes = await api(`/v1/notifications/${testNotification.id}/read`, { method: "PATCH" });
  report("PATCH /notifications/:id/read → 204", markReadRes.status === 204);

  const afterMarkReadRes = await api("/v1/notifications");
  const notifAfterMarkRead = afterMarkReadRes.body?.data?.notifications?.find((n: any) => n.id === testNotification.id);
  report(
    "Após marcar como lida, readAt vem preenchido na listagem",
    !!notifAfterMarkRead?.readAt,
    notifAfterMarkRead
  );

  const secondNotification = await prisma.notification.create({
    data: {
      accountId: adminAccountId,
      userId: adminUserId,
      type: "specification_approved",
      title: "Segunda notificação de teste",
      projectId,
    },
  });
  const markAllReadRes = await api("/v1/notifications/read-all", { method: "POST" });
  report("POST /notifications/read-all → 204", markAllReadRes.status === 204);

  const afterMarkAllReadRes = await api("/v1/notifications");
  report(
    "Após marcar todas como lidas, unreadCount zera e a segunda notificação também vem lida",
    afterMarkAllReadRes.body?.data?.unreadCount === 0 &&
      !!afterMarkAllReadRes.body?.data?.notifications?.find((n: any) => n.id === secondNotification.id)?.readAt,
    afterMarkAllReadRes.body
  );
}
