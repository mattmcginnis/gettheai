import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink, ShieldCheck } from "lucide-react";
import { requirePageRole } from "@/lib/page-auth";
import { getAdminEntityDetail } from "@/lib/repository";

const entityLabels: Record<string, string> = {
  users: "User",
  listings: "Listing",
  offers: "Offer",
  transactions: "Transaction",
  support: "Support case",
  audit: "Audit event"
};

export const metadata: Metadata = {
  title: "Admin Detail"
};

export default async function AdminEntityDetailPage({
  params
}: {
  params: Promise<{ entity: string; id: string }>;
}) {
  const { entity, id } = await params;
  await requirePageRole(["admin"], `/admin/${entity}/${id}`);
  const detail = await getAdminEntityDetail(entity, decodeURIComponent(id));

  if (!detail) {
    notFound();
  }

  return (
    <main>
      <section className="border-b border-line bg-white py-8">
        <div className="shell">
          <Link href="/admin" className="focus-ring inline-flex items-center gap-2 text-sm font-semibold text-ink/66 hover:text-mint">
            <ArrowLeft size={16} />
            Admin
          </Link>
          <div className="mt-5 flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-sm font-bold uppercase text-coral">{entityLabels[detail.entity] ?? "Record"}</p>
              <h1 className="mt-2 text-4xl font-bold">{detail.title}</h1>
              <p className="mt-2 text-sm text-ink/58">{detail.subtitle}</p>
            </div>
            {detail.primaryHref ? (
              <Link href={detail.primaryHref} className="focus-ring inline-flex h-11 items-center gap-2 rounded-md bg-ink px-4 text-sm font-semibold text-white hover:bg-mint">
                <ExternalLink size={16} />
                Open record
              </Link>
            ) : null}
          </div>
        </div>
      </section>

      <section className="py-8">
        <div className="shell grid gap-6 lg:grid-cols-2">
          {detail.sections.map((section) => (
            <div key={section.title} className="rounded-md border border-line bg-white p-5 shadow-panel">
              <div className="flex items-center gap-2">
                <ShieldCheck className="text-mint" size={18} aria-hidden="true" />
                <h2 className="text-2xl font-bold">{section.title}</h2>
              </div>
              <dl className="mt-5 grid gap-3">
                {section.rows.map((row) => (
                  <div key={row.label} className="rounded-md border border-line p-3">
                    <dt className="text-xs font-bold uppercase text-ink/45">{formatLabel(row.label)}</dt>
                    <dd className="mt-1 text-sm text-ink/72">
                      {row.preformatted ? (
                        <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words text-xs leading-5">{row.value}</pre>
                      ) : (
                        row.value
                      )}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}

function formatLabel(label: string) {
  return label.replace(/([a-z])([A-Z])/g, "$1 $2").replaceAll("_", " ");
}
