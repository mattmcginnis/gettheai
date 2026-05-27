import Link from "next/link";
import type { ComponentProps } from "react";
import { Search, ShieldCheck, Sparkles, UserRound } from "lucide-react";
import { ButtonLink } from "@/components/button-link";

const nav: Array<{ href: ComponentProps<typeof Link>["href"]; label: string }> = [
  { href: "/domains", label: "Domains" },
  { href: "/appraisal", label: "Appraise" },
  { href: "/seller", label: "Sell" },
  { href: "/buyer", label: "Buyer Desk" },
  { href: "/admin", label: "Admin" }
];

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-paper/95 backdrop-blur">
      <div className="shell flex min-h-16 items-center justify-between gap-4">
        <Link className="focus-ring flex items-center gap-3 rounded-md" href="/">
          <span className="grid size-10 place-items-center rounded-md bg-ink text-white">
            <Sparkles size={20} aria-hidden="true" />
          </span>
          <span className="flex flex-col leading-tight">
            <span className="text-base font-bold">GetThe</span>
            <span className="text-xs text-ink/58">Domain Marketplace</span>
          </span>
        </Link>

        <nav className="hidden items-center gap-1 md:flex" aria-label="Primary">
          {nav.map((item) => (
            <Link
              key={item.label}
              href={item.href}
              className="focus-ring rounded-md px-3 py-2 text-sm font-medium text-ink/75 hover:bg-white hover:text-ink"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <ButtonLink href="/domains" variant="secondary" className="hidden sm:inline-flex">
            <Search size={16} aria-hidden="true" />
            Search
          </ButtonLink>
          <ButtonLink href="/account/security" variant="ghost" className="hidden lg:inline-flex">
            <ShieldCheck size={16} aria-hidden="true" />
            2FA
          </ButtonLink>
          <ButtonLink href="/sign-in">
            <UserRound size={16} aria-hidden="true" />
            Sign in
          </ButtonLink>
        </div>
      </div>
    </header>
  );
}
