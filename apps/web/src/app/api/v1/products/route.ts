import { NextRequest, NextResponse } from "next/server";
import { errorResponse } from "@/lib/api";
import { requireSessionAccount } from "@/lib/session";
import { createProduct, listProducts, productInputSchema } from "@/modules/ffe/products";

export async function GET() {
  try {
    const { accountId } = await requireSessionAccount();
    const products = await listProducts(accountId);
    return NextResponse.json({ data: products });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const { accountId } = await requireSessionAccount();
    const input = productInputSchema.parse(await request.json());
    const product = await createProduct(accountId, input);
    return NextResponse.json({ data: product }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
