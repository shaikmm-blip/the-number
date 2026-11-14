import type { Quarter } from "./number";

// Estimated-tax penalty, figured the way the Form 2210 Penalty Worksheet does it: for each rate period,
// unpaid amount x days late in that period / 365 x that period's rate. Simple, not compounded.
// Payments go to the earliest unpaid period first, on the date they were made; the penalty on an amount
// stops on the date it is paid or April 15 of the next year, whichever is earlier.
// Rates are the IRS underpayment rates for individuals by calendar quarter (checked Nov 13, 2026).
export const UNDERPAYMENT_RATES: { from: string; to: string; bps: number; assumed?: boolean }[] = [
  { from: "2026-01-01", to: "2026-03-31", bps: 700 },
  { from: "2026-04-01", to: "2026-06-30", bps: 600 },
  { from: "2026-07-01", to: "2026-09-30", bps: 700 },
  { from: "2026-10-01", to: "2026-12-31", bps: 700 },
  // 2027 Q1 (Jan 1 - Mar 31) and the first days of Q2 (Apr 1 - 15): not published yet; the latest rate (7%) is carried forward.
  { from: "2027-01-01", to: "2027-03-31", bps: 700, assumed: true },
  { from: "2027-04-01", to: "2027-04-15", bps: 700, assumed: true },
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

/** Penalty on `amountCents` for the days after `fromIso` through `throughIso` (capped at PENALTY_STOP), by rate period. */
function accrue(amountCents: number, fromIso: string, throughIso: string) {
  let cents = 0, assumed = false;
  if (amountCents <= 0) return { cents, assumed };
  const first = dayNum(fromIso) + 1, last = dayNum(throughIso < PENALTY_STOP ? throughIso : PENALTY_STOP);
  for (const p of UNDERPAYMENT_RATES) {
    const days = Math.min(last, dayNum(p.to)) - Math.max(first, dayNum(p.from)) + 1;
    if (days > 0) { cents += Math.round((amountCents * days * p.bps) / (365 * 10_000)); if (p.assumed) assumed = true; }
  }
  return { cents, assumed };
}

/** Estimated penalty on one amount left unpaid from its due date through `asOf`. Whole cents. */
export function latePenalty(amountCents: number, due: string, asOf: string) {
  return accrue(amountCents, due, asOf).cents;
}

export interface Period { due: string; amountCents: number }
export interface Payment { date: string; cents: number }

/** Penalty through `asOf` on every period, with dated payments applied to the earliest unpaid period first. */
export function penaltyOn(periods: Period[], payments: Payment[], asOf: string) {
  const ps = periods.map((p) => ({ ...p, left: Math.max(0, p.amountCents), applied: [] as Payment[] })).sort((a, b) => a.due.localeCompare(b.due));
  for (const pay of [...payments].filter((x) => x.cents > 0 && x.date <= asOf).sort((a, b) => a.date.localeCompare(b.date))) {
    let rest = pay.cents;
    for (const p of ps) { if (rest <= 0) break; const take = Math.min(p.left, rest); if (take > 0) { p.left -= take; rest -= take; p.applied.push({ date: pay.date, cents: take }); } }
  }
  let cents = 0, assumed = false, lateCount = 0;
  for (const p of ps) {
    if (p.due >= asOf) continue;
    let balance = p.amountCents - p.applied.filter((x) => x.date <= p.due).reduce((s, x) => s + x.cents, 0); // paid on time
    let from = p.due;
    for (const x of p.applied.filter((x) => x.date > p.due)) { const a = accrue(balance, from, x.date); cents += a.cents; assumed ||= a.assumed; balance -= x.cents; from = x.date; }
    const a = accrue(balance, from, asOf); cents += a.cents; assumed ||= a.assumed;
    if (balance > 0) lateCount++;
  }
  return { cents, assumed, lateCount };
}

const addDays = (iso: string, n: number) => new Date(Date.parse(iso + "T00:00:00Z") + n * 86_400_000).toISOString().slice(0, 10);

export interface PenaltySummary {
  soFarCents: number;
  /** What one more week adds if nothing more is paid. */
  perWeekCents: number;
  /** Periods past due with an unpaid balance today. */
  lateCount: number;
  /** Some of the figure uses the carried-forward 2027 rate, which the IRS has not published yet. */
  assumedRate?: boolean;
  /** V1: no prior-year tax, so no penalty applies. */
  exempt?: boolean;
}

/** Estimated penalty so far on each period's tax (from the engine's per-period amounts) given dated payments, and what a week adds. */
export function penaltySummary(quarters: Quarter[], payments: Payment[], today: string): PenaltySummary {
  const periods = quarters.filter((q) => q.status !== "future" && q.amountCents > 0).map((q) => ({ due: q.due, amountCents: q.amountCents }));
  const now = penaltyOn(periods, payments, today), week = penaltyOn(periods, payments, addDays(today, 7));
  return { soFarCents: now.cents, perWeekCents: week.cents - now.cents, lateCount: now.lateCount, ...(now.assumed || week.assumed ? { assumedRate: true } : {}) };
}
