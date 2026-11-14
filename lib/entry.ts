import type { Kind, Txn } from "./types";
import { toCents } from "./tax";

export interface Entry { amountCents: number; kind: Extract<Kind, "business_income" | "business_expense" | "personal">; description: string; direction: "in" | "out" }

// Money going out: any spending word.
const OUT = /\b(spent|spend|spending|bought|buy|buying|purchased?|paid for|pay for|paid (?:my|the|a|an)|cost|costs|ordered|expense|bill|fee|fees|withdrew|withdrawal|lost|gave|sent|rent|subscription|refunded (?:a|the) customer)\b/i;
// Money coming in: any earning word.
const IN = /\b(earned|earn|made|make|received|receive|got paid|got|get paid|paid me|customer paid|client paid|sold|sale|tip|tips|gained|income|revenue|charged|invoiced|deposit|deposited|collected|brought in|job|gig|booked|paid by)\b/i;
// Words that make a cost a business cost (so it lowers your taxes).
const BIZ = /\b(gas|fuel|supplies|supply|chemicals?|soap|bleach|degreaser|gear|equipment|tools?|hose|nozzle|wand|pump|surface cleaner|ladder|insurance|phone bill|ads?|advertising|flyers?|marketing|repairs?|parts|trailer|mower|blower|trimmer|business|for work|for the business|software|website|domain|uniform|license|permit|mileage|oil change)\b/i;
// Words that sound like a job, for entries with no verb ("350 house wash").
const JOBISH = /\b(wash|washing|mow|mowing|lawn|detail|detailing|clean|cleaning|tutor|tutoring|lesson|haircut|shoot|commission|delivery|install|repair job|customer|client)\b/i;

/** Parses plain sentences like "earned $350 washing a house", "spent 180 on sneakers", "+120 tip", "-45 gas". */
export function parseEntry(text: string): Entry | { error: string } {
  const t = text.trim();
  const m = t.match(/([+-])?\s*\$?\s*(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?\s*(k)?\b/i);
  if (!m) return { error: "Add an amount, like \"earned $350 on a house wash\"." };
  let amountCents = Number(m[2].replace(/,/g, "")) * 100 + (m[3] ? Number(m[3].padEnd(2, "0")) : 0);
  if (m[4]) amountCents *= 1000;
  if (amountCents <= 0) return { error: "The amount has to be more than $0." };
  if (amountCents > 5_000_000) return { error: "That's over $50,000. Double-check the amount." };

  let direction: "in" | "out" | null = m[1] === "-" ? "out" : m[1] === "+" ? "in" : null;
  if (!direction) {
    const out = OUT.test(t), inn = IN.test(t);
    direction = out && !/\b(paid me|customer paid|client paid|got paid|paid by)\b/i.test(t) ? "out" : inn ? "in" : out ? "out" : null;
  }
  if (!direction) direction = BIZ.test(t) ? "out" : JOBISH.test(t) ? "in" : null;
  if (!direction) return { error: "Did money come in or go out? Try \"earned $350…\" or \"spent $180…\"." };

  const what = (t.match(/\b(?:for|on|at|from|washing|mowing|cleaning|detailing)\s+(?:a |an |the |some |my )?(.+)$/i)?.[1] || t.replace(m[0], "").replace(IN, "").replace(OUT, ""))
    .replace(/[.!]+$/, "").replace(/\s+/g, " ").trim().slice(0, 40) || (direction === "in" ? "customer payment" : "purchase");
  const kind = direction === "in" ? "business_income" : BIZ.test(t) ? "business_expense" : "personal";
  return { amountCents, kind, description: what, direction };
}

/* ---------- V7: "just type in what I made" ---------- */

export const TYPED_SOURCE = "Typed in by you";
export const isTypedTotal = (t: Txn) => t.source === TYPED_SOURCE;
export type TypedTotals = { incomeCents: number; costsCents: number; paidCents: number };

/** A dollar amount typed into a box, as whole cents. Empty is 0 only for optional boxes. */
export function parseTypedAmount(raw: string, label: string, optional = false): number | { error: string } {
  const s = raw.trim().replace(/[$,\s]/g, "");
  const name = label[0].toUpperCase() + label.slice(1);
  if (!s) return optional ? 0 : { error: `Enter your ${label}, like 18,500 or 18500.00. Enter 0 if there was none.` };
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return { error: `${name} should be a dollar amount like 18,500 or 18500.00, with no minus sign.` };
  const cents = toCents(s);
  if (cents > 1_000_000_000) return { error: `${name} is over $10,000,000. Check the amount.` };
  return cents;
}

/** Year-to-date totals as engine rows, dated on the last day they cover. They are totals, not dated transactions. */
export function typedTotalsTxns(t: TypedTotals, date: string): Txn[] {
  const base = { date, source: TYPED_SOURCE, reason: "Typed in by you: a total for the year so far, not a dated transaction." };
  const rows: Txn[] = [];
  if (t.incomeCents > 0) rows.push({ ...base, id: "typed-income", description: "Income so far this year (typed total)", amountCents: t.incomeCents, kind: "business_income", category: "Typed-in income" });
  if (t.costsCents > 0) rows.push({ ...base, id: "typed-costs", description: "Business costs so far this year (typed total)", amountCents: -t.costsCents, kind: "business_expense", category: "Typed-in business costs" });
  if (t.paidCents > 0) rows.push({ ...base, id: "typed-paid", description: "Estimated tax already paid this year (typed total)", amountCents: -t.paidCents, kind: "tax_payment", category: "Tax payment" });
  return rows;
}
