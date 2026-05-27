import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { hasRole } from "@/lib/auth";
import { runModerationScan } from "@/lib/repository";

const schema = z.object({
  actorEmail: z.string().email().optional()
});

export async function POST(request: NextRequest) {
  if (!(await hasRole(request, ["admin"]))) {
    return NextResponse.json({ error: "Admin role required." }, { status: 403 });
  }

  const bodyText = await request.text();
  const body = bodyText ? schema.parse(JSON.parse(bodyText)) : {};
  return NextResponse.json(await runModerationScan(body));
}
