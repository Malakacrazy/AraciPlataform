import { NextRequest, NextResponse } from "next/server";
import { withScheme } from "@/lib/url";
import { badRequest, isSafePathSegment, relayGet, relayPut } from "@/lib/binaryProxy";

// Rota pública -- sem sessão nenhuma, mesmo padrão de
// present/[token]/documents/[officeLinkId]/route.ts: o token da URL é a
// única credencial (posse do link de apresentação = acesso de escrita
// ao quadro, mesmo princípio de saveMoodboardSnapshot). A autorização de
// verdade acontece em PublicPresentationService (token -> projectId ->
// moodboardId), não aqui.
const API_URL = withScheme(process.env.API_URL ?? "http://localhost:3001");

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ token: string; moodboardId: string; fileId: string }> },
) {
  const { token, moodboardId, fileId } = await params;
  if (![token, moodboardId, fileId].every(isSafePathSegment)) return badRequest();

  const contentType = request.headers.get("content-type") ?? "application/octet-stream";
  const body = await request.arrayBuffer();
  return relayPut(
    `${API_URL}/v1/present/${token}/moodboards/${moodboardId}/files/${fileId}`,
    { "Content-Type": contentType },
    body,
  );
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string; moodboardId: string; fileId: string }> },
) {
  const { token, moodboardId, fileId } = await params;
  if (![token, moodboardId, fileId].every(isSafePathSegment)) return badRequest();

  return relayGet(`${API_URL}/v1/present/${token}/moodboards/${moodboardId}/files/${fileId}`, {});
}
