import type { Metadata } from "next";
import Link from "next/link";
import { AuthScreen } from "@/components/auth-screen";

export const metadata: Metadata = {
  title: "Create Account"
};

export default function SignUpPage() {
  return (
    <main className="py-12">
      <AuthScreen mode="sign-up" />
      <section className="shell mt-5 max-w-md">
        <p className="mt-5 text-sm text-ink/62">
          Already have an account? <Link className="text-mint hover:underline" href="/sign-in">Sign in</Link>
        </p>
      </section>
    </main>
  );
}
