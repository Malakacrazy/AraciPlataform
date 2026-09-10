import { NextRequest, NextResponse } from "next/server";
import { mintInternalToken } from "@/lib/internalToken";
import { withScheme } from "@/lib/url";
import { badRequest, isSafePathSegment, relayGet, relayPut } from "@/lib/binaryProxy";

// Binário puro nos dois sentidos -- ver lib/binaryProxy.ts sobre por que
// o proxy BFF genérico (api/v1/[...path]/route.ts) não serve aqui.
const API_URL = withScheme(process.env.API_URL ?? "http://localhost:3001");

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string; fileId: string }> }) {
  const token = await mintInternalToken();
  if (!token) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Sessão inválida ou ausente." } }, { status: 401 });
  }
  const { id, fileId } = await params;
  if (!isSafePathSegment(id) || !isSafePathSegment(fileId)) return badRequest();

  const contentType = request.headers.get("content-type") ?? "application/octet-stream";
  const body = await request.arrayBuffer();
  return relayPut(`${API_URL}/v1/moodboards/${id}/files/${fileId}`, {
    Authorization: `Bearer ${token}`,
    "Content-Type": contentType,
  }, body);
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string; fileId: string }> }) {
  const token = await mintInternalToken();
  if (!token) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Sessão inválida ou ausente." } }, { status: 401 });
  }
  const { id, fileId } = await params;
  if (!isSafePathSegment(id) || !isSafePathSegment(fileId)) return badRequest();

  return relayGet(`${API_URL}/v1/moodboards/${id}/files/${fileId}`, { Authorization: `Bearer ${token}` });
}
