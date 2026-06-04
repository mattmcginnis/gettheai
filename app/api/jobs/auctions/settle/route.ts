import { NextRequest, NextResponse } from "next/server";
import { hasRole } from "@/lib/auth";
import { settleDueAuctions } from "@/lib/repository";

export async function POST(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");
  const isCron = Boolean(cronSecret && authorization === `Bearer ${cronSecret}`);
  const isAdmin = !cronSecret && (await hasRole(request, ["admin"]));

  if (!isCron && !isAdmin) {
    return NextResponse.json({ error: "Cron secret or admin role required." }, { status: 403 });
  }

  try {
    return NextResponse.json(await settleDueAuctions());
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Auction settlement job failed." },
      { status: 400 }
    );
  }
}
