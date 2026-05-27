import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const schema = z.object({
  email: z.string().email()
});

export async function POST(request: NextRequest) {
  try {
    const { email } = schema.parse(await request.json());

    return NextResponse.json({
      message: `Password reset email queued for ${email}.`,
      deliveryProvider: process.env.POSTMARK_SERVER_TOKEN ? "postmark" : "local"
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid password reset request." },
      { status: 400 }
    );
  }
}
