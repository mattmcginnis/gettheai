import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { buildSessionCookie, createMockSession, validateTwoFactorCode } from "@/lib/auth";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  role: z.enum(["buyer", "seller", "admin"]).default("buyer"),
  twoFactorCode: z.string().optional()
});

export async function POST(request: NextRequest) {
  try {
    const body = schema.parse(await request.json());

    if ((body.role === "seller" || body.role === "admin") && !validateTwoFactorCode(body.twoFactorCode ?? "")) {
      return NextResponse.json({ error: "A valid six-digit 2FA code is required." }, { status: 422 });
    }

    const session = createMockSession(body);
    const response = NextResponse.json({ session });
    response.cookies.set("getthe_session", buildSessionCookie(session), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/"
    });

    return response;
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid sign-in request." },
      { status: 400 }
    );
  }
}
