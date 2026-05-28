import { NextResponse } from "next/server";
import { getRuntimeDiagnostics } from "@/lib/observability";

export async function GET() {
  const diagnostics = getRuntimeDiagnostics();
  return NextResponse.json({
    ok: true,
    ...diagnostics,
    checks: {
      auth: diagnostics.localAuthFallback ? "local_fallback" : "provider",
      funds: "escrow_provider_only",
      webhookReplayProtection: process.env.ESCROW_WEBHOOK_SECRET ? "signed_timestamped" : "unsigned_dev_mode"
    }
  });
}
