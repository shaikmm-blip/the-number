// "Where these numbers go": a guide from the app's estimate to the IRS forms. It guides; the owner fills in and files.
// Every form name and line reference below was checked on Nov 12, 2026 (see .polish/receipts/sources-checked.md).
// Where a line number for tax year 2026 could not be confirmed (Form 1040 itself), the form and concept are named without one.
import type { NumberResult } from "./number";
import { formatUSD } from "./tax";
import { TAX_YEAR } from "./taxConfig";

export const GUIDE_CHECKED = "November 12, 2026";
export const GUIDE_SOURCES = {
  form1040ES: { title: "IRS: About Form 1040-ES, Estimated Tax for Individuals", url: "https://www.irs.gov/forms-pubs/about-form-1040-es" },
  directPayTypes: { title: "IRS: Types of payments available to individuals through Direct Pay", url: "https://www.irs.gov/payments/types-of-payments-available-to-individuals-through-direct-pay" },
  directPayHelp: { title: "IRS: Direct Pay help", url: "https://www.irs.gov/payments/direct-pay-help" },
  scheduleC: { title: "IRS: About Schedule C (Form 1040), Profit or Loss from Business", url: "https://www.irs.gov/forms-pubs/about-schedule-c-form-1040" },
  scheduleSE: { title: "IRS: About Schedule SE (Form 1040), Self-Employment Tax", url: "https://www.irs.gov/forms-pubs/about-schedule-se-form-1040" },
  form1040: { title: "IRS: About Form 1040, U.S. Individual Income Tax Return", url: "https://www.irs.gov/forms-pubs/about-form-1040" },
} as const;
export type GuideSource = keyof typeof GUIDE_SOURCES;

export interface GuideRow { id: string; label: string; cents?: number; value?: string; where: string; source: GuideSource }
export interface GuideSection { title: string; intro: string; rows: GuideRow[] }

export function formGuide(r: NumberResult): GuideSection[] {
  const f = r.fed;
  return [
    {
      title: `During the year: Form 1040-ES (estimated tax)`,
      intro: `Form 1040-ES is how you figure and pay estimated tax during ${TAX_YEAR}. Paying online with IRS Direct Pay, these are the choices the IRS lists for an estimated tax payment.`,
      rows: [
        { id: "pay", label: "Your estimated tax payment", cents: r.owedSoFarCents, where: "The amount you choose to pay with Form 1040-ES. This is our estimate; you decide what to pay.", source: "form1040ES" },
        { id: "reason", label: "Reason for payment", value: "Estimated tax", where: "Direct Pay, first choice on the tax information step", source: "directPayTypes" },
        { id: "apply", label: "Apply payment to", value: "1040-ES", where: "Direct Pay, after the reason", source: "directPayTypes" },
        { id: "period", label: "Tax period", value: String(TAX_YEAR), where: "Direct Pay, the tax year the payment is for", source: "directPayTypes" },
        { id: "due", label: "Next due date", value: r.next.due, where: `Form 1040-ES (${TAX_YEAR}), payment due dates`, source: "form1040ES" },
        { id: "id-check", label: "Before you start", value: "A past year's return", where: "Direct Pay checks who you are with a prior-year return. If you have never filed, it can't be used; irs.gov/payments lists other ways to pay.", source: "directPayHelp" },
      ],
    },
    {
      title: `At filing time: Form 1040 for ${TAX_YEAR} (the annual return)`,
      intro: `After ${TAX_YEAR} ends, the annual return reports the year. For a sole proprietor that means Form 1040 with Schedule C and Schedule SE. Your final numbers may differ from this estimate.`,
      rows: [
        { id: "profit", label: "Business profit", cents: f.netProfitCents, where: "Schedule C (Form 1040), line 31, net profit or (loss); it also goes on Schedule 1, line 3 and Schedule SE, line 2", source: "scheduleC" },
        { id: "se-base", label: "Earnings counted for self-employment tax", cents: f.se.netEarningsCents, where: "Schedule SE, line 4a (profit × 92.35%; this estimate shows $0 when there is no profit)", source: "scheduleSE" },
        { id: "se", label: "Self-employment tax", cents: f.se.totalCents, where: "Schedule SE, line 12; it goes on Schedule 2 (Form 1040), line 4", source: "scheduleSE" },
        { id: "half-se", label: "Deduction for half of self-employment tax", cents: f.halfSeDeductionCents, where: "Schedule SE, line 13; it goes on Schedule 1 (Form 1040), line 15", source: "scheduleSE" },
        { id: "std", label: "Standard deduction used in this estimate", cents: Math.min(f.standardDeductionCents, f.agiCents), where: `Form 1040, standard deduction (line number for ${TAX_YEAR} not confirmed yet). The single-filer amount is ${formatUSD(f.standardDeductionCents)}; this estimate uses only up to the income left`, source: "form1040" },
        { id: "qbi", label: "Qualified business income deduction", cents: f.qbiDeductionCents, where: `Form 1040, qualified business income deduction (line number for ${TAX_YEAR} not confirmed yet). This estimate's limit of 20% of taxable income before the QBI deduction is not yet checked against an IRS source`, source: "form1040" },
        { id: "taxable", label: "Taxable income", cents: f.taxableIncomeCents, where: `Form 1040, taxable income (line number for ${TAX_YEAR} not confirmed yet)`, source: "form1040" },
        { id: "paid", label: "Estimated payments made", cents: r.taxPaidCents, where: `Form 1040, estimated tax payments (line number for ${TAX_YEAR} not confirmed yet)`, source: "form1040" },
      ],
    },
  ];
}
