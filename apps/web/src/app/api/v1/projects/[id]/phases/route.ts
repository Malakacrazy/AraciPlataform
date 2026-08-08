import { NextRequest, NextResponse } from "next/server";
import { errorResponse } from "@/lib/api";
import { requireSessionAccount } from "@/lib/session";
import { listPhases } from "@/modules/erp/phases";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: RouteContext) {
  try {
    const { accountId } = await requireSessionAccount();
    const { id } = await params;
    const phases = await listPhases(accountId, id);
    return NextResponse.json({ data: phases });
  } catch (error) {
    return errorResponse(error);
  }
}
