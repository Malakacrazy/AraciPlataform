import { NextRequest, NextResponse } from "next/server";
import { errorResponse } from "@/lib/api";
import { requireSessionAccount } from "@/lib/session";
import { getUser, updateUser, userUpdateSchema } from "@/modules/erp/users";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: RouteContext) {
  try {
    const { accountId } = await requireSessionAccount();
    const { id } = await params;
    const user = await getUser(accountId, id);
    return NextResponse.json({ data: user });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  try {
    const { accountId } = await requireSessionAccount();
    const { id } = await params;
    const input = userUpdateSchema.parse(await request.json());
    const user = await updateUser(accountId, id, input);
    return NextResponse.json({ data: user });
  } catch (error) {
    return errorResponse(error);
  }
}
