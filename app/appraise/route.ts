import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { runAppraisal } from "@/lib/ai";

const schema = z.object({
  domain: z.string().min(3)
});

export async function POST(request: NextRequest) {
  try {
    const body = schema.parse(await request.json());
    const appraisal = await runAppraisal(body.domain);

    return NextResponse.json({
      appraisal,
      listingCta: `/seller?domain=${encodeURIComponent(appraisal.domain)}`
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid appraisal request." },
      { status: 400 }
    );
  }
}
