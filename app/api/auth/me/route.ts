import { NextRequest, NextResponse } from "next/server";
import { getRequestAuthContext } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const session = await getRequestAuthContext(request);

  if (!session) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  return NextResponse.json({
    authenticated: true,
    session: {
      userId: session.userId,
      provider: session.provider,
      email: session.email,
      role: session.role,
      verificationTier: session.verificationTier,
      twoFactorEnabled: session.twoFactorEnabled
    }
  });
}
