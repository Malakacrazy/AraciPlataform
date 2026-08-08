import { NextRequest, NextResponse } from "next/server";
import { errorResponse } from "@/lib/api";
import { requireSessionAccount } from "@/lib/session";
import { approveGateSchema, approvePhaseGate } from "@/modules/erp/phases";

type RouteContext = { params: Promise<{ id: string; phaseId: string }> };

// Ação dedicada (POST .../approve), não um PATCH genérico na fase — não
// existe rota para setar approvedAt diretamente, só esta, que aplica as
// regras do gate (ordem sequencial, canal válido) antes de gravar.
export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    const { accountId } = await requireSessionAccount();
    const { id, phaseId } = await params;
    const input = approveGateSchema.parse(await request.json());
    const phase = await approvePhaseGate(accountId, id, phaseId, input);
    return NextResponse.json({ data: phase });
  } catch (error) {
    return errorResponse(error);
  }
}
