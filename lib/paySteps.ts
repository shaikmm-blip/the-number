// The step-by-step helper shown next to the IRS Direct Pay page (PayAssist in components/App.tsx).
// Field order follows the IRS "Tax Information" step as the owner's screenshot of the live form showed it on Nov 14, 2026:
// Apply Payment To, then Reason for Payment, then Tax Period for Payment. (Recorded as the owner's screenshot; the live
// IRS page was not opened by this app's tooling.) The values themselves are unchanged from the earlier verified guide.
export interface PayStep { label: string; verb: string; show: string; copy: string }

export function payAssistSteps(opts: { year: number; amountFmt: string; amountRaw: string; paycheckNote?: boolean }): PayStep[] {
  return [
    { label: "Apply Payment To", verb: "Pick the form in the 1st dropdown", show: "1040-ES", copy: "1040-ES" },
    { label: "Reason for Payment", verb: "Then pick the reason in the 2nd dropdown", show: "Estimated tax", copy: "Estimated Tax" },
    { label: "Tax Period for Payment", verb: "Pick the year in the 3rd dropdown", show: String(opts.year), copy: String(opts.year) },
    { label: "Amount", verb: opts.paycheckNote ? "Type or paste this amount — our estimate without your paycheck wages, so it can be too low" : "Type or paste this amount — it's our estimate", show: opts.amountFmt, copy: opts.amountRaw },
  ];
}
