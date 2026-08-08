import { NextRequest, NextResponse } from "next/server";
import { errorResponse } from "@/lib/api";
import { requireSessionAccount } from "@/lib/session";
import { listInvoices } from "@/modules/erp/invoices";

// Sem POST aqui de propósito, mesmo padrão de /projects — uma Invoice só
// nasce via POST /projects/:id/phases/:phaseId/invoice, que valida o gate
// aprovado antes de criar.
export async function GET(request: NextRequest) {
  try {
    const { accountId } = await requireSessionAccount();
    const projectId = request.nextUrl.searchParams.get("projectId") ?? undefined;
    const invoices = await listInvoices(accountId, projectId);
    return NextResponse.json({ data: invoices });
  } catch (error) {
    return errorResponse(error);
  }
}
