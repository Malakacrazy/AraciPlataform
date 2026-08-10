import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { apiGet } from "@/lib/api";
import type { User } from "@/lib/types";
import { updateUser } from "@/components/team/actions";

export default async function TeamPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    redirect("/api/auth/signin");
  }

  const users = await apiGet<User[]>("users");

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-12">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Equipe</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Cadastro de equipe com papel, especialidade e custo-hora. Colaboradores entram via login SSO — sem
          cadastro manual aqui.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        {users.map((user) => (
          <section
            key={user.id}
            className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950"
          >
            <h2 className="font-medium text-zinc-900 dark:text-zinc-50">{user.name}</h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">{user.email}</p>
            <form action={updateUser.bind(null, user.id)} className="mt-3 flex flex-wrap items-end gap-3">
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-zinc-500 dark:text-zinc-400">Papel</span>
                <input
                  name="role"
                  defaultValue={user.role}
                  className="w-48 rounded-md border border-zinc-300 bg-transparent px-3 py-1.5 text-zinc-900 dark:border-zinc-700 dark:text-zinc-50"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-zinc-500 dark:text-zinc-400">Especialidade</span>
                <input
                  name="specialty"
                  defaultValue={user.specialty ?? ""}
                  className="w-40 rounded-md border border-zinc-300 bg-transparent px-3 py-1.5 text-zinc-900 dark:border-zinc-700 dark:text-zinc-50"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-zinc-500 dark:text-zinc-400">Custo-hora (R$)</span>
                <input
                  name="costPerHour"
                  type="number"
                  min="0"
                  step="0.01"
                  defaultValue={user.costPerHour ?? ""}
                  className="w-32 rounded-md border border-zinc-300 bg-transparent px-3 py-1.5 text-zinc-900 dark:border-zinc-700 dark:text-zinc-50"
                />
              </label>
              <button
                type="submit"
                className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm text-white dark:bg-zinc-50 dark:text-zinc-900"
              >
                Salvar
              </button>
            </form>
          </section>
        ))}
      </div>
    </main>
  );
}
