import type { Metadata } from "next";
import Link from "next/link";
import { AuthScreen } from "@/components/auth-screen";

export const metadata: Metadata = {
  title: "Sign In"
};

export default function SignInPage() {
  return (
    <main className="py-12">
      <AuthScreen mode="sign-in" />
      <section className="shell mt-5 max-w-md">
        <div className="mt-5 flex justify-between text-sm">
          <Link className="text-mint hover:underline" href="/sign-up">Create account</Link>
          <Link className="text-mint hover:underline" href="/account/security">Reset or secure account</Link>
        </div>
      </section>
    </main>
  );
}
