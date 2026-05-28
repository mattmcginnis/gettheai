import { NextRequest, NextResponse } from "next/server";
import { hasRole } from "@/lib/auth";
import { processPortfolioImport } from "@/lib/repository";
import { storeObject } from "@/lib/storage";

export async function POST(request: NextRequest) {
  if (!(await hasRole(request, ["seller", "admin"]))) {
    return NextResponse.json({ error: "Seller or admin role required." }, { status: 403 });
  }

  try {
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
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Portfolio import failed." },
      { status: 400 }
    );
  }
}
