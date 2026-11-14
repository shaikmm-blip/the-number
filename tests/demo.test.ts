import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { classify } from "../lib/classify";
import { normalize } from "../lib/csv";
import { DEMO_PROFILE } from "../lib/demo";
import { computeNumber, quarterBreakdown } from "../lib/number";
import { federalEstimate } from "../lib/tax";

const load = () =>
  ["chase", "cashapp", "venmo"].flatMap((f) => normalize(readFileSync(`public/demo/${f}.csv`, "utf8"), `${f}.csv`)).map(classify);

describe("demo dataset", () => {
  const txns = load();
  const r = computeNumber(txns, DEMO_PROFILE);

  it("reconciles: the Number equals the sum of its lines", () => {
    expect(r.lines.reduce((s, l) => s + l.amountCents, 0)).toBe(r.theNumberCents);
    expect(r.theNumberCents).toBe(r.owedSoFarCents + r.cushionCents + r.billsCents);
  });
  it("reconciles: income and expenses sum from the tagged transactions", () => {
    const inc = txns.filter((t) => t.date <= r.asOf && (t.kind === "business_income" || (t.kind === "review" && t.amountCents > 0))).reduce((s, t) => s + t.amountCents, 0);
    expect(inc).toBe(r.incomeCents);
    expect(r.fed.totalTaxCents).toBe(federalEstimate(r.netProfitCents).totalTaxCents);
  });
  it("transfers between your own accounts are not income", () => {
    expect(txns.filter((t) => /cash out/i.test(t.description)).every((t) => t.kind === "transfer")).toBe(true);
  });
  it("demo story holds: $0 income tax but real self-employment tax, and below the Number", () => {
    console.log(JSON.stringify({ income: r.incomeCents, expenses: r.expensesCents, net: r.netProfitCents, se: r.fed.se.totalCents, incomeTax: r.fed.incomeTaxCents, owed: r.owedSoFarCents, cushion: r.cushionCents, bills: r.billsCents, number: r.theNumberCents, balance: r.balanceCents, safe: r.safeToSpendCents, review: r.reviewCount }));
    expect(r.fed.incomeTaxCents).toBe(0);
    expect(r.fed.se.totalCents).toBeGreaterThan(0);
    expect(r.incomeCents).toBeGreaterThan(1_000_000); // $10K–$20K range
    expect(r.incomeCents).toBeLessThan(2_000_000);
    expect(r.safeToSpendCents).toBeLessThan(0);
  });
});

describe("bad input", () => {
  it("explains an unreadable file", () => {
    expect(() => normalize("foo,bar\n1,2", "weird.csv")).toThrow(/couldn't read/);
  });
  it("explains an empty file", () => {
    expect(() => normalize("Posting Date,Description,Amount\n", "empty.csv")).toThrow(/no transactions/);
  });
});

describe("IRS payment periods", () => {
  it("locked past periods + the live period add up to what you owe", () => {
    const result = computeNumber(load(), DEMO_PROFILE);
    const q = result.quarters;
    const started = q.filter((x) => x.status !== "future");
    expect(started.reduce((s, x) => s + x.remainingCents, 0)).toBe(result.owedSoFarCents);
    expect(q.filter((x) => x.status === "missed").map((x) => x.quarter)).toEqual(["Q2", "Q3"]);
    expect(q[0].status).toBe("none"); // Jan–Mar profit is under the $400 self-employment threshold
    expect(q.find((x) => x.status === "building")?.quarter).toBe("Q4");
  });
  it("a closed period's amount doesn't change when new money comes in", () => {
    const txns = load(); const result = computeNumber(txns, DEMO_PROFILE);
    const after = quarterBreakdown([...txns, { id: "x", date: result.asOf, source: "Cash App", description: "job", amountCents: 50000, kind: "business_income" as const, reason: "" }], result.asOf, 0);
    expect(after[2].amountCents).toBe(result.quarters[2].amountCents);
    expect(after[3].amountCents).toBeGreaterThan(result.quarters[3].amountCents);
  });
});

import { scaleBusiness } from "../lib/scale";
describe("randomized sample business", () => {
  it("keeps what's owed between $2,000 and $99,999 at both ends of the range, and income tax kicks in when bigger", () => {
    for (const f of [1.2, 4]) {
      const r = computeNumber(scaleBusiness(load(), f), DEMO_PROFILE);
      expect(r.owedSoFarCents).toBeGreaterThan(200_000);
      expect(r.owedSoFarCents).toBeLessThan(9_999_900);
      if (f === 4) expect(r.fed.incomeTaxCents).toBeGreaterThan(0); // not a flat rate: brackets apply
    }
  });
});

import { daysBetween, dueIn, localToday, periodLeft } from "../lib/number";
import { DEMO_FACTOR } from "../lib/scale";
describe("V5: day counts use the viewer's real date", () => {
  const sample = () => computeNumber(scaleBusiness(load(), DEMO_FACTOR), DEMO_PROFILE, "2026-11-13");
  it("on Nov 13, 2026: 63 days to Jan 15 and 48 to Dec 31; the sample headline is unchanged", () => {
    const r = sample();
    expect(r.today).toBe("2026-11-13");
    expect(r.asOf).toBe("2026-11-06"); // the sample's data date stays pinned
    expect(r.next.due).toBe("2027-01-15");
    expect(r.next.daysLeft).toBe(63);
    expect(dueIn(r.next.due, r.today)).toBe("63 days from now");
    expect(daysBetween(r.today, "2026-12-31")).toBe(48);
    expect(periodLeft("2026-12-31", r.today)).toBe("48 days to go");
    expect(r.owedSoFarCents).toBe(528_102);
    expect(computeNumber(scaleBusiness(load(), DEMO_FACTOR), DEMO_PROFILE).owedSoFarCents).toBe(528_102);
  });
  it("Jan 15, 2027 reads as due today and Jan 16 as overdue, never as negative days", () => {
    expect(dueIn("2027-01-15", "2027-01-15")).toBe("due today");
    expect(dueIn("2027-01-15", "2027-01-16")).toBe("1 day overdue");
    expect(dueIn("2027-01-15", "2027-01-20")).toBe("5 days overdue");
    expect(dueIn("2027-01-15", "2027-01-14")).toBe("1 day from now");
    const r = computeNumber(scaleBusiness(load(), DEMO_FACTOR), DEMO_PROFILE, "2027-01-16");
    expect(r.next.daysLeft).toBe(-1);
    expect(r.alerts.map((a) => a.title + a.body).join(" ")).not.toMatch(/-\d+ days/);
    expect(periodLeft("2026-12-31", "2027-01-16")).toBe("ended");
    const next = r.alerts.find((a) => a.id === "next")!;
    expect(next.title).toContain("1 day overdue");
    expect(next.body).not.toMatch(/still open/); // an overdue period is not described as open
    const onTime = computeNumber(scaleBusiness(load(), DEMO_FACTOR), DEMO_PROFILE, "2026-11-13").alerts.find((a) => a.id === "next")!;
    expect(onTime.body).toMatch(/still open/);
    // Jan 1-15, 2027: the period ended Dec 31 but its payment isn't due yet
    const jan1 = computeNumber(scaleBusiness(load(), DEMO_FACTOR), DEMO_PROFILE, "2027-01-01").alerts.find((a) => a.id === "next")!;
    expect(jan1.body).not.toMatch(/still open/);
    expect(jan1.body).toMatch(/has ended; its payment is due 2027-01-15/);
    expect(jan1.title).toContain("14 days from now");
  });
  it("uses the local calendar date, not the UTC date", () => {
    expect(localToday(new Date(2026, 10, 13, 23, 30))).toBe("2026-11-13"); // 11:30 pm local is already Nov 14 in UTC for the Americas
    expect(localToday(new Date(2026, 0, 1, 0, 5))).toBe("2026-01-01");
  });
});

import { nextProfitTaxCents } from "../lib/number";
import { toCents } from "../lib/tax";
describe("V3: what the next $100 of profit adds", () => {
  it("equals engine(profit + $100) minus engine(profit) for the sample", () => {
    const r = computeNumber(scaleBusiness(load(), DEMO_FACTOR), DEMO_PROFILE, "2026-11-13");
    const p = r.netProfitCents;
    expect(nextProfitTaxCents(p)).toBe(federalEstimate(p + 10_000).totalTaxCents - federalEstimate(p).totalTaxCents);
    // the next $100 costs more than the average $100 for the sample (self-employment tax plus the 10% bracket on what's left after half-SE and QBI)
    expect(nextProfitTaxCents(p)).toBeGreaterThan(Math.round((r.fed.totalTaxCents / p) * 10_000));
  });
  it("hand-checked for a $10,000 profit (under the standard deduction): self-employment tax only, $14.12", () => {
    // $10,000: SE earnings 9,235.00 -> SS 1,145.14, Medicare 267.82 (267.815 rounds up). $10,100: 9,327.35 -> SS 1,156.59, Medicare 270.49.
    // Difference: 11.45 + 2.67 = 14.12. AGI stays under the $16,100 standard deduction both times, so no income tax.
    const p = toCents("10000");
    expect(nextProfitTaxCents(p)).toBe(federalEstimate(p + 10_000).totalTaxCents - federalEstimate(p).totalTaxCents);
    expect(nextProfitTaxCents(p)).toBe(1_412);
  });
});

describe("V1: did last year's return show any total tax?", () => {
  const txns = () => scaleBusiness(load(), DEMO_FACTOR);
  it("sample answers yes: late periods, the missed-payment alert and the penalty stay as before", () => {
    const r = computeNumber(txns(), DEMO_PROFILE, "2026-11-13");
    expect(r.priorYear).toBe("yes");
    expect(r.owedSoFarCents).toBe(528_102);
    expect(r.penalty.soFarCents).toBe(5_996);
    expect(r.penalty.exempt).toBeUndefined();
    expect(r.alerts.some((a) => a.id === "missed")).toBe(true);
    expect(r.missed.map((m) => m.quarter)).toEqual(["Q1", "Q2", "Q3"]);
  });
  it("no prior-year tax: same estimate, no late periods called penalties, $0 penalty, payments not required", () => {
    const r = computeNumber(txns(), { ...DEMO_PROFILE, priorYearTax: "no" }, "2026-11-13");
    expect(r.priorYear).toBe("no");
    expect(r.owedSoFarCents).toBe(528_102); // what is owed doesn't change, only whether it is late
    expect(r.penalty).toEqual({ soFarCents: 0, perWeekCents: 0, lateCount: 0, exempt: true });
    expect(r.alerts.some((a) => a.id === "missed")).toBe(false);
    expect(r.missed).toEqual([]);
    const prior = r.alerts.find((a) => a.id === "prior")!;
    expect(prior.title).toMatch(/aren't required/);
    expect(prior.body).toMatch(/due with your 2026 return/);
    expect(prior.body).toMatch(/optional/);
  });
  it("not answered: today's behavior (penalty shown), flagged as unknown", () => {
    const r = computeNumber(txns(), { ...DEMO_PROFILE, priorYearTax: undefined }, "2026-11-13");
    expect(r.priorYear).toBe("unknown");
    expect(r.penalty.soFarCents).toBe(5_996);
    expect(r.alerts.some((a) => a.id === "prior")).toBe(false);
  });
});
