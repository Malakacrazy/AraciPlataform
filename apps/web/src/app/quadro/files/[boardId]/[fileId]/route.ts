import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { withScheme } from "@/lib/url";
import { SESSION_COOKIE } from "@/lib/whiteboardGuestPortalApi";
import { badRequest, isSafePathSegment, relayGet, relayPut } from "@/lib/binaryProxy";

// Sessão de convidado (cookie, mesmo nome que whiteboardGuestPortalApi.ts
// usa em todo outro fetch do portal) -- encaminhada como o cabeçalho
// x-whiteboard-guest-session que WhiteboardGuestPortalController espera,
// igual a saveGuestBoardSnapshot etc.
const API_URL = withScheme(process.env.API_URL ?? "http://localhost:3001");

export async function PUT(request: NextRequest, { params }: { params: Promise<{ boardId: string; fileId: string }> }) {
  const sessionToken = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!sessionToken) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Sessão de convidado ausente." } }, { status: 401 });
  }
  const { boardId, fileId } = await params;
  if (!isSafePathSegment(boardId) || !isSafePathSegment(fileId)) return badRequest();

  const contentType = request.headers.get("content-type") ?? "application/octet-stream";
  const body = await request.arrayBuffer();
  return relayPut(
    `${API_URL}/v1/whiteboard-guest-portal/boards/${boardId}/files/${fileId}`,
    { "X-Whiteboard-Guest-Session": sessionToken, "Content-Type": contentType },
    body,
  );
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ boardId: string; fileId: string }> }) {
  const sessionToken = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!sessionToken) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Sessão de convidado ausente." } }, { status: 401 });
  }
  const { boardId, fileId } = await params;
  if (!isSafePathSegment(boardId) || !isSafePathSegment(fileId)) return badRequest();

  return relayGet(`${API_URL}/v1/whiteboard-guest-portal/boards/${boardId}/files/${fileId}`, {
    "X-Whiteboard-Guest-Session": sessionToken,
  });
}
