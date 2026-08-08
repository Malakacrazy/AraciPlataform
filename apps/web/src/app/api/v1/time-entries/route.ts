import { NextRequest, NextResponse } from "next/server";
import { errorResponse } from "@/lib/api";
import { requireSessionAccount } from "@/lib/session";
import { createTimeEntry, listTimeEntries, timeEntryInputSchema } from "@/modules/erp/timeEntries";

export async function GET(request: NextRequest) {
  try {
    const { accountId } = await requireSessionAccount();
    const projectId = request.nextUrl.searchParams.get("projectId") ?? undefined;
    const userId = request.nextUrl.searchParams.get("userId") ?? undefined;
    const entries = await listTimeEntries(accountId, { projectId, userId });
    return NextResponse.json({ data: entries });
  } catch (error) {
    return errorResponse(error);
  }
}

// userId vem da sessão, nunca do corpo — ver modules/erp/timeEntries.ts.
export async function POST(request: NextRequest) {
  try {
    const { accountId, userId } = await requireSessionAccount();
    const input = timeEntryInputSchema.parse(await request.json());
    const entry = await createTimeEntry(accountId, userId, input);
    return NextResponse.json({ data: entry }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
