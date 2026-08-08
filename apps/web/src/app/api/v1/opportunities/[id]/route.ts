import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse } from "../../../../../lib/api";
import { requireSessionAccount } from "../../../../../lib/session";
import {
  deleteOpportunity,
  getOpportunity,
  opportunityInputSchema,
  updateOpportunity,
} from "../../../../../modules/crm/opportunities";

type RouteContext = { params: Promise<{ id: string }> };

const updateSchema = opportunityInputSchema.partial().extend({
  wonAt: z.iso.datetime().nullable().optional(),
  lostAt: z.iso.datetime().nullable().optional(),
});

export async function GET(_request: NextRequest, { params }: RouteContext) {
  try {
    const { accountId } = await requireSessionAccount();
    const { id } = await params;
    const opportunity = await getOpportunity(accountId, id);
    return NextResponse.json({ data: opportunity });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  try {
    const { accountId } = await requireSessionAccount();
    const { id } = await params;
    const body = updateSchema.parse(await request.json());
    const opportunity = await updateOpportunity(accountId, id, {
      ...body,
      wonAt: body.wonAt === undefined ? undefined : body.wonAt === null ? null : new Date(body.wonAt),
      lostAt: body.lostAt === undefined ? undefined : body.lostAt === null ? null : new Date(body.lostAt),
    });
    return NextResponse.json({ data: opportunity });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(_request: NextRequest, { params }: RouteContext) {
  try {
    const { accountId } = await requireSessionAccount();
    const { id } = await params;
    await deleteOpportunity(accountId, id);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return errorResponse(error);
  }
}
