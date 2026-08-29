"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import {
  updatePublicSpecification,
  savePresentationMoodboardSnapshot,
  addPresentationMoodboardComment,
  listPresentationMoodboardComments,
  PublicApiError,
} from "@/lib/publicApi";
import type { MoodboardComment } from "@/lib/types";

// Achado "Médio" da auditoria: antes, uma falha do backend aqui (token
// revogado ou especificação excluída entre o render e o clique) não era
// capturada -- o throw subia sem tratamento e quebrava a tela pública do
// cliente, que não tem error.tsx (só (dashboard) tem, ver achado A-01).
// Mesmo padrão já usado em portal/verify/route.ts: captura, redireciona
// com o erro na query, a própria página exibe.
function redirectWithError(token: string, err: unknown): never {
  const message = err instanceof PublicApiError ? err.message : "Não foi possível salvar.";
  redirect(`/present/${token}?error=${encodeURIComponent(message)}`);
}

export async function setSpecificationApproval(token: string, specId: string, approved: boolean) {
  try {
    await updatePublicSpecification(token, specId, { clientApproved: approved });
  } catch (err) {
    redirectWithError(token, err);
  }
  revalidatePath(`/present/${token}`);
}

export async function submitSpecificationComment(token: string, specId: string, formData: FormData) {
  const comment = String(formData.get("comment") ?? "").trim();
  try {
    await updatePublicSpecification(token, specId, { clientComment: comment });
  } catch (err) {
    redirectWithError(token, err);
  }
  revalidatePath(`/present/${token}`);
}

// Sem redirect/revalidatePath de propósito, diferente das duas ações
// acima -- chamada com debounce a cada pausa no desenho (ver
// CollaborativeBoard); um redirect a cada poucos segundos enquanto o
// cliente desenha quebraria a experiência. Erro aqui só loga no
// console do navegador (ver CollaborativeBoard), não derruba a página.
export async function saveMoodboardSnapshot(token: string, moodboardId: string, snapshot: unknown): Promise<void> {
  await savePresentationMoodboardSnapshot(token, moodboardId, snapshot);
}

export async function addMoodboardComment(token: string, moodboardId: string, body: string): Promise<MoodboardComment> {
  return addPresentationMoodboardComment(token, moodboardId, body);
}

// Ver comentário equivalente em components/moodboards/actions.ts: o canal
// Realtime só avisa, o conteúdo do comentário vem sempre do apps/api.
export async function listMoodboardComments(token: string, moodboardId: string): Promise<MoodboardComment[]> {
  return listPresentationMoodboardComments(token, moodboardId);
}
