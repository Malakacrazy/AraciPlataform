import { NextRequest, NextResponse } from "next/server";
import { errorResponse } from "../../../../../lib/api";
import { requireSessionAccount } from "../../../../../lib/session";
import { getProposal, statusUpdateSchema, updateProposalStatus } from "../../../../../modules/crm/proposals";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: RouteContext) {
  try {
    const { accountId } = await requireSessionAccount();
    const { id } = await params;
    const proposal = await getProposal(accountId, id);
    return NextResponse.json({ data: proposal });
  } catch (error) {
    return errorResponse(error);
  }
}

// Só transição de status (draft → sent → signed/expired). value,
// complexityMultiplier e as stages são derivados do cálculo em
// modules/crm/pricing.ts na criação — não são editáveis aqui; para
// mudar o cálculo, crie uma nova proposta.
export async function PATCH(request: NextRequest, { params }: RouteContext) {
  try {
    const { accountId } = await requireSessionAccount();
    const { id } = await params;
    const input = statusUpdateSchema.parse(await request.json());
    const proposal = await updateProposalStatus(accountId, id, input);
    return NextResponse.json({ data: proposal });
  } catch (error) {
    return errorResponse(error);
  }
}
