import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextRequest, NextResponse, type NextFetchEvent } from "next/server";
import { checkRateLimit, isSameOriginRequest } from "@/lib/security";

const useClerkMiddleware = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY);
const withClerk = clerkMiddleware((_auth, request) => handleDomainRewrite(request) ?? NextResponse.next());

export default function middleware(request: NextRequest, event: NextFetchEvent) {
  if (useClerkMiddleware) {
    return withClerk(request, event);
  }

  return handleDomainRewrite(request) ?? NextResponse.next();
}

function handleDomainRewrite(request: NextRequest) {
  const protectionResponse = protectWriteRequest(request);
  if (protectionResponse) {
    return protectionResponse;
  }

  const host = request.headers.get("host")?.toLowerCase() ?? "";
  const path = request.nextUrl.pathname;

  if (path === "/") {
    if (host.includes("getthe.ai")) {
      return NextResponse.rewrite(new URL("/ai", request.url));
    }

    if (host.includes("getthe.org")) {
      return NextResponse.rewrite(new URL("/org", request.url));
    }
  }

  return null;
}

function protectWriteRequest(request: NextRequest) {
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(request.method)) {
    return null;
  }

  const host = request.headers.get("host");
  const origin = request.headers.get("origin");
  if (!isSameOriginRequest({ origin, host })) {
    return NextResponse.json({ error: "Cross-origin write blocked." }, { status: 403 });
  }

  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const rateKey = `${forwardedFor ?? "local"}:${request.nextUrl.pathname}`;
  const rateLimit = checkRateLimit({
    key: rateKey,
    limit: Number(process.env.RATE_LIMIT_WRITES_PER_MINUTE ?? 120)
  });

  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  return null;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"]
};
