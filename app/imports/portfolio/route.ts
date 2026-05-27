import { NextRequest, NextResponse } from "next/server";
import { processPortfolioImport } from "@/lib/repository";
import { storeObject } from "@/lib/storage";

export async function POST(request: NextRequest) {
  const csv = await request.text();
  const result = await processPortfolioImport(csv);
  const stored = await storeObject({
    key: `imports/${Date.now()}-portfolio.csv`,
    bytes: new TextEncoder().encode(csv),
    contentType: "text/csv"
  });

  return NextResponse.json({
    ...result,
    storedImport: stored
  });
}
