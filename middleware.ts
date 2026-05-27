import { NextRequest, NextResponse } from "next/server";

export function middleware(request: NextRequest) {
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

  return NextResponse.next();
}

export const config = {
  matcher: ["/"]
};
