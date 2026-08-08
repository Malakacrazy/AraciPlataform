import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/api";
import { requireSessionAccount } from "@/lib/session";
import { listUsers } from "@/modules/erp/users";

// Sem POST: um User só nasce via login SSO (lib/session.ts).
export async function GET() {
  try {
    const { accountId } = await requireSessionAccount();
    const users = await listUsers(accountId);
    return NextResponse.json({ data: users });
  } catch (error) {
    return errorResponse(error);
  }
}
