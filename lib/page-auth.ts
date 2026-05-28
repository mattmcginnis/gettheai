import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getRequestAuthContext, type AuthRole } from "@/lib/auth";

export async function getPageAuthContext() {
  const incomingHeaders = await headers();
  const request = new Request("https://getthe.local/page", {
    headers: new Headers(incomingHeaders)
  });

  return getRequestAuthContext(request);
}

export async function requirePageRole(roles: AuthRole[], nextPath = "/") {
  const session = await getPageAuthContext();
  if (!session) {
    redirect(`/sign-in?next=${encodeURIComponent(nextPath)}`);
  }

  if (!roles.includes(session.role)) {
    redirect("/account/security?reason=role");
  }

  if ((session.role === "seller" || session.role === "admin") && !session.twoFactorEnabled) {
    redirect("/account/security?reason=2fa");
  }

  return session;
}
