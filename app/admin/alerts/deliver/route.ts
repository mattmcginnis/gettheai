import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getRequestAuthContext, hasRole } from "@/lib/auth";
import { deliverSearchAlerts } from "@/lib/repository";

const schema = z.object({
  cadence: z.enum(["instant", "daily", "weekly"]).default("weekly")
});

export async function POST(request: NextRequest) {
  if (!(await hasRole(request, ["admin"]))) {
    return NextResponse.json({ error: "Admin role required." }, { status: 403 });
  }

  try {
    const session = await getRequestAuthContext(request);
    const body = schema.parse(await request.json());
    return NextResponse.json(await deliverSearchAlerts({ cadence: body.cadence, actorEmail: session?.email }));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid alert delivery request." },
      { status: 400 }
    );
  }
}
