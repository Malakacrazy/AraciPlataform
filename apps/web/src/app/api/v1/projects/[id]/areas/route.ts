import { NextRequest, NextResponse } from "next/server";
import { errorResponse } from "@/lib/api";
import { requireSessionAccount } from "@/lib/session";
import { areaInputSchema, createArea, listAreas } from "@/modules/ffe/areas";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: RouteContext) {
  try {
    const { accountId } = await requireSessionAccount();
    const { id } = await params;
    const areas = await listAreas(accountId, id);
    return NextResponse.json({ data: areas });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    const { accountId } = await requireSessionAccount();
    const { id } = await params;
    const input = areaInputSchema.parse(await request.json());
    const area = await createArea(accountId, id, input);
    return NextResponse.json({ data: area }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
