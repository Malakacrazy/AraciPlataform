import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { apiGet } from "@/lib/api";
import type { Me } from "@/lib/types";
import { Nav } from "@/components/nav";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    redirect("/api/auth/signin");
  }

  const me = await apiGet<Me>("me");

  return (
    <>
      <Nav accessLevel={me.accessLevel} />
      {children}
    </>
  );
}
