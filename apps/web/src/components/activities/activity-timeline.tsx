import type { Activity } from "@/lib/types";
import { addActivity, deleteActivity } from "./actions";

type EntityType = "PROJECT" | "CLIENT" | "OPPORTUNITY";

interface Props {
  entityType: EntityType;
  entityId: string;
  activities: Activity[];
  currentUserEmail?: string | null;
}

// Nenhum dos três (Project/Client/Opportunity) tinha histórico algum
// antes disso -- nada registrava o que foi dito numa ligação ou quando
// algo mudou de mãos. Mesmo componente reaproveitado nos três, só o
// entityType/entityId muda.
export function ActivityTimeline({ entityType, entityId, activities, currentUserEmail }: Props) {
  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
      <h2 className="font-medium text-zinc-900 dark:text-zinc-50">Notas</h2>
      {activities.length === 0 ? (
        <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">Nenhuma nota ainda.</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-3">
          {activities.map((activity) => (
            <li
              key={activity.id}
              className="rounded-md border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-800"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-zinc-900 dark:text-zinc-50">{activity.author.name}</span>
                <span className="text-xs text-zinc-500 dark:text-zinc-400">
                  {new Date(activity.createdAt).toLocaleString("pt-BR")}
                </span>
              </div>
              <p className="mt-1 whitespace-pre-wrap text-zinc-700 dark:text-zinc-300">{activity.body}</p>
              {activity.author.email === currentUserEmail && (
                <form action={deleteActivity.bind(null, entityType, entityId, activity.id)} className="mt-1">
                  <button type="submit" className="text-xs text-zinc-500 hover:text-red-600 dark:text-zinc-400">
                    Remover
                  </button>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}
      <form action={addActivity.bind(null, entityType, entityId)} className="mt-3 flex flex-col gap-2">
        <textarea
          name="body"
          required
          rows={2}
          placeholder="Adicionar nota…"
          className="rounded-md border border-zinc-300 bg-transparent px-3 py-1.5 text-sm text-zinc-900 dark:border-zinc-700 dark:text-zinc-50"
        />
        <button
          type="submit"
          className="self-start rounded-md bg-zinc-900 px-3 py-1.5 text-xs text-white dark:bg-zinc-50 dark:text-zinc-900"
        >
          Adicionar nota
        </button>
      </form>
    </section>
  );
}
