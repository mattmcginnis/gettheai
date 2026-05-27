"use client";

import { useState } from "react";
import { KeyRound, Loader2, LogIn, RotateCcw, UserPlus } from "lucide-react";
import type { AuthRole } from "@/lib/auth";

export function AuthWorkbench({ mode }: { mode: "sign-in" | "sign-up" }) {
  const [email, setEmail] = useState("seller@getthe.com");
  const [password, setPassword] = useState("Marketplace2026");
  const [role, setRole] = useState<AuthRole>("seller");
  const [code, setCode] = useState("123456");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState<"submit" | "reset" | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading("submit");
    setMessage("");

    const response = await fetch(mode === "sign-in" ? "/auth/sign-in" : "/auth/sign-up", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password, role, twoFactorCode: code })
    });
    const payload = await response.json();
    setLoading(null);

    if (!response.ok) {
      setMessage(payload.error ?? "Authentication failed.");
      return;
    }

    setMessage(`${payload.session.email} is ${payload.session.verificationTier} verified as ${payload.session.role}.`);
  }

  async function resetPassword() {
    setLoading("reset");
    const response = await fetch("/auth/password-reset", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email })
    });
    const payload = await response.json();
    setLoading(null);
    setMessage(payload.message ?? "Password reset requested.");
  }

  return (
    <div className="shell max-w-md rounded-md border border-line bg-white p-6 shadow-panel">
      <div className="flex items-center gap-2">
        {mode === "sign-in" ? <LogIn className="text-mint" size={20} /> : <UserPlus className="text-sky" size={20} />}
        <h1 className="text-2xl font-bold">{mode === "sign-in" ? "Sign in" : "Create account"}</h1>
      </div>
      <form onSubmit={submit} className="mt-6 grid gap-4">
        <label className="grid gap-1 text-sm font-medium">
          Email
          <input className="focus-ring h-11 rounded-md border border-line px-3" type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
        </label>
        <label className="grid gap-1 text-sm font-medium">
          Password
          <input className="focus-ring h-11 rounded-md border border-line px-3" type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
        </label>
        <label className="grid gap-1 text-sm font-medium">
          Account type
          <select className="focus-ring h-11 rounded-md border border-line px-3" value={role} onChange={(event) => setRole(event.target.value as AuthRole)}>
            <option value="buyer">Buyer</option>
            <option value="seller">Seller</option>
            <option value="admin">Admin</option>
          </select>
        </label>
        <label className="grid gap-1 text-sm font-medium">
          2FA code
          <input className="focus-ring h-11 rounded-md border border-line px-3" inputMode="numeric" value={code} onChange={(event) => setCode(event.target.value)} />
        </label>
        <button className="focus-ring inline-flex h-11 items-center justify-center gap-2 rounded-md bg-ink px-4 text-sm font-semibold text-white hover:bg-mint">
          {loading === "submit" ? <Loader2 className="animate-spin" size={16} /> : <KeyRound size={16} />}
          Continue
        </button>
      </form>
      <button className="focus-ring mt-4 inline-flex items-center gap-2 rounded-md text-sm font-semibold text-mint" onClick={resetPassword}>
        {loading === "reset" ? <Loader2 className="animate-spin" size={16} /> : <RotateCcw size={16} />}
        Send password reset
      </button>
      {message ? <p className="mt-4 rounded-md bg-paper p-3 text-sm text-ink/72">{message}</p> : null}
    </div>
  );
}
