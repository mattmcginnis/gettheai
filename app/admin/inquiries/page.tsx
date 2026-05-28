import type { Metadata } from "next";
import Link from "next/link";
import { MessageSquareReply } from "lucide-react";
import { InquiryFollowupPanel } from "@/components/inquiry-followup-panel";
import { MetricCard } from "@/components/metric-card";
import { requirePageRole } from "@/lib/page-auth";
import { listParkedInquiries } from "@/lib/repository";
import type { ParkedInquiry } from "@/lib/types";

export const metadata: Metadata = {
  title: "Inquiry Operations"
};

const statuses: Array<ParkedInquiry["status"] | "all"> = ["all", "new", "contacted", "converted", "closed"];

export default async function AdminInquiriesPage({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requirePageRole(["admin"], "/admin/inquiries");
  const params = await searchParams;
  const status = normalizeStatus(value(params.status));
  const q = value(params.q);
  const inquiries = await listParkedInquiries({
    email: session.email,
    role: "admin",
    status,
    q
  });
  const newCount = inquiries.filter((inquiry) => inquiry.status === "new").length;
  const convertedCount = inquiries.filter((inquiry) => inquiry.status === "converted").length;

  return (
    <main>
      <section className="border-b border-line bg-white py-10">
        <div className="shell flex flex-wrap items-end justify-between gap-5">
          <div>
            <p className="text-sm font-bold uppercase text-coral">Admin</p>
            <h1 className="mt-2 text-4xl font-bold">Inquiry operations</h1>
            <p className="mt-3 max-w-3xl text-base leading-7 text-ink/66">
              Track parked-domain buyer interest, seller follow-up, and conversion state.
            </p>
          </div>
          <Link className="focus-ring inline-flex h-11 items-center rounded-md border border-line px-4 text-sm font-semibold hover:border-mint hover:text-mint" href="/admin">
            Operations
          </Link>
        </div>
      </section>

      <section className="py-8">
        <div className="shell grid gap-4 md:grid-cols-3">
          <MetricCard label="Visible" value={String(inquiries.length)} detail="Filtered parked inquiries." icon={<MessageSquareReply size={20} />} />
          <MetricCard label="New" value={String(newCount)} detail="Needs first seller touch." icon={<MessageSquareReply size={20} />} />
          <MetricCard label="Converted" value={String(convertedCount)} detail="Moved toward offer or sale." icon={<MessageSquareReply size={20} />} />
        </div>
      </section>

      <section className="pb-12">
        <div className="shell grid gap-6">
          <form className="grid gap-3 rounded-md border border-line bg-white p-4 shadow-panel md:grid-cols-[1fr_180px_auto]">
            <label className="grid gap-1 text-sm font-semibold">
              Search
              <input className="focus-ring h-11 rounded-md border border-line px-3" name="q" defaultValue={q ?? ""} placeholder="Domain, buyer, seller" />
            </label>
            <label className="grid gap-1 text-sm font-semibold">
              Status
              <select className="focus-ring h-11 rounded-md border border-line px-3" name="status" defaultValue={status}>
                {statuses.map((item) => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </select>
            </label>
            <button className="focus-ring mt-auto h-11 rounded-md bg-ink px-4 text-sm font-semibold text-white" type="submit">
              Apply
            </button>
          </form>

          <InquiryFollowupPanel inquiries={inquiries} actorEmail={session.email} actorRole="admin" title="All parked inquiries" />
        </div>
      </section>
    </main>
  );
}

function value(input: string | string[] | undefined) {
  return Array.isArray(input) ? input[0] : input;
}

function normalizeStatus(input: string | undefined): ParkedInquiry["status"] | "all" {
  return statuses.includes(input as ParkedInquiry["status"] | "all") ? (input as ParkedInquiry["status"] | "all") : "all";
}
