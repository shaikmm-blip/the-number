import type { Quarter } from "./number";

// Estimated-tax penalty, figured the way the Form 2210 Penalty Worksheet does it: for each rate period,
// late amount x days late in that period / 365 x that period's rate. Simple, not compounded.
// The penalty stops on the date the amount is paid or April 15 of the next year, whichever is earlier.
// Rates are the IRS underpayment rates for individuals by calendar quarter (checked Nov 13, 2026).
export const UNDERPAYMENT_RATES: { from: string; to: string; bps: number; assumed?: boolean }[] = [
  { from: "2026-01-01", to: "2026-03-31", bps: 700 },
  { from: "2026-04-01", to: "2026-06-30", bps: 600 },
  { from: "2026-07-01", to: "2026-09-30", bps: 700 },
  { from: "2026-10-01", to: "2026-12-31", bps: 700 },
  // Jan 1 - Apr 15, 2027: not published yet; the latest rate (7%) is carried forward.
  { from: "2027-01-01", to: "2027-04-15", bps: 700, assumed: true },
];
/** For tax year 2026, the penalty is figured no later than April 15, 2027. */
export const PENALTY_STOP = "2027-04-15";
export const CURRENT_RATE_PCT = 7;
export const PENALTY_SOURCES = {
  method: { title: "IRS: Instructions for Form 2210", url: "https://www.irs.gov/instructions/i2210" },
  rates: { title: "IRS: Quarterly interest rates", url: "https://www.irs.gov/payments/quarterly-interest-rates" },
  // V1: the no-prior-year-tax exception.
  exception: { title: "IRS: Estimated tax penalty questions", url: "https://www.irs.gov/faqs/estimated-tax/penalty-questions/penalty-questions" },
};

const dayNum = (iso: string) => Math.round(Date.parse(iso + "T00:00:00Z") / 86_400_000);

/** Estimated penalty on one late amount, from the day after its due date through `asOf` (capped at PENALTY_STOP). Whole cents. */
export function latePenalty(amountCents: number, due: string, asOf: string) {
  if (amountCents <= 0) return 0;
  const last = dayNum(asOf < PENALTY_STOP ? asOf : PENALTY_STOP);
  const first = dayNum(due) + 1; // the first day late
  let total = 0;
  for (const p of UNDERPAYMENT_RATES) {
    const days = Math.min(last, dayNum(p.to)) - Math.max(first, dayNum(p.from)) + 1;
    if (days > 0) total += Math.round((amountCents * days * p.bps) / (365 * 10_000));
  }
  return total;
}

const addDays = (iso: string, n: number) => new Date(Date.parse(iso + "T00:00:00Z") + n * 86_400_000).toISOString().slice(0, 10);

export interface PenaltySummary { soFarCents: number; perWeekCents: number; lateCount: number; /** V1: no prior-year tax, so no penalty applies */ exempt?: boolean }

/** Estimated penalty so far on every late, unpaid period, and what one more week adds if nothing is paid. */
export function penaltySummary(quarters: Quarter[], today: string): PenaltySummary {
  const late = quarters.filter((q) => q.status === "missed" && q.remainingCents > 0 && q.due < today);
  const soFar = late.reduce((s, q) => s + latePenalty(q.remainingCents, q.due, today), 0);
  const inAWeek = late.reduce((s, q) => s + latePenalty(q.remainingCents, q.due, addDays(today, 7)), 0);
  return { soFarCents: soFar, perWeekCents: inAWeek - soFar, lateCount: late.length };
}
