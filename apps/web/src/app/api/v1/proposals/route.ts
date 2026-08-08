import { NextRequest, NextResponse } from "next/server";
import { errorResponse } from "@/lib/api";
import { requireSessionAccount } from "@/lib/session";
import { createProposal, listProposals, proposalInputSchema } from "@/modules/crm/proposals";

export async function GET(request: NextRequest) {
  try {
    const { accountId } = await requireSessionAccount();
    const opportunityId = request.nextUrl.searchParams.get("opportunityId") ?? undefined;
    const proposals = await listProposals(accountId, opportunityId);
    return NextResponse.json({ data: proposals });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const { accountId } = await requireSessionAccount();
    const input = proposalInputSchema.parse(await request.json());
    const proposal = await createProposal(accountId, input);
    return NextResponse.json({ data: proposal }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
