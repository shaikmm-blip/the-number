import { federalEstimate, formatUSD, type FederalEstimate } from "./tax";
import { TAX_2026, TAX_YEAR } from "./taxConfig";
import { CURRENT_RATE_PCT, penaltySummary, type PenaltySummary } from "./penalty";
import type { Profile, Txn } from "./types";

const dayNum = (iso: string) => Date.parse(iso + "T00:00:00Z") / 86_400_000;

// V5: day counts use the viewer's own calendar date. toISOString() is the UTC date, a day ahead in the evening in the U.S.
export const localToday = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export const daysBetween = (fromIso: string, toIso: string) => Math.round(dayNum(toIso) - dayNum(fromIso));
/** "63 days from now", "due today" or "1 day overdue". Never a negative count. */
export function dueIn(dueIso: string, today: string) {
  const d = daysBetween(today, dueIso);
  return d > 0 ? `${d} day${d === 1 ? "" : "s"} from now` : d === 0 ? "due today" : `${-d} day${d === -1 ? "" : "s"} overdue`;
}
/** "48 days to go", "ends today" or "ended". */
export function periodLeft(endIso: string, today: string) {
  const d = daysBetween(today, endIso);
  return d > 0 ? `${d} day${d === 1 ? "" : "s"} to go` : d === 0 ? "ends today" : "ended";
}

/** V3: estimated extra federal tax on the next `stepCents` of profit. No new formula: the engine run twice, then the difference. */
export const nextProfitTaxCents = (netProfitCents: number, stepCents = 10_000) =>
  federalEstimate(netProfitCents + stepCents).totalTaxCents - federalEstimate(netProfitCents).totalTaxCents;

export interface Line { key: string; label: string; amountCents: number; why: string; txnIds?: string[] }
export interface Alert { id: string; level: "critical" | "warning" | "info"; title: string; body: string }

export interface Quarter {
  quarter: string; due: string; covers: string; start: string; end: string;
  /** Tax that belongs to this period's profit. Fixed once the period ends, live while it's running. */
  amountCents: number;
  /** What's still unpaid after estimated payments are applied oldest-first. */
  remainingCents: number;
  status: "paid" | "none" | "missed" | "locked" | "building" | "future";
}

const PERIOD_ENDS = ["03-31", "05-31", "08-31", "12-31"];

export function quarterBreakdown(txns: Txn[], asOf: string, paidCents: number): Quarter[] {
  const year = String(TAX_YEAR);
  const inYear = txns.filter((t) => t.date.startsWith(year) && t.date <= asOf);
  const profitThrough = (end: string) => inYear.filter((t) => t.date <= end).reduce((s, t) => {
    if (t.kind === "business_income" || (t.kind === "review" && t.amountCents > 0)) return s + t.amountCents;
    if (t.kind === "business_expense") return s + t.amountCents;
    return s;
  }, 0);
  let prevTax = 0, prevEnd = `${year}-01-00`, left = paidCents;
  return TAX_2026.quarterlyDueDates.map((q, i) => {
    const end = `${year}-${PERIOD_ENDS[i]}`;
    const start = i === 0 ? `${year}-01-01` : (() => { const d = new Date(Date.parse(prevEnd + "T00:00:00Z") + 86_400_000); return d.toISOString().slice(0, 10); })();
    const started = start <= asOf;
    const cumTax = started ? federalEstimate(profitThrough(end < asOf ? end : asOf)).totalTaxCents : prevTax;
    const amount = Math.max(0, cumTax - prevTax);
    prevTax = Math.max(prevTax, cumTax); prevEnd = end;
    const covered = Math.min(left, amount); left -= covered;
    const remaining = amount - covered;
    let status: Quarter["status"] = !started ? "future" : end >= asOf ? "building" : q.due < asOf ? "missed" : "locked";
    if (started && end < asOf && remaining === 0) status = amount === 0 ? "none" : "paid";
    return { quarter: q.quarter, due: q.due, covers: q.covers, start, end, amountCents: amount, remainingCents: remaining, status };
  });
}

export interface NumberResult {
  /** Last date the data covers. */
  asOf: string;
  /** The viewer's calendar date; every day count is measured from it (V5). */
  today: string;
  incomeCents: number;
  expensesCents: number;
  netProfitCents: number;
  reviewCount: number;
  fed: FederalEstimate;
  taxPaidCents: number;
  owedSoFarCents: number;
  cushionCents: number;
  billsCents: number;
  theNumberCents: number;
  balanceCents: number;
  safeToSpendCents: number;
  saveThisMonthCents: number;
  next: { quarter: string; due: string; daysLeft: number; amountCents: number };
  missed: { quarter: string; due: string }[];
  lines: Line[];
  monthly: { month: string; incomeCents: number; expensesCents: number }[];
  topCategories: { category: string; amountCents: number }[];
  alerts: Alert[];
  quarters: Quarter[];
  /** V4: estimated late-payment penalty on the late, unpaid periods (Form 2210 method). */
  penalty: PenaltySummary;
}

export function computeNumber(txns: Txn[], profile: Profile, today = profile.asOf): NumberResult {
  const asOf = profile.asOf;
  const inYear = txns.filter((t) => t.date.startsWith(String(TAX_YEAR)) && t.date <= asOf);
  const incomeTx = inYear.filter((t) => t.kind === "business_income" || (t.kind === "review" && t.amountCents > 0));
  const expenseTx = inYear.filter((t) => t.kind === "business_expense");
  const taxTx = inYear.filter((t) => t.kind === "tax_payment");
  const income = incomeTx.reduce((s, t) => s + t.amountCents, 0);
  const expenses = expenseTx.reduce((s, t) => s - t.amountCents, 0);
  const net = income - expenses;
  const fed = federalEstimate(net);
  const paid = taxTx.reduce((s, t) => s - t.amountCents, 0);
  const owed = Math.max(0, fed.totalTaxCents - paid);

  // One month of business costs = average monthly business spending so far this year.
  const daysElapsed = dayNum(asOf) - dayNum("2026-01-01") + 1;
  const monthsElapsed = daysElapsed / (365 / 12);
  const cushion = monthsElapsed > 0 ? Math.round(expenses / monthsElapsed) : 0;

  // Bills due in the next 45 days.
  const billsSoon = profile.bills.filter((b) => dayNum(b.due) >= dayNum(asOf) && dayNum(b.due) - dayNum(asOf) <= 45);
  const bills = billsSoon.reduce((s, b) => s + b.amountCents, 0);

  const theNumber = owed + cushion + bills;
  const balance = profile.balances.reduce((s, b) => s + b.balanceCents, 0);
  const safe = balance - theNumber;

  const upcoming = TAX_2026.quarterlyDueDates.find((q) => q.due >= today) ?? TAX_2026.quarterlyDueDates[3];
  const missed = paid === 0 ? TAX_2026.quarterlyDueDates.filter((q) => q.due < asOf).map((q) => ({ quarter: q.quarter, due: q.due })) : [];
  const daysLeft = daysBetween(today, upcoming.due); // negative once the last due date has passed; shown through dueIn()
  const monthsToDue = Math.max(1, Math.ceil(daysLeft / 30));
  const saveThisMonth = Math.round(owed / monthsToDue);

  const reviewCount = inYear.filter((t) => t.kind === "review").length;
  const seWhy = fed.se.belowThreshold
    ? `Good news — you've made under $400 in profit, so this estimate has no self-employment tax yet.`
    : `This is the big one nobody warns you about. At a regular job, your boss quietly covers half of your Social Security and Medicare. Working for yourself, you pay both halves — a little over 14 cents on every dollar of profit. On your ${formatUSD(net)} profit, that's ${formatUSD(fed.se.totalCents)}. It kicks in once you make $400, at any age.`;
  const itWhy = fed.taxableIncomeCents === 0
    ? `Your write-offs cover all of your profit, so there's no income tax to pay here.`
    : `This is regular income tax — but you don't pay it on everything. Normal write-offs (a ${formatUSD(fed.standardDeductionCents)} standard deduction everyone gets${fed.qbiDeductionCents ? `, plus a 20% small-business discount` : ""}) bring your profit down to about ${formatUSD(fed.taxableIncomeCents)}. Only that part gets taxed, starting at just 10%. That comes to ${formatUSD(fed.incomeTaxCents)}.`;

  const lines: Line[] = [
    { key: "se", label: "Self-employment tax", amountCents: fed.se.totalCents, why: seWhy },
    { key: "income", label: "Federal income tax", amountCents: fed.incomeTaxCents, why: itWhy },
    ...(paid > 0 ? [{ key: "paid", label: "Already paid to the IRS", amountCents: -paid, why: `You've sent ${formatUSD(paid)} in estimated payments this year. That comes off what you owe.`, txnIds: taxTx.map((t) => t.id) }] : []),
    { key: "cushion", label: "One month of business costs", amountCents: cushion, why: `You spend about ${formatUSD(cushion)} a month on the business (fuel, chemicals, insurance, phone). Keeping one month on hand means a slow month or a broken pump doesn't put you in a hole.`, txnIds: expenseTx.map((t) => t.id) },
    ...billsSoon.map((b) => ({ key: `bill-${b.name}`, label: `${b.name} (due ${b.due.slice(5).replace("-", "/")})`, amountCents: b.amountCents, why: `${b.name} is due ${b.due}. It's coming either way, so it's not money you can spend.` })),
  ];

  const months = Array.from({ length: Number(asOf.slice(5, 7)) }, (_, i) => `2026-${String(i + 1).padStart(2, "0")}`);
  const monthly = months.map((m) => ({
    month: m,
    incomeCents: incomeTx.filter((t) => t.date.startsWith(m)).reduce((s, t) => s + t.amountCents, 0),
    expensesCents: expenseTx.filter((t) => t.date.startsWith(m)).reduce((s, t) => s - t.amountCents, 0),
  }));
  const catMap = new Map<string, number>();
  for (const t of expenseTx) catMap.set(t.category || "Other", (catMap.get(t.category || "Other") || 0) - t.amountCents);
  const topCategories = [...catMap.entries()].map(([category, amountCents]) => ({ category, amountCents })).sort((a, b) => b.amountCents - a.amountCents);

  const quarters = quarterBreakdown(txns, asOf, paid);
  const missedQ = quarters.filter((q) => q.status === "missed" && q.remainingCents > 0);
  const building = quarters.find((q) => q.status === "building");
  const penalty = penaltySummary(quarters, today);
  const alerts: Alert[] = [];
  if (safe < 0) alerts.push({ id: "below", level: "critical", title: `You're ${formatUSD(-safe)} below your Number`, body: `You have ${formatUSD(balance)} across your accounts, but ${formatUSD(theNumber)} of it is already spoken for. Hold off on big purchases until you're back above it.` });
  if (missedQ.length) alerts.push({ id: "missed", level: "warning", title: `${missedQ.length} estimated tax payment${missedQ.length > 1 ? "s" : ""} missed: ${formatUSD(missedQ.reduce((s, q) => s + q.remainingCents, 0))}`, body: `Estimated ${missedQ.map((q) => `${formatUSD(q.remainingCents)} for the period due ${q.due}`).join(", ")}. Those periods have ended. The IRS adds a penalty for each day a payment is late: an estimated ${formatUSD(penalty.soFarCents, { cents: true })} so far, growing about ${formatUSD(penalty.perWeekCents, { cents: true })} a week at its ${CURRENT_RATE_PCT}% underpayment rate. Paying at irs.gov/payments stops it growing.` });
  if (building) alerts.push({ id: "next", level: "info", title: `Estimated payment for this period: ${formatUSD(building.remainingCents)}, due ${building.due} (${dueIn(building.due, today)})`, body: building.due < today ? `Its due date has passed. It covers ${building.covers}.` : `This one is still open. It covers ${building.covers}, and it changes as income, costs and payments come in until the period ends.` });
  if (reviewCount) alerts.push({ id: "review", level: "info", title: `${reviewCount} payments need a quick answer`, body: `Tell us business or personal. Payment apps expect business money on a business profile, so sorting these keeps you legit.` });
  if (profile.parentRule && owed > profile.parentRule.amountCents) alerts.push({ id: "rule", level: "warning", title: `${profile.parentRule.label} is wrong`, body: `You're under the limit for income tax, but you still owe an estimated ${formatUSD(owed)}, mostly self-employment tax. It starts at $400 of profit, at any age.` });

  return {
    asOf, today, incomeCents: income, expensesCents: expenses, netProfitCents: net, reviewCount, fed,
    taxPaidCents: paid, owedSoFarCents: owed, cushionCents: cushion, billsCents: bills, theNumberCents: theNumber,
    balanceCents: balance, safeToSpendCents: safe, saveThisMonthCents: saveThisMonth,
    next: { quarter: upcoming.quarter, due: upcoming.due, daysLeft, amountCents: owed }, missed,
    lines, monthly, topCategories, alerts, quarters, penalty,
  };
}
