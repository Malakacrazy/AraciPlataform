import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { apiGet, ApiError } from "@/lib/api";
import type { Client, Opportunity, OfficeLink, Activity } from "@/lib/types";
import { OfficeLinksSection } from "@/components/office-links/office-links-section";
import { ActivityTimeline } from "@/components/activities/activity-timeline";

function opportunityStatus(opp: Opportunity): { label: string; className: string } {
  if (opp.wonAt) return { label: "Ganho", className: "text-emerald-700 dark:text-emerald-400" };
  if (opp.lostAt) return { label: "Perdido", className: "text-red-600 dark:text-red-400" };
  return { label: opp.stage, className: "text-zinc-500 dark:text-zinc-400" };
}

export default async function ClientPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    redirect("/api/auth/signin");
  }

  const { id } = await params;

  let client: Client;
  let officeLinks: OfficeLink[];
  let opportunities: Opportunity[];
  try {
    [client, officeLinks, opportunities] = await Promise.all([
      apiGet<Client>(`clients/${id}`),
      apiGet<OfficeLink[]>(`clients/${id}/office-links`),
      apiGet<Opportunity[]>("opportunities"),
    ]);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      notFound();
    }
    throw err;
  }
  const clientOpportunities = opportunities.filter((o) => o.clientId === id);
  const activities = await apiGet<Activity[]>(`clients/${id}/activities`);

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-6 py-12">
      <div>
        <Link href="/clients" className="text-xs text-zinc-500 hover:underline dark:text-zinc-400">
          ← Clientes
        </Link>
        <h1 className="mt-1 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">{client.name}</h1>
        {(client.email || client.phone) && (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            {[client.email, client.phone].filter(Boolean).join(" — ")}
          </p>
        )}
      </div>

      <section className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="font-medium text-zinc-900 dark:text-zinc-50">Oportunidades</h2>
        {clientOpportunities.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">Nenhuma oportunidade ainda.</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {clientOpportunities.map((opp) => {
              const status = opportunityStatus(opp);
              return (
                <li
                  key={opp.id}
                  className="flex items-center justify-between gap-3 rounded-md border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-800"
                >
                  <span className="text-zinc-900 dark:text-zinc-50">{opp.title}</span>
                  <span className={`text-xs ${status.className}`}>
                    {status.label}
                    {opp.lostAt && opp.lostReason ? ` — ${opp.lostReason}` : ""}
                  </span>
                  {opp.project && (
                    <Link
                      href={`/projects/${opp.project.id}`}
                      className="text-xs text-zinc-500 hover:underline dark:text-zinc-400"
                    >
                      Ver projeto →
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        <Link
          href="/opportunities"
          className="mt-3 inline-block text-xs text-zinc-500 hover:underline dark:text-zinc-400"
        >
          Ver pipeline completo →
        </Link>
      </section>

      <OfficeLinksSection
        entityType="CLIENT"
        entityId={client.id}
        links={officeLinks}
        userEmail={session.user.email}
        contactEmail={client.email}
      />

      <ActivityTimeline
        entityType="CLIENT"
        entityId={client.id}
        activities={activities}
        currentUserEmail={session.user.email}
      />
    </main>
  );
}
