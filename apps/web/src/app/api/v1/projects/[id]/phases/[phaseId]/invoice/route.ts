import { NextRequest, NextResponse } from "next/server";
import { errorResponse } from "@/lib/api";
import { requireSessionAccount } from "@/lib/session";
import { createInvoiceForPhase, createInvoiceSchema } from "@/modules/erp/invoices";

type RouteContext = { params: Promise<{ id: string; phaseId: string }> };

// Ação dedicada, como .../approve — só cria fatura para um estágio cujo
// gate já foi aprovado (ver modules/erp/invoices.ts).
export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    const { accountId } = await requireSessionAccount();
    const { id, phaseId } = await params;
    const input = createInvoiceSchema.parse(await request.json());
    const invoice = await createInvoiceForPhase(accountId, id, phaseId, input);
    return NextResponse.json({ data: invoice }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
