import { NextRequest, NextResponse } from "next/server";
import { errorResponse } from "../../../../../lib/api";
import { requireSessionAccount } from "../../../../../lib/session";
import {
  clientInputSchema,
  deleteClient,
  getClient,
  updateClient,
} from "../../../../../modules/crm/clients";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: RouteContext) {
  try {
    const { accountId } = await requireSessionAccount();
    const { id } = await params;
    const client = await getClient(accountId, id);
    return NextResponse.json({ data: client });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  try {
    const { accountId } = await requireSessionAccount();
    const { id } = await params;
    const input = clientInputSchema.partial().parse(await request.json());
    const client = await updateClient(accountId, id, input);
    return NextResponse.json({ data: client });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(_request: NextRequest, { params }: RouteContext) {
  try {
    const { accountId } = await requireSessionAccount();
    const { id } = await params;
    await deleteClient(accountId, id);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return errorResponse(error);
  }
}
