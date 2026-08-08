import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/api";
import { requireSessionAccount } from "@/lib/session";
import { listProjects } from "@/modules/erp/projects";

// Sem POST aqui de propósito: um Project só nasce via
// modules/crm/convertOpportunityToProject (Opportunity.wonAt), nunca
// criado do zero pela API — não há um segundo caminho de criação no plano.
export async function GET() {
  try {
    const { accountId } = await requireSessionAccount();
    const projects = await listProjects(accountId);
    return NextResponse.json({ data: projects });
  } catch (error) {
    return errorResponse(error);
  }
}
