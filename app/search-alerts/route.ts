import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { hasRole } from "@/lib/auth";
import { createSearchAlert } from "@/lib/repository";

const schema = z.object({
  userEmail: z.string().email(),
  name: z.string().min(2),
  filters: z.record(z.unknown()).default({}),
  cadence: z.enum(["instant", "daily", "weekly"]).default("weekly")
});

export async function POST(request: NextRequest) {
  if (!hasRole(request, ["buyer", "seller", "admin"])) {
    return NextResponse.json({ error: "Signed-in user required." }, { status: 403 });
  }

  try {
    return NextResponse.json({ searchAlert: await createSearchAlert(schema.parse(await request.json())) }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Search alert creation failed." },
      { status: 400 }
    );
  }
}
