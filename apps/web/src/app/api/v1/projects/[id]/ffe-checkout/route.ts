import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse } from "@/lib/api";
import { requireSessionAccount } from "@/lib/session";
import { approveCartToInvoiceDraft } from "@/modules/ffe/specifications";

type RouteContext = { params: Promise<{ id: string }> };

const checkoutSchema = z.object({
  specificationIds: z.array(z.string().min(1)).min(1),
});

// Fluxo automático #3 — ver modules/ffe/specifications.ts
// (approveCartToInvoiceDraft) para a lógica completa.
export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    const { accountId } = await requireSessionAccount();
    const { id } = await params;
    const { specificationIds } = checkoutSchema.parse(await request.json());
    const invoice = await approveCartToInvoiceDraft(accountId, id, specificationIds);
    return NextResponse.json({ data: invoice }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
