"use client";

import { SignIn, SignUp } from "@clerk/nextjs";
import { AuthWorkbench } from "@/components/auth-workbench";

export function AuthScreen({ mode }: { mode: "sign-in" | "sign-up" }) {
  if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) {
    return <AuthWorkbench mode={mode} />;
  }

  return (
    <section className="shell max-w-md">
      {mode === "sign-in" ? (
        <SignIn path="/sign-in" routing="path" signUpUrl="/sign-up" fallbackRedirectUrl="/buyer" />
      ) : (
        <SignUp path="/sign-up" routing="path" signInUrl="/sign-in" fallbackRedirectUrl="/account/security" />
      )}
    </section>
  );
}
