import { NextRequest, NextResponse } from "next/server";
import { errorResponse } from "../../../../lib/api";
import { requireSessionAccount } from "../../../../lib/session";
import { listRoleRates, roleRateInputSchema, upsertRoleRate } from "../../../../modules/crm/role-rates";

export async function GET() {
  try {
    const { accountId } = await requireSessionAccount();
    const rates = await listRoleRates(accountId);
    return NextResponse.json({ data: rates });
  } catch (error) {
    return errorResponse(error);
  }
}

// Upsert por role — reenviar o mesmo papel com nova tarifa atualiza em vez
// de duplicar (RoleRate tem @@unique([accountId, role])).
export async function POST(request: NextRequest) {
  try {
    const { accountId } = await requireSessionAccount();
    const input = roleRateInputSchema.parse(await request.json());
    const rate = await upsertRoleRate(accountId, input);
    return NextResponse.json({ data: rate }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
