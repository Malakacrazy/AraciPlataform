import { NextRequest, NextResponse } from "next/server";
import { errorResponse } from "@/lib/api";
import { requireSessionAccount } from "@/lib/session";
import { approveTimeEntry } from "@/modules/erp/timeEntries";

type RouteContext = { params: Promise<{ id: string }> };

// Quem chama este endpoint é o aprovador (approvedById), não quem lançou
// a hora — a API não impede hoje que alguém aprove o próprio lançamento;
// isso ficaria a cargo de uma regra de papel/permissão que ainda não
// existe (ver reconciliação de papéis pendente em decisoes-pos-descoberta.md).
export async function POST(_request: NextRequest, { params }: RouteContext) {
  try {
    const { accountId, userId } = await requireSessionAccount();
    const { id } = await params;
    const entry = await approveTimeEntry(accountId, id, userId);
    return NextResponse.json({ data: entry });
  } catch (error) {
    return errorResponse(error);
  }
}
