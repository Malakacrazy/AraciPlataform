import { NextRequest, NextResponse } from "next/server";
import { errorResponse } from "@/lib/api";
import { requireSessionAccount } from "@/lib/session";
import {
  createOpportunity,
  listOpportunities,
  opportunityInputSchema,
} from "@/modules/crm/opportunities";

export async function GET() {
  try {
    const { accountId } = await requireSessionAccount();
    const opportunities = await listOpportunities(accountId);
    return NextResponse.json({ data: opportunities });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const { accountId } = await requireSessionAccount();
    const input = opportunityInputSchema.parse(await request.json());
    const opportunity = await createOpportunity(accountId, input);
    return NextResponse.json({ data: opportunity }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
