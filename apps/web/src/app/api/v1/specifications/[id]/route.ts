import { NextRequest, NextResponse } from "next/server";
import { errorResponse } from "@/lib/api";
import { requireSessionAccount } from "@/lib/session";
import { deleteSpecification, specificationUpdateSchema, updateSpecification } from "@/modules/ffe/specifications";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  try {
    const { accountId } = await requireSessionAccount();
    const { id } = await params;
    const input = specificationUpdateSchema.parse(await request.json());
    const spec = await updateSpecification(accountId, id, input);
    return NextResponse.json({ data: spec });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(_request: NextRequest, { params }: RouteContext) {
  try {
    const { accountId } = await requireSessionAccount();
    const { id } = await params;
    await deleteSpecification(accountId, id);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return errorResponse(error);
  }
}
