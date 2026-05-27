import Link from "next/link";
import type { ComponentProps } from "react";
import { CANONICAL_DOMAIN } from "@/lib/constants";

type LinkHref = ComponentProps<typeof Link>["href"];

export function SiteFooter() {
  return (
    <footer className="border-t border-line bg-white">
      <div className="shell grid gap-8 py-10 md:grid-cols-[1.3fr_1fr_1fr_1fr]">
        <div>
          <p className="text-lg font-bold">GetThe</p>
          <p className="mt-3 max-w-sm text-sm leading-6 text-ink/68">
            A US-first domain marketplace for mid-tier sellers, AI-assisted pricing, and
            Escrow.com transaction handoff.
          </p>
        </div>
        <FooterColumn title="Marketplace" links={[["Search", "/domains"], ["Appraise", "/appraisal"], ["Intel", "/intelligence"], ["Sell", "/seller"]]} />
        <FooterColumn title="Trust" links={[["Security", "/security"], ["Legal", "/legal"], ["Admin", "/admin"]]} />
        <div>
          <p className="text-sm font-semibold">Canonical</p>
          <p className="mt-3 text-sm text-ink/68">{CANONICAL_DOMAIN}</p>
          <p className="mt-2 text-sm text-ink/68">getthe.ai and getthe.org share the same marketplace backend.</p>
        </div>
      </div>
    </footer>
  );
}

function FooterColumn({ title, links }: { title: string; links: Array<[string, LinkHref]> }) {
  return (
    <div>
      <p className="text-sm font-semibold">{title}</p>
      <div className="mt-3 grid gap-2">
        {links.map(([label, href]) => (
          <Link key={label} className="text-sm text-ink/68 hover:text-mint" href={href}>
            {label}
          </Link>
        ))}
      </div>
    </div>
  );
}
