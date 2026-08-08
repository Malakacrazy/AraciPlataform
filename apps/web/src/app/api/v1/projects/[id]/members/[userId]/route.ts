import { NextRequest, NextResponse } from "next/server";
import { errorResponse } from "@/lib/api";
import { requireSessionAccount } from "@/lib/session";
import { removeMember } from "@/modules/erp/projectMembers";

type RouteContext = { params: Promise<{ id: string; userId: string }> };

export async function DELETE(_request: NextRequest, { params }: RouteContext) {
  try {
    const { accountId } = await requireSessionAccount();
    const { id, userId } = await params;
    await removeMember(accountId, id, userId);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return errorResponse(error);
  }
}
