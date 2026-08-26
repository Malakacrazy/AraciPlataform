import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { apiGet } from "@/lib/api";
import type { Me, NotificationsResponse } from "@/lib/types";
import { Nav } from "@/components/nav";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    redirect("/api/auth/signin");
  }

  const me = await apiGet<Me>("me");
  const notifications = await apiGet<NotificationsResponse>("notifications");

  return (
    <>
      <Nav accessLevel={me.accessLevel} notifications={notifications} />
      {children}
    </>
  );
}
