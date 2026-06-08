import Link from "next/link";
import { Receipt, Car, ArrowUpRight } from "lucide-react";
import { getStatus } from "@/lib/api";
import { StatusLookupForm } from "@/components/StatusLookupForm";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatusResults } from "@/components/StatusResults";
import { FaqSection } from "@/components/status/FaqSection";
import { RECEIPT_FORM_URL, MILEAGE_FORM_URL } from "@/lib/forms";
import type { StatusResponse } from "@/lib/types";

export const metadata = { title: "Check Status" };

function SubmitCard({ href, icon: Icon, title, sub }: { href: string; icon: typeof Receipt; title: string; sub: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="surge-card surge-card-hover flex items-center gap-3">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-brand-gradient text-white">
        <Icon size={20} />
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
    <div className="mx-auto max-w-3xl">
      {/* Hero */}
      <section className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Track your reimbursement</h1>
        <p className="muted mt-1 text-sm">
          Submit a receipt or mileage claim, then check where it is in the process.
        </p>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <SubmitCard href={RECEIPT_FORM_URL} icon={Receipt} title="Submit a Receipt" sub="Reimbursement for a purchase" />
          <SubmitCard href={MILEAGE_FORM_URL} icon={Car} title="Submit Mileage" sub="Reimbursement for driving" />
        </div>
      </section>

      {/* Lookup */}
      <div className="surge-card mb-6">
        <p className="section-title mb-2">Check your status</p>
        <StatusLookupForm defaultEmail={email} preserveId={id} />
        {!email && id && (
          <p className="muted mt-2 text-xs">This link points to a specific submission — enter your email to view it.</p>
        )}
      </div>

      {body}

      <FaqSection />
    </div>
  );
}
