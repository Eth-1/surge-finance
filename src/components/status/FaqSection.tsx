/** Collapsible FAQ shown at the bottom of /status. Native <details> (accessible). */

const FAQS: { q: string; a: React.ReactNode }[] = [
  {
    q: "What does each status mean?",
    a: (
      <ul className="space-y-1">
        <li><strong>Pending / Coordinator Approved / Director Approved</strong> — under review by the finance team.</li>
        <li><strong>Fully Approved / Approved</strong> — approved and being prepared for reimbursement.</li>
        <li><strong>CR Submitted / Awaiting Payment</strong> — a cheque requisition is filed with the SFSS; awaiting their payment.</li>
        <li><strong>Action Required</strong> — the SFSS asked for more info; the finance team is handling it.</li>
        <li><strong>Payment Received</strong> — the SFSS paid the club; your e-transfer is on its way.</li>
        <li><strong>Reimbursed</strong> — done, you&rsquo;ve been paid. 🎉</li>
        <li><strong>Rejected / Cancelled</strong> — not approved (see the reason on your card).</li>
      </ul>
    ),
  },
  {
    q: "How long does the reimbursement process take?",
    a: (
      <p>
        After your receipt is approved, we submit a cheque requisition to the SFSS. Processing typically
        takes <strong>3–6 weeks</strong> depending on SFSS workload. You&rsquo;ll receive your reimbursement
        via Interac e-Transfer.
      </p>
    ),
  },
  {
    q: "Can I submit multiple receipts at once?",
    a: (
      <p>
        Submit <strong>one form per receipt/transaction</strong>. Each is tracked separately and may be
        grouped into the same cheque requisition if they&rsquo;re for the same event.
      </p>
    ),
  },
  {
    q: "I can't find my submission. What should I do?",
    a: (
      <p>
        Make sure you&rsquo;re entering the <strong>same Interac e-Transfer email</strong> you used on the
        receipt form. If you still can&rsquo;t find it, contact the finance team — your submission may be
        under a different email.
      </p>
    ),
  },
  {
    q: "My submission was rejected. Why?",
    a: (
      <p>
        Receipts may be rejected if they&rsquo;re missing key info, the purchase wasn&rsquo;t pre-approved, or
        the receipt is unclear/illegible. Contact the finance team for specifics and to discuss resubmission.
      </p>
    ),
  },
];

export function FaqSection() {
  return (
    <section className="mt-8">
      <h2 className="section-title mb-3">Frequently asked questions</h2>
      <div className="space-y-2">
        {FAQS.map((f, i) => (
          <details key={i} className="surge-card group cursor-pointer py-3">
            <summary className="flex list-none items-center justify-between gap-2 font-medium text-text marker:hidden">
              <span>{f.q}</span>
              <span className="text-text-muted transition-transform duration-200 group-open:rotate-90">▸</span>
            </summary>
            <div className="muted mt-2 text-sm leading-relaxed">{f.a}</div>
          </details>
        ))}
      </div>
    </section>
  );
}
