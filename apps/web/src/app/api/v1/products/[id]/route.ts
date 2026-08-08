import { NextRequest, NextResponse } from "next/server";
import { errorResponse } from "@/lib/api";
import { requireSessionAccount } from "@/lib/session";
import { deleteProduct, getProduct, productInputSchema, updateProduct } from "@/modules/ffe/products";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: RouteContext) {
  try {
    const { accountId } = await requireSessionAccount();
    const { id } = await params;
    const product = await getProduct(accountId, id);
    return NextResponse.json({ data: product });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  try {
    const { accountId } = await requireSessionAccount();
    const { id } = await params;
    const input = productInputSchema.partial().parse(await request.json());
    const product = await updateProduct(accountId, id, input);
    return NextResponse.json({ data: product });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(_request: NextRequest, { params }: RouteContext) {
  try {
    const { accountId } = await requireSessionAccount();
    const { id } = await params;
    await deleteProduct(accountId, id);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return errorResponse(error);
  }
}
