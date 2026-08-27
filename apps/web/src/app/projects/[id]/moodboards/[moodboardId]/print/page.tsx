import { getServerSession } from "next-auth";
import { notFound, redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { apiGet, ApiError } from "@/lib/api";
import type { Moodboard, Project } from "@/lib/types";
import { MOODBOARD_CANVAS_HEIGHT, MOODBOARD_CANVAS_WIDTH, MoodboardItemVisual, moodboardItemWrapperStyle } from "@/components/moodboards/moodboard-canvas-shared";
import { PrintButton } from "@/components/moodboards/print-button";

// Fora de (dashboard) de propósito -- não herda a Nav do resto do app
// (mesmo motivo de /present/[token] viver fora do grupo): a exportação
// precisa ser só a prancha, sem chrome do dashboard aparecendo no PDF.
// Continua exigindo sessão real (diferente de /present, que é o link
// público por token) -- isto é uma ferramenta interna, não algo pra
// mandar pro cliente.
export default async function MoodboardPrintPage({
  params,
}: {
  params: Promise<{ id: string; moodboardId: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    redirect("/api/auth/signin");
  }

  const { id, moodboardId } = await params;

  let project: Project;
  let moodboard: Moodboard;
  try {
    [project, moodboard] = await Promise.all([
      apiGet<Project>(`projects/${id}`),
      apiGet<Moodboard>(`moodboards/${moodboardId}`),
    ]);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      notFound();
    }
    throw err;
  }

  const today = new Date().toLocaleDateString("pt-BR");

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-12 print:max-w-none print:px-0 print:py-0">
      <div className="flex items-center justify-between print:hidden">
        <p className="text-sm text-zinc-500 dark:text-zinc-400">Prévia de exportação</p>
        <PrintButton />
      </div>

      <header className="flex items-end justify-between border-b-2 border-zinc-900 pb-3 dark:border-zinc-50 print:border-black">
        <div>
          <p className="text-xs uppercase tracking-wide text-zinc-500 print:text-black">Studio Araci</p>
          <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50 print:text-black">{moodboard.name}</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 print:text-black">
            {project.name} — {project.client.name}
          </p>
        </div>
        <p className="text-xs text-zinc-400 dark:text-zinc-600 print:text-black">{today}</p>
      </header>

      <div
        className="relative mx-auto bg-white print:bg-white"
        style={{ width: MOODBOARD_CANVAS_WIDTH, height: MOODBOARD_CANVAS_HEIGHT }}
      >
        {moodboard.items.map((item) => (
          <div key={item.id} style={moodboardItemWrapperStyle(item)}>
            <MoodboardItemVisual item={item} />
          </div>
        ))}
      </div>
    </main>
  );
}
