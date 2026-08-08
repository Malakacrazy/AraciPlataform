import { NextRequest, NextResponse } from "next/server";
import { errorResponse } from "@/lib/api";
import { requireSessionAccount } from "@/lib/session";
import { getInvoice, invoiceStatusUpdateSchema, updateInvoiceStatus } from "@/modules/erp/invoices";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: RouteContext) {
  try {
    const { accountId } = await requireSessionAccount();
    const { id } = await params;
    const invoice = await getInvoice(accountId, id);
    return NextResponse.json({ data: invoice });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  try {
    const { accountId } = await requireSessionAccount();
    const { id } = await params;
    const input = invoiceStatusUpdateSchema.parse(await request.json());
    const invoice = await updateInvoiceStatus(accountId, id, input);
    return NextResponse.json({ data: invoice });
  } catch (error) {
    return errorResponse(error);
  }
}
