import { NextRequest, NextResponse } from "next/server";
import { errorResponse } from "@/lib/api";
import { requireSessionAccount } from "@/lib/session";
import { createSpecification, listSpecifications, specificationInputSchema } from "@/modules/ffe/specifications";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: RouteContext) {
  try {
    const { accountId } = await requireSessionAccount();
    const { id } = await params;
    const specs = await listSpecifications(accountId, id);
    return NextResponse.json({ data: specs });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    const { accountId } = await requireSessionAccount();
    const { id } = await params;
    const input = specificationInputSchema.parse(await request.json());
    const spec = await createSpecification(accountId, id, input);
    return NextResponse.json({ data: spec }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
