import type { VerificationTier } from "@/lib/types";
import { canUseClerk, getClerkAuthContext, syncAuthenticatedUser } from "@/lib/clerk-auth";

export type AuthRole = "buyer" | "seller" | "admin";

export interface AuthSession {
  userId: string;
  provider: "local" | "clerk";
  clerkUserId?: string;
  email: string;
  role: AuthRole;
  verificationTier: VerificationTier;
  twoFactorEnabled: boolean;
}

export function validatePassword(password: string) {
  const failures: string[] = [];

  if (password.length < 12) failures.push("Use at least 12 characters.");
  if (!/[A-Z]/.test(password)) failures.push("Add an uppercase letter.");
  if (!/[a-z]/.test(password)) failures.push("Add a lowercase letter.");
  if (!/\d/.test(password)) failures.push("Add a number.");

  return {
    valid: failures.length === 0,
    failures
  };
}

export function createMockSession({
  email,
  role,
  twoFactorCode
}: {
  email: string;
  role: AuthRole;
  twoFactorCode?: string;
}): AuthSession {
  const twoFactorEnabled = role === "seller" || role === "admin" || Boolean(twoFactorCode);
  const verificationTier: VerificationTier = twoFactorEnabled ? "two_factor" : "email";

  return {
    userId: `user_${email.toLowerCase().replace(/[^a-z0-9]/g, "_")}`,
    provider: "local",
    email: email.toLowerCase(),
    role,
    verificationTier,
    twoFactorEnabled
  };
}

export function validateTwoFactorCode(code: string) {
  return /^\d{6}$/.test(code);
}

export function buildSessionCookie(session: AuthSession) {
  return Buffer.from(JSON.stringify(session)).toString("base64url");
}

export function parseSessionCookie(value: string | undefined) {
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as AuthSession;
  } catch {
    return null;
  }
}

export async function getRequestAuthContext(request: Request) {
  const clerkContext = await getClerkAuthContext(request);
  if (clerkContext) {
    await syncAuthenticatedUser(clerkContext);
    return clerkContext;
  }

  return canUseLocalAuthFallback() ? getLocalAuthContext(request) : null;
}

export async function roleFromRequest(request: Request) {
  return (await getRequestAuthContext(request))?.role ?? null;
}

export async function hasRole(request: Request, roles: AuthRole[]) {
  const session = await getRequestAuthContext(request);
  if (!session || !roles.includes(session.role)) {
    return false;
  }

  return !requiresTwoFactor(session.role) || session.twoFactorEnabled;
}

function getLocalAuthContext(request: Request): AuthSession | null {
  const explicitRole = request.headers.get("x-getthe-role") as AuthRole | null;
  if (explicitRole && ["buyer", "seller", "admin"].includes(explicitRole)) {
    return {
      userId: request.headers.get("x-getthe-user-id") ?? `local_${explicitRole}`,
      provider: "local",
      email: request.headers.get("x-getthe-email") ?? `${explicitRole}@getthe.local`,
      role: explicitRole,
      verificationTier: explicitRole === "buyer" ? "email" : "two_factor",
      twoFactorEnabled: explicitRole !== "buyer"
    };
  }

  const cookie = request.headers
    .get("cookie")
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("getthe_session="))
    ?.split("=")[1];

  return parseSessionCookie(cookie);
}

function canUseLocalAuthFallback() {
  // Header/cookie-based role override must never be honored in production, even
  // if Clerk is unconfigured or ALLOW_LOCAL_AUTH_FALLBACK is set. In production
  // the safe failure mode is to deny (return null from getRequestAuthContext);
  // beta-checklist hard-fails the launch gate if the flag is set in production.
  if (process.env.NODE_ENV === "production") {
    return false;
  }

  return !canUseClerk() || process.env.ALLOW_LOCAL_AUTH_FALLBACK === "true";
}

function requiresTwoFactor(role: AuthRole) {
  return role === "seller" || role === "admin";
}
