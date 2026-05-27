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

export function roleFromRequest(request: Request) {
  const explicitRole = request.headers.get("x-getthe-role") as AuthRole | null;
  if (explicitRole && ["buyer", "seller", "admin"].includes(explicitRole)) {
    return explicitRole;
  }

  const cookie = request.headers
    .get("cookie")
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("getthe_session="))
    ?.split("=")[1];

  return parseSessionCookie(cookie)?.role ?? null;
}

export function hasRole(request: Request, roles: AuthRole[]) {
  const role = roleFromRequest(request);
  return Boolean(role && roles.includes(role));
}
