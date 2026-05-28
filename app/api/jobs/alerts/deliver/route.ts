import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { hasRole } from "@/lib/auth";
import { deliverSearchAlerts } from "@/lib/repository";

const schema = z.object({
  cadence: z.enum(["instant", "daily", "weekly"]).default("weekly")
});

export async function POST(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");
  const isCron = Boolean(cronSecret && authorization === `Bearer ${cronSecret}`);
  const isAdmin = !cronSecret && (await hasRole(request, ["admin"]));

  if (!isCron && !isAdmin) {
    return NextResponse.json({ error: "Cron secret or admin role required." }, { status: 403 });
  }

  try {
    const body = schema.parse(await request.json().catch(() => ({})));
    return NextResponse.json(
      await deliverSearchAlerts({
        cadence: body.cadence,
        actorEmail: isCron ? "cron@getthe.com" : undefined
      })
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Alert delivery job failed." },
      { status: 400 }
    );
  }
}
