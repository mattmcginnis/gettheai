import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { hasRole } from "@/lib/auth";
import { recordAdminReview } from "@/lib/repository";

const schema = z.object({
  queueItemId: z.string(),
  action: z.enum(["approve", "reject", "request_evidence", "escalate"]),
  note: z.string().min(3)
});

export async function POST(request: NextRequest) {
  if (!(await hasRole(request, ["admin"]))) {
    return NextResponse.json({ error: "Admin role required." }, { status: 403 });
  }

  try {
    const body = schema.parse(await request.json());
    return NextResponse.json({ review: await recordAdminReview(body) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid review request." },
      { status: 400 }
    );
  }
}
