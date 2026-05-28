import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { runAppraisal } from "@/lib/ai";
import { recordAnalyticsEvent } from "@/lib/repository";

const schema = z.object({
  domain: z.string().min(3)
});

export async function POST(request: NextRequest) {
  try {
    const body = schema.parse(await request.json());
    const appraisal = await runAppraisal(body.domain);
    await recordAnalyticsEvent({
      eventType: "analytics.appraisal.completed",
      entityType: "appraisal",
      entityId: appraisal.domain,
      metadata: {
        confidence: appraisal.confidence,
        lowEstimate: appraisal.lowEstimate,
        highEstimate: appraisal.highEstimate,
        modelVersion: appraisal.modelVersion
      }
    });

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
