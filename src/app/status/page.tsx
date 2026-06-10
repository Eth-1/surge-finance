import Link from "next/link";
import { Receipt, Car, ArrowUpRight } from "lucide-react";
import { getStatus } from "@/lib/api";
import { StatusLookupForm } from "@/components/StatusLookupForm";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatusResults } from "@/components/StatusResults";
import { FaqSection } from "@/components/status/FaqSection";
import { ScrollPath } from "@/components/status/ScrollPath";
import { RECEIPT_FORM_URL, MILEAGE_FORM_URL } from "@/lib/forms";
import type { StatusResponse } from "@/lib/types";

export const metadata = { title: "Check Status" };

function SubmitCard({ href, icon: Icon, title, sub }: { href: string; icon: typeof Receipt; title: string; sub: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="surge-card surge-card-hover flex items-center gap-3 py-3.5">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-primary-strong text-on-primary">
        <Icon size={19} strokeWidth={1.75} />
      </span>
      <div className="min-w-0">
        <div className="font-medium text-text">{title}</div>
        <div className="muted truncate text-xs">{sub}</div>
      </div>
      <ArrowUpRight size={16} className="ml-auto shrink-0 text-text-muted" />
    </a>
  );
}

export default async function StatusPage({
  searchParams,
}: {
  searchParams: { email?: string; id?: string };
}) {
  const email = (searchParams?.email ?? "").toString().trim().toLowerCase();
  const id = (searchParams?.id ?? "").toString().trim();

  let body: React.ReactNode = null;

  if (email) {
    let res: StatusResponse;
    try {
      res = await getStatus(email, id);
    } catch {
      res = { error: "unavailable" };
    }

    if (res.disabled) {
      body = <EmptyState icon="🚧" title="Self-service lookup is currently disabled." />;
    } else if (res.error === "rate_limited") {
      body = <EmptyState icon="⏳" title="Status lookup is temporarily busy" message="Please try again in a moment." />;
    } else if (res.error) {
      body = (
        <EmptyState icon="⚠️" title="Unable to check status right now." message="Please try again in a few minutes.">
          <Link className="btn btn-ghost" href={`/status?email=${encodeURIComponent(email)}${id ? `&id=${id}` : ""}`}>Retry</Link>
        </EmptyState>
      );
    } else if (!res.records || res.records.length === 0) {
      body = (
        <EmptyState
          icon="📭"
          title={`No submissions found for ${email}.`}
          message="Double-check you entered the same email used on the reimbursement form."
        />
      );
    } else {
      body = <StatusResults records={res.records} requestedId={res.requestedId || ""} email={email} />;
    }
  }

  return (
    <div>
      {/* Editorial hero — asymmetric split: serif statement | lookup (§5.5) */}
      <section className="border-b border-border py-12 sm:py-20 lg:py-24">
        <div className="grid items-center gap-10 lg:grid-cols-[1.15fr,1fr] lg:gap-16">
          <div>
            <h1 className="text-[2.6rem] leading-[1.02] sm:text-6xl">
              Money back,
              <br />
              without the mystery.
            </h1>
            <p className="mt-5 max-w-md text-[15px] leading-relaxed text-text-secondary">
              Submit a receipt or mileage claim, then follow it from approval to
              e-transfer — every step, in plain language.
            </p>
            <div className="mt-8 grid max-w-md grid-cols-1 gap-3">
              <SubmitCard href={RECEIPT_FORM_URL} icon={Receipt} title="Submit a Receipt" sub="Reimbursement for a purchase" />
              <SubmitCard href={MILEAGE_FORM_URL} icon={Car} title="Submit Mileage" sub="Reimbursement for driving" />
            </div>
          </div>

          <div className="surge-card lg:p-7">
            <p className="section-title mb-3">Check your status</p>
            <StatusLookupForm defaultEmail={email} preserveId={id} />
            {!email && id && (
              <p className="muted mt-2 text-xs">This link points to a specific submission — enter your email to view it.</p>
            )}
            <p className="muted mt-4 border-t border-border pt-3 text-xs leading-relaxed">
              Use the Interac e-transfer email from your form. Lookups are private — only
              your own submissions are shown.
            </p>
          </div>
        </div>
      </section>

      {/* Content flow with the scroll-drawn guide line (§5.6) */}
      <div className="relative">
        <ScrollPath />
        <div className="mx-auto max-w-3xl pt-10">
          {body}
          <FaqSection />
        </div>
      </div>
    </div>
  );
}
