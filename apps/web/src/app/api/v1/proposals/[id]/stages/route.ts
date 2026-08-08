import { NextRequest, NextResponse } from "next/server";
import { errorResponse } from "../../../../../../lib/api";
import { requireSessionAccount } from "../../../../../../lib/session";
import { getProposal } from "../../../../../../modules/crm/proposals";

type RouteContext = { params: Promise<{ id: string }> };

// Somente leitura — as linhas de ProposalStage são geradas por
// calcularProposta() na criação da proposta, não editadas diretamente.
export async function GET(_request: NextRequest, { params }: RouteContext) {
  try {
    const { accountId } = await requireSessionAccount();
    const { id } = await params;
    const proposal = await getProposal(accountId, id);
    return NextResponse.json({ data: proposal.stages });
  } catch (error) {
    return errorResponse(error);
  }
}
