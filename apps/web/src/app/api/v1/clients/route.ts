import { NextRequest, NextResponse } from "next/server";
import { errorResponse } from "@/lib/api";
import { requireSessionAccount } from "@/lib/session";
import { clientInputSchema, createClient, listClients } from "@/modules/crm/clients";

export async function GET() {
  try {
    const { accountId } = await requireSessionAccount();
    const clients = await listClients(accountId);
    return NextResponse.json({ data: clients });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const { accountId } = await requireSessionAccount();
    const input = clientInputSchema.parse(await request.json());
    const client = await createClient(accountId, input);
    return NextResponse.json({ data: client }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
