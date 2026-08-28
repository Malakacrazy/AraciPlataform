import Link from "next/link";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { listGuestBoards, WhiteboardGuestPortalApiError, SESSION_COOKIE } from "@/lib/whiteboardGuestPortalApi";
import { logoutGuest } from "@/components/whiteboard-guest-portal/actions";

export default async function QuadroHomePage() {
  const sessionToken = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!sessionToken) {
    redirect("/quadro/login");
  }

  let guestName: string;
  let boards: Awaited<ReturnType<typeof listGuestBoards>>["boards"];
  try {
    ({ guestName, boards } = await listGuestBoards(sessionToken));
  } catch (err) {
    if (err instanceof WhiteboardGuestPortalApiError && err.status === 401) {
      redirect("/quadro/login");
    }
    throw err;
  }

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-6 py-12">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">Olá, {guestName}</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">Quadros em que você foi convidado a colaborar.</p>
        </div>
        <form action={logoutGuest}>
          <button type="submit" className="text-xs text-zinc-500 hover:underline dark:text-zinc-400">
            Sair
          </button>
        </form>
      </div>

      {boards.length === 0 ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">Nenhum quadro ainda.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {boards.map((b) => (
            <li
              key={b.id}
              className="flex items-center justify-between gap-3 rounded-md border border-zinc-200 bg-white px-4 py-3 text-sm dark:border-zinc-800 dark:bg-zinc-950"
            >
              <div>
                <span className="text-zinc-900 dark:text-zinc-50">{b.name}</span>
                <span className="ml-2 text-xs text-zinc-500 dark:text-zinc-400">{b.projectName}</span>
              </div>
              <Link href={`/quadro/${b.id}`} className="text-xs text-zinc-500 hover:underline dark:text-zinc-400">
                Abrir →
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
