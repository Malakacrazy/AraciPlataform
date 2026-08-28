import type { Absence, User } from "@/lib/types";
import { formatDateUTC } from "@/lib/format";
import { createAbsence, deleteAbsence } from "./actions";

// Lacuna da matriz ("calendário de férias/ausências") -- registro simples
// de período indisponível por pessoa. Sem lógica de ranking/sugestão
// (isso é o AllocationForm, que já lê estes dados via isOnAbsence); aqui
// é só CRUD, servidor puro, sem "use client" -- delete já funciona via
// server action ligada (bind) direto no form, mesmo padrão de outros
// botões de remover deste projeto.
export function AbsenceSection({ users, absences }: { users: User[]; absences: Absence[] }) {
  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
      <h2 className="font-medium text-zinc-900 dark:text-zinc-50">Férias e ausências</h2>
      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
        Uma ausência ativa entra no cálculo de disponibilidade acima e no aviso de sobrecarga do dashboard de
        capacidade — alocar alguém de férias aparece como sobrecarga, não passa em silêncio.
      </p>

      <form action={createAbsence} className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-zinc-500 dark:text-zinc-400">Colaborador *</span>
          <select
            name="userId"
            required
            defaultValue=""
            className="rounded-md border border-zinc-300 bg-transparent px-3 py-1.5 text-zinc-900 dark:border-zinc-700 dark:text-zinc-50"
          >
            <option value="" disabled>
              Selecione…
            </option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-zinc-500 dark:text-zinc-400">Tipo</span>
          <input
            name="type"
            placeholder="férias"
            className="rounded-md border border-zinc-300 bg-transparent px-3 py-1.5 text-zinc-900 dark:border-zinc-700 dark:text-zinc-50"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-zinc-500 dark:text-zinc-400">Início *</span>
          <input
            name="startDate"
            type="date"
            required
            className="rounded-md border border-zinc-300 bg-transparent px-3 py-1.5 text-zinc-900 dark:border-zinc-700 dark:text-zinc-50"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-zinc-500 dark:text-zinc-400">Fim *</span>
          <input
            name="endDate"
            type="date"
            required
            className="rounded-md border border-zinc-300 bg-transparent px-3 py-1.5 text-zinc-900 dark:border-zinc-700 dark:text-zinc-50"
          />
        </label>
        <button
          type="submit"
          className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm text-white sm:col-span-2 sm:w-fit dark:bg-zinc-50 dark:text-zinc-900"
        >
          Registrar ausência
        </button>
      </form>

      {absences.length > 0 && (
        <ul className="mt-4 flex flex-col gap-1.5 text-sm">
          {absences.map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-2">
              <span className="text-zinc-700 dark:text-zinc-300">
                {a.user.name} — {a.type} ({formatDateUTC(a.startDate)} – {formatDateUTC(a.endDate)})
              </span>
              <form action={deleteAbsence.bind(null, a.id)}>
                <button type="submit" className="text-xs text-red-600 hover:underline dark:text-red-400">
                  Remover
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
