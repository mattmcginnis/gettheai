import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { validateTwoFactorCode } from "@/lib/auth";

const schema = z.object({
  code: z.string()
});

export async function POST(request: NextRequest) {
  try {
    const { code } = schema.parse(await request.json());

    if (!validateTwoFactorCode(code)) {
      return NextResponse.json({ error: "Enter a six-digit authenticator code." }, { status: 422 });
    }

    return NextResponse.json({
      twoFactorEnabled: true,
      verificationTier: "two_factor"
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid 2FA request." },
      { status: 400 }
    );
  }
}
