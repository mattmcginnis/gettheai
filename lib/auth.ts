import type { VerificationTier } from "@/lib/types";
import { getPrisma, isDatabaseConfigured } from "@/lib/prisma";

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

async function getClerkAuthContext(request: Request): Promise<AuthSession | null> {
  if (!canUseClerk()) {
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
        claims?.unsafeMetadata?.role ??
        claims?.role
    ) ?? normalizeRole(process.env.CLERK_DEFAULT_ROLE) ?? "buyer";

    if (!clerkAuth.userId) {
      return null;
    }

    const twoFactorEnabled = deriveTwoFactorEnabled(claims);
    const verificationTier = deriveVerificationTier(claims, role, twoFactorEnabled);

    return {
      userId: clerkAuth.userId,
      provider: "clerk",
      clerkUserId: clerkAuth.userId,
      email: (await getClerkEmail(clerkAuth.userId, claims)).toLowerCase(),
      role,
      verificationTier,
      twoFactorEnabled
    };
  } catch {
    return null;
  }
}

function canUseClerk() {
  return Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY);
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

function normalizeRole(value: unknown): AuthRole | null {
  if (value === "buyer" || value === "seller" || value === "admin") {
    return value;
  }

  return null;
}

function getClaimEmail(claims: ClerkClaims | null | undefined) {
  const email =
    claims?.email ??
    claims?.primary_email_address ??
    claims?.email_address ??
    claims?.publicMetadata?.email ??
    claims?.metadata?.email;
  return typeof email === "string" ? email : "user@getthe.local";
}

async function getClerkEmail(userId: string, claims: ClerkClaims | null | undefined) {
  const claimEmail = getClaimEmail(claims);
  if (claimEmail !== "user@getthe.local") {
    return claimEmail;
  }

  try {
    const { clerkClient } = await import("@clerk/nextjs/server");
    const client = await clerkClient();
    const user = await client.users.getUser(userId);
    const primary = user.emailAddresses.find((email) => email.id === user.primaryEmailAddressId);
    return primary?.emailAddress ?? user.emailAddresses[0]?.emailAddress ?? `${userId}@clerk.getthe.local`;
  } catch {
    return `${userId}@clerk.getthe.local`;
  }
}

function deriveTwoFactorEnabled(claims: ClerkClaims | null | undefined) {
  const metadataValue =
    claims?.two_factor_enabled ??
    claims?.metadata?.twoFactorEnabled ??
    claims?.metadata?.two_factor_enabled ??
    claims?.publicMetadata?.twoFactorEnabled ??
    claims?.publicMetadata?.two_factor_enabled ??
    claims?.privateMetadata?.twoFactorEnabled ??
    claims?.privateMetadata?.two_factor_enabled;

  if (metadataValue === true || metadataValue === "true") {
    return true;
  }

  const amr = Array.isArray(claims?.amr) ? claims.amr.map(String) : [];
  return amr.some((method) => ["mfa", "otp", "totp", "two_factor"].includes(method.toLowerCase()));
}

function deriveVerificationTier(
  claims: ClerkClaims | null | undefined,
  role: AuthRole,
  twoFactorEnabled: boolean
): VerificationTier {
  const explicit = normalizeVerificationTier(
    claims?.metadata?.verificationTier ??
      claims?.publicMetadata?.verificationTier ??
      claims?.privateMetadata?.verificationTier ??
      claims?.verificationTier
  );

  if (explicit) {
    return explicit;
  }

  if (role === "buyer") {
    return twoFactorEnabled ? "two_factor" : "email";
  }

  return twoFactorEnabled ? "two_factor" : "email";
}

function normalizeVerificationTier(value: unknown): VerificationTier | null {
  if (value === "email" || value === "two_factor" || value === "escrow_intent" || value === "kyc_review") {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.toLowerCase();
    if (normalized === "email" || normalized === "two_factor" || normalized === "escrow_intent" || normalized === "kyc_review") {
      return normalized;
    }
  }

  return null;
}

async function syncAuthenticatedUser(session: AuthSession) {
  if (session.provider !== "clerk" || !session.clerkUserId || !isDatabaseConfigured()) {
    return;
  }

  const prisma = getPrisma();
  const existing = await prisma.user.findFirst({
    where: {
      OR: [{ clerkUserId: session.clerkUserId }, { email: session.email }]
    }
  });
  const data = {
    clerkUserId: session.clerkUserId,
    email: session.email,
    displayName: session.email.split("@")[0],
    role: mapRoleToPrisma(session.role),
    verificationTier: mapVerificationToPrisma(session.verificationTier),
    twoFactorEnabled: session.twoFactorEnabled
  };

  const user = existing
    ? await prisma.user.update({
        where: { id: existing.id },
        data
      })
    : await prisma.user.create({
        data
      });

  if (session.role === "seller") {
    await prisma.sellerProfile.upsert({
      where: { userId: user.id },
      update: {},
      create: {
        userId: user.id,
        publicName: user.displayName ?? "GetThe Seller",
        slug: `${(user.displayName ?? "getthe-seller").toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${user.id.slice(-6)}`
      }
    });
  }
}

function mapRoleToPrisma(role: AuthRole): "BUYER" | "SELLER" | "ADMIN" {
  if (role === "admin") return "ADMIN";
  if (role === "seller") return "SELLER";
  return "BUYER";
}

function mapVerificationToPrisma(tier: VerificationTier) {
  return tier.toUpperCase() as "EMAIL" | "TWO_FACTOR" | "ESCROW_INTENT" | "KYC_REVIEW";
}

interface ClerkClaims {
  email?: unknown;
  primary_email_address?: unknown;
  email_address?: unknown;
  role?: unknown;
  verificationTier?: unknown;
  amr?: unknown;
  metadata?: {
    role?: unknown;
    email?: unknown;
    verificationTier?: unknown;
    twoFactorEnabled?: unknown;
    two_factor_enabled?: unknown;
  };
  publicMetadata?: {
    role?: unknown;
    email?: unknown;
    verificationTier?: unknown;
    twoFactorEnabled?: unknown;
    two_factor_enabled?: unknown;
  };
  privateMetadata?: {
    role?: unknown;
    verificationTier?: unknown;
    twoFactorEnabled?: unknown;
    two_factor_enabled?: unknown;
  };
  unsafeMetadata?: {
    role?: unknown;
  };
  two_factor_enabled?: unknown;
}
