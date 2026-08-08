import { NextRequest, NextResponse } from "next/server";
import { errorResponse } from "@/lib/api";
import { requireSessionAccount } from "@/lib/session";
import { deleteArea } from "@/modules/ffe/areas";

type RouteContext = { params: Promise<{ id: string }> };

export async function DELETE(_request: NextRequest, { params }: RouteContext) {
  try {
    const { accountId } = await requireSessionAccount();
    const { id } = await params;
    await deleteArea(accountId, id);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return errorResponse(error);
  }
}
