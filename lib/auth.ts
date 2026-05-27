import type { VerificationTier } from "@/lib/types";

export type AuthRole = "buyer" | "seller" | "admin";

export interface AuthSession {
  userId: string;
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
    return clerkContext;
  }

  return getLocalAuthContext(request);
}

export async function roleFromRequest(request: Request) {
  return (await getRequestAuthContext(request))?.role ?? null;
}

export async function hasRole(request: Request, roles: AuthRole[]) {
  const role = await roleFromRequest(request);
  return Boolean(role && roles.includes(role));
}

function getLocalAuthContext(request: Request): AuthSession | null {
  const explicitRole = request.headers.get("x-getthe-role") as AuthRole | null;
  if (explicitRole && ["buyer", "seller", "admin"].includes(explicitRole)) {
    return {
      userId: request.headers.get("x-getthe-user-id") ?? `local_${explicitRole}`,
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

async function getClerkAuthContext(request: Request): Promise<AuthSession | null> {
  if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && !process.env.CLERK_SECRET_KEY) {
    return null;
  }

  try {
    const { getAuth } = await import("@clerk/nextjs/server");
    const clerkAuth = getAuth(request as Parameters<typeof getAuth>[0]);
    const claims = clerkAuth.sessionClaims as ClerkClaims | null | undefined;
    const role = normalizeRole(
      claims?.metadata?.role ??
        claims?.publicMetadata?.role ??
        claims?.privateMetadata?.role ??
        claims?.role
    );

    if (!clerkAuth.userId || !role) {
      return null;
    }

    return {
      userId: clerkAuth.userId,
      email: getClaimEmail(claims),
      role,
      verificationTier: role === "buyer" ? "email" : "two_factor",
      twoFactorEnabled: role !== "buyer" || Boolean(claims?.two_factor_enabled)
    };
  } catch {
    return null;
  }
}

function normalizeRole(value: unknown): AuthRole | null {
  if (value === "buyer" || value === "seller" || value === "admin") {
    return value;
  }

  return null;
}

function getClaimEmail(claims: ClerkClaims | null | undefined) {
  const email = claims?.email ?? claims?.primary_email_address ?? claims?.email_address;
  return typeof email === "string" ? email : "user@getthe.local";
}

interface ClerkClaims {
  email?: unknown;
  primary_email_address?: unknown;
  email_address?: unknown;
  role?: unknown;
  metadata?: {
    role?: unknown;
  };
  publicMetadata?: {
    role?: unknown;
  };
  privateMetadata?: {
    role?: unknown;
  };
  two_factor_enabled?: unknown;
}
