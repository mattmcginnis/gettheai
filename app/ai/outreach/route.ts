import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { hasRole } from "@/lib/auth";
import { createAiOutreachDraft } from "@/lib/repository";

const schema = z.object({
  listingId: z.string(),
  targetCompany: z.string().min(2),
  targetEmail: z.string().email().optional(),
  context: z.string().min(3),
  actorEmail: z.string().email().optional()
});

export async function POST(request: NextRequest) {
  if (!hasRole(request, ["seller", "admin"])) {
    return NextResponse.json({ error: "Seller or admin role required." }, { status: 403 });
  }

  try {
    return NextResponse.json({ outreachDraft: await createAiOutreachDraft(schema.parse(await request.json())) }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Outreach draft failed." },
      { status: 400 }
    );
  }
}
