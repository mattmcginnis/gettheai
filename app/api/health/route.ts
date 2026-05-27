import { NextResponse } from "next/server";
import { isEscrowApiConfigured } from "@/lib/escrow";
import { isDatabaseConfigured } from "@/lib/prisma";
import { getSearchIndexProvider } from "@/lib/search-index";

export async function GET() {
  return NextResponse.json({
    ok: true,
    database: isDatabaseConfigured() ? "configured" : "local",
    search: getSearchIndexProvider(),
    escrow: isEscrowApiConfigured() ? "api" : "handoff",
    ai: process.env.AI_PROVIDER ?? "local",
    storage: process.env.S3_BUCKET ? "s3" : "local"
  });
}
