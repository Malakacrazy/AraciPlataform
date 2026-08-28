import type { WhiteboardGuestAccess } from "@/lib/types";
import { inviteWhiteboardGuest, revokeWhiteboardGuest } from "./actions";

// Nova audiência convidada só pra ESTE quadro (não o projeto inteiro,
// mais estreito que "Consultores externos") -- autenticada via Logto,
// não magic link próprio (ver WhiteboardGuest no schema).
export function WhiteboardGuestsSection({
  projectId,
  moodboardId,
  guests,
}: {
  projectId: string;
  moodboardId: string;
  guests: WhiteboardGuestAccess[];
}) {
  return (
    <div className="mt-3 border-t border-zinc-100 pt-3 dark:border-zinc-900">
      <h3 className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        Convidados neste quadro
      </h3>

      {guests.length === 0 ? (
        <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">Nenhum convidado ainda.</p>
      ) : (
        <ul className="mt-2 flex flex-col gap-2">
          {guests.map((g) => (
            <li key={g.id} className="flex items-center justify-between gap-3 text-sm">
              <span className="text-zinc-900 dark:text-zinc-50">
                {g.guest.name} <span className="text-xs text-zinc-500 dark:text-zinc-400">{g.guest.email}</span>
              </span>
              <form action={revokeWhiteboardGuest.bind(null, projectId, moodboardId, g.guest.id)}>
                <button type="submit" className="text-xs text-zinc-500 hover:text-red-600 dark:text-zinc-400">
                  Revogar
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}

      <form
        action={inviteWhiteboardGuest.bind(null, projectId, moodboardId)}
        className="mt-3 flex flex-wrap items-end gap-2"
      >
        <input
          name="name"
          placeholder="Nome"
          required
          className="w-32 rounded border border-zinc-300 bg-transparent px-2 py-1 text-sm text-zinc-900 dark:border-zinc-700 dark:text-zinc-50"
        />
        <input
          name="email"
          type="email"
          placeholder="E-mail"
          required
          className="w-48 rounded border border-zinc-300 bg-transparent px-2 py-1 text-sm text-zinc-900 dark:border-zinc-700 dark:text-zinc-50"
        />
        <button type="submit" className="text-xs text-zinc-500 hover:underline dark:text-zinc-400">
          + Convidar
        </button>
      </form>
    </div>
  );
}
