/**
 * Public Google Form links shown on /status. Override at deploy time with
 * NEXT_PUBLIC_RECEIPT_FORM_URL / NEXT_PUBLIC_MILEAGE_FORM_URL; otherwise these
 * defaults are used. (NEXT_PUBLIC_* is safe to expose — these are public forms.)
 */
export const RECEIPT_FORM_URL =
  process.env.NEXT_PUBLIC_RECEIPT_FORM_URL || "https://forms.gle/Ms4xoWQFZZ3i22Fx5";

export const MILEAGE_FORM_URL =
  process.env.NEXT_PUBLIC_MILEAGE_FORM_URL || "https://forms.gle/VGFQYH5YXo1XVmUE7";
