import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { buildSessionCookie, createMockSession, validatePassword, validateTwoFactorCode } from "@/lib/auth";

const schema = z.object({
  email: z.string().email(),
  password: z.string(),
  role: z.enum(["buyer", "seller", "admin"]).default("buyer"),
  twoFactorCode: z.string().optional()
});

export async function POST(request: NextRequest) {
  try {
    const body = schema.parse(await request.json());
    const password = validatePassword(body.password);

    if (!password.valid) {
      return NextResponse.json({ error: password.failures.join(" ") }, { status: 422 });
    }

    if ((body.role === "seller" || body.role === "admin") && !validateTwoFactorCode(body.twoFactorCode ?? "")) {
      return NextResponse.json({ error: "A six-digit 2FA code is required for sellers and admins." }, { status: 422 });
    }

    const session = createMockSession(body);
    const response = NextResponse.json({ session }, { status: 201 });
    response.cookies.set("getthe_session", buildSessionCookie(session), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/"
    });

    return response;
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid sign-up request." },
      { status: 400 }
    );
  }
}
