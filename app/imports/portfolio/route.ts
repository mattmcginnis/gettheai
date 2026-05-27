import { NextRequest, NextResponse } from "next/server";
import { processPortfolioImport } from "@/lib/repository";

export async function POST(request: NextRequest) {
  const csv = await request.text();
  return NextResponse.json(await processPortfolioImport(csv));
}
