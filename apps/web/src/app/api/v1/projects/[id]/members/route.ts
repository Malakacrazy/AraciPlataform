import { NextRequest, NextResponse } from "next/server";
import { errorResponse } from "@/lib/api";
import { requireSessionAccount } from "@/lib/session";
import { addMember, addMemberSchema, listMembers } from "@/modules/erp/projectMembers";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: RouteContext) {
  try {
    const { accountId } = await requireSessionAccount();
    const { id } = await params;
    const members = await listMembers(accountId, id);
    return NextResponse.json({ data: members });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    const { accountId } = await requireSessionAccount();
    const { id } = await params;
    const input = addMemberSchema.parse(await request.json());
    const member = await addMember(accountId, id, input);
    return NextResponse.json({ data: member }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
