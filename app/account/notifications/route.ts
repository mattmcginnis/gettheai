import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getRequestAuthContext } from "@/lib/auth";
import { updateNotificationPreferences } from "@/lib/repository";

const schema = z.object({
  preferences: z.object({
    instantAlerts: z.boolean(),
    dailyDigest: z.boolean(),
    weeklyDigest: z.boolean(),
    offerUpdates: z.boolean(),
    transactionUpdates: z.boolean(),
    supportUpdates: z.boolean()
  })
});

export async function POST(request: NextRequest) {
  const session = await getRequestAuthContext(request);
  if (!session) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  try {
    const body = schema.parse(await request.json());
    return NextResponse.json({
      preferences: await updateNotificationPreferences({
        email: session.email,
        preferences: body.preferences
      })
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid notification preferences." },
      { status: 400 }
    );
  }
}
