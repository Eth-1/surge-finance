import Link from "next/link";
import { getStatus } from "@/lib/api";
import { StatusLookupForm } from "@/components/StatusLookupForm";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatusResults } from "@/components/StatusResults";
import type { StatusResponse } from "@/lib/types";

export const metadata = { title: "Check Status — Surge Finance" };

export default async function StatusPage({
  searchParams,
}: {
  searchParams: { email?: string; id?: string };
}) {
  const email = (searchParams?.email ?? "").toString().trim().toLowerCase();
  const id = (searchParams?.id ?? "").toString().trim();

  let body: React.ReactNode;

  if (!email) {
    body = id ? (
      <EmptyState
        icon="🔗"
        title="Enter your email to view this record"
        message="This shared link points to a specific submission. Enter the email used on the reimbursement form to view it."
      />
    ) : (
      <EmptyState
        icon="🔎"
        title="Check your reimbursement status"
        message="Enter the email you used on the reimbursement form to see your receipt and mileage submissions."
      />
    );
  } else {
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
          <Link className="btn btn-ghost" href={`/status?email=${encodeURIComponent(email)}${id ? `&id=${id}` : ""}`}>
            Retry
          </Link>
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
      <header className="mb-4">
        <h1 className="text-xl font-semibold">Reimbursement Status</h1>
        <p className="muted text-sm">Look up your receipt &amp; mileage submissions by email.</p>
      </header>
      <div className="surge-card mb-6">
        <StatusLookupForm defaultEmail={email} preserveId={id} />
      </div>
      {body}
    </div>
  );
}
