import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextRequest, NextResponse, type NextFetchEvent } from "next/server";

const useClerkMiddleware = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY);
const withClerk = clerkMiddleware((_auth, request) => handleDomainRewrite(request) ?? NextResponse.next());

export default function middleware(request: NextRequest, event: NextFetchEvent) {
  if (useClerkMiddleware) {
    return withClerk(request, event);
  }

  return handleDomainRewrite(request) ?? NextResponse.next();
}

function handleDomainRewrite(request: NextRequest) {
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

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"]
};
