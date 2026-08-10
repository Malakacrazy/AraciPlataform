import { notFound, redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { apiGet, ApiError } from "@/lib/api";
import type { Client, OfficeLink } from "@/lib/types";
import { OfficeLinksSection } from "@/components/office-links/office-links-section";

// Mesma lógica de ProjectPage: página mínima só para dar lugar ao
// OfficeLinksSection, não o CRM completo do cliente.
export default async function ClientPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    redirect("/api/auth/signin");
  }

  const { id } = await params;

  let client: Client;
  let officeLinks: OfficeLink[];
  try {
    [client, officeLinks] = await Promise.all([
      apiGet<Client>(`clients/${id}`),
      apiGet<OfficeLink[]>(`clients/${id}/office-links`),
    ]);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      notFound();
    }
    throw err;
  }

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-6 py-12">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">{client.name}</h1>
        {(client.email || client.phone) && (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            {[client.email, client.phone].filter(Boolean).join(" — ")}
          </p>
        )}
      </div>
      <OfficeLinksSection
        entityType="CLIENT"
        entityId={client.id}
        links={officeLinks}
        userEmail={session.user.email}
      />
    </main>
  );
}
