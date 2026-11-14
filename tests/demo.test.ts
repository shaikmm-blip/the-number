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
import { latePenalty } from "../lib/penalty";
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
    expect(next.body).not.toMatch(/changes as money comes in/); // an overdue period is not described as open
    expect(next.body).toMatch(/^Its due date has passed/);
    const onTime = computeNumber(scaleBusiness(load(), DEMO_FACTOR), DEMO_PROFILE, "2026-11-13").alerts.find((a) => a.id === "next")!;
    expect(onTime.body).toMatch(/changes as money comes in until the period ends/);
    // Jan 1-15, 2027: the period ended Dec 31 but its payment isn't due yet
    const jan1 = computeNumber(scaleBusiness(load(), DEMO_FACTOR), DEMO_PROFILE, "2027-01-01").alerts.find((a) => a.id === "next")!;
    expect(jan1.body).not.toMatch(/changes as money comes in/);
    expect(jan1.body).toMatch(/has ended and covers .*; its payment is due Jan 15/);
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
  it("hand-checked: on Jan 16, 2027 the sample's open period (due Jan 15) starts adding penalty too: +$0.39", () => {
    // Q4 $2,014.11, 1 day late at 7% (2027 rate carried forward): 2,014.11 x 1/365 x 0.07 = 0.3863 -> 0.39
    const r = computeNumber(txns(), DEMO_PROFILE, "2027-01-16");
    const q = r.quarters;
    const earlier = q.slice(0, 3).reduce((s, x) => s + latePenalty(x.amountCents, x.due, "2027-01-16"), 0);
    expect(q[3].amountCents).toBe(201_411);
    expect(r.penalty.soFarCents - earlier).toBe(39);
    expect(r.penalty.assumedRate).toBe(true);
  });
  it("not answered: today's behavior (penalty shown), flagged as unknown", () => {
    const r = computeNumber(txns(), { ...DEMO_PROFILE, priorYearTax: undefined }, "2026-11-13");
    expect(r.priorYear).toBe("unknown");
    expect(r.penalty.soFarCents).toBe(5_996);
    expect(r.alerts.some((a) => a.id === "prior")).toBe(false);
  });
});

import { formGuide } from "../lib/guide";
describe("V1/V4 follow-up: the exemption reaches every surface; the penalty copy promises nothing", () => {
  const txns = () => scaleBusiness(load(), DEMO_FACTOR);
  it("exempt: the open-period alert is an optional early payment, and the guide marks the due date optional", () => {
    const r = computeNumber(txns(), { ...DEMO_PROFILE, priorYearTax: "no" }, "2026-11-13");
    const next = r.alerts.find((a) => a.id === "next")!;
    expect(next.title).toMatch(/^Optional early payment/);
    expect(next.body).toMatch(/aren't required/);
    expect(next.title + next.body).not.toMatch(/due 2027-01-15/);
    const due = formGuide(r).flatMap((s) => s.rows).find((x) => x.id === "due")!;
    expect(due.label).toMatch(/optional for you this year/);
  });
  it("the missed-payment alert describes an estimate on these amounts, not a promise", () => {
    const r = computeNumber(txns(), DEMO_PROFILE, "2026-11-13");
    const body = r.alerts.find((a) => a.id === "missed")!.body;
    expect(body).toMatch(/on these amounts/i);
    expect(body).toMatch(/^Illustrative late penalty on these amounts/);
    expect(body).toMatch(/The IRS figures the real one from each period's required payment, so it can differ/);
    expect(body).not.toMatch(/avoids it|stops it growing|The IRS adds/);
    expect(body).not.toMatch(/assumed/); // Nov 13: no 2027 days counted
  });
});

import { typedTotalsTxns } from "../lib/entry";
describe("V1/V4 follow-up 2: typed totals with No; no 'overdue' from typed data", () => {
  const typedProfile = { ...DEMO_PROFILE, typedTotals: true, priorYearTax: undefined, balances: [], bills: [], asOf: "2026-12-31" };
  const rows = typedTotalsTxns({ incomeCents: 3_000_000, costsCents: 300_000, paidCents: 0 }, "2026-12-31");
  it("typed + No: no dated payment alert at all, only the exemption", () => {
    const r = computeNumber(rows, { ...typedProfile, priorYearTax: "no" }, "2027-01-20");
    expect(r.alerts.some((a) => a.id === "next")).toBe(false);
    expect(r.alerts.some((a) => a.id === "prior")).toBe(true);
  });
  it("typed, not answered, after Jan 15: the due date is named but never called overdue", () => {
    const r = computeNumber(rows, typedProfile, "2027-01-20");
    const next = r.alerts.find((a) => a.id === "next")!;
    expect(next.title).toBe("Next estimated tax due date: 2027-01-15");
    expect(next.title + next.body).not.toMatch(/overdue/); // ("nothing is marked late" is the copy's own reassurance)
  });
});

describe("V2 fallback: a paycheck isn't modeled; Yes shows how much higher the income-tax part is", () => {
  const txns = () => scaleBusiness(load(), DEMO_FACTOR);
  it("hand-checked range for the sample: $22,648.24 taxable at 12% to 22% = $2,717.79 to $4,982.61; headline unchanged", () => {
    // business part: 30,462.40 - half SE 2,152.10 = 28,310.30; minus 20% QBI 5,662.06 = 22,648.24
    // 12%: 2,717.7888 -> 2,717.79;  22%: 4,982.6128 -> 4,982.61;  holds once wages reach 16,100 + 12,400 = 28,500
    const r = computeNumber(txns(), { ...DEMO_PROFILE, paycheck: "yes" }, "2026-11-13");
    expect(r.owedSoFarCents).toBe(528_102);
    expect(r.paycheck).toBe("yes");
    expect(r.paycheckRange).toEqual({ taxableCents: 2_264_824, lowCents: 271_779, highCents: 498_261, lowPct: 12, highPct: 22, wagesFromCents: 2_850_000 });
  });
  it("No or not answered: no notice, today's behavior", () => {
    expect(computeNumber(txns(), { ...DEMO_PROFILE, paycheck: "no" }, "2026-11-13").paycheckRange).toBeUndefined();
    const r = computeNumber(txns(), DEMO_PROFILE, "2026-11-13");
    expect(r.paycheck).toBe("unknown");
    expect(r.paycheckRange).toBeUndefined();
  });
});

describe("V2 fallback follow-up: Yes qualifies every income-tax surface", () => {
  it("Why text, the sample's 'under the limit' alert and the guide's taxable income carry the wages limitation", () => {
    const r = computeNumber(scaleBusiness(load(), DEMO_FACTOR), { ...DEMO_PROFILE, paycheck: "yes" }, "2026-11-13");
    expect(r.lines.find((l) => l.key === "income")!.why).toMatch(/paycheck wages are not included/);
    expect(r.alerts.some((a) => a.id === "rule")).toBe(false); // "under the limit for income tax" doesn't hold with a paycheck
    expect(formGuide(r).flatMap((s) => s.rows).find((x) => x.id === "taxable")!.where).toMatch(/paycheck wages are not included/);
    const no = computeNumber(scaleBusiness(load(), DEMO_FACTOR), DEMO_PROFILE, "2026-11-13");
    expect(no.alerts.some((a) => a.id === "rule")).toBe(true); // unchanged without a paycheck
    expect(no.lines.find((l) => l.key === "income")!.why).not.toMatch(/paycheck/);
  });
});
describe("V2 fallback follow-up 2: payment alerts carry the wages note", () => {
  it("missed and open-period alerts say wages aren't included when the answer is Yes", () => {
    const r = computeNumber(scaleBusiness(load(), DEMO_FACTOR), { ...DEMO_PROFILE, paycheck: "yes" }, "2026-11-13");
    for (const id of ["missed", "next"]) expect(r.alerts.find((a) => a.id === id)!.body).toMatch(/your paycheck wages aren't included, so it can be higher/);
    expect(formGuide(r).flatMap((s) => s.rows).find((x) => x.id === "taxable")!.where).toMatch(/can be higher/);
  });
});

describe("Owner follow-up (Nov 14): alert explanations are one sentence, two at most", () => {
  const sentences = (t: string) => t.replace(/U\.S\./g, "US").replace(/\$[\d,]+\.\d{2}/g, "$X").replace(/\d\.\d/g, "N").split(/[.!?](?:\s|$)/).filter((x) => x.trim()).length;
  const cases: [string, Parameters<typeof computeNumber>[1], string][] = [
    ["sample, Nov 13", DEMO_PROFILE, "2026-11-13"],
    ["sample, Jan 1 2027", DEMO_PROFILE, "2027-01-01"],
    ["sample, Jan 16 2027", DEMO_PROFILE, "2027-01-16"],
    ["sample, no tax last year", { ...DEMO_PROFILE, priorYearTax: "no" }, "2026-11-13"],
    ["sample with a paycheck", { ...DEMO_PROFILE, paycheck: "yes" }, "2026-11-13"],
  ];
  for (const [name, profile, today] of cases) it(name, () => {
    const r = computeNumber(scaleBusiness(load(), DEMO_FACTOR), profile, today);
    for (const a of r.alerts) expect(sentences(a.body), `${a.id}: ${a.body}`).toBeLessThanOrEqual(2);
  });
  it("low profit (under the standard deduction) and typed totals also stay at two sentences", () => {
    const small = computeNumber(scaleBusiness(load(), 0.5), DEMO_PROFILE, "2026-11-13");
    expect(small.fed.incomeTaxCents).toBe(0);
    for (const a of small.alerts) expect(sentences(a.body), `${a.id}: ${a.body}`).toBeLessThanOrEqual(2);
    expect(small.alerts.find((a) => a.id === "rule")!.body).toMatch(/standard deduction only lowers income tax/);
    const typed = computeNumber(typedTotalsTxns({ incomeCents: 2_000_000, costsCents: 200_000, paidCents: 0 }, "2026-11-13"), { ...DEMO_PROFILE, typedTotals: true, priorYearTax: undefined, parentRule: undefined, balances: [], bills: [] , asOf: "2026-11-13" }, "2026-11-13");
    for (const a of typed.alerts) expect(sentences(a.body), `${a.id}: ${a.body}`).toBeLessThanOrEqual(2);
  });
  it("the parent-rule alert no longer says the sample is under the income-tax limit", () => {
    const r = computeNumber(scaleBusiness(load(), DEMO_FACTOR), DEMO_PROFILE, "2026-11-13");
    const rule = r.alerts.find((a) => a.id === "rule")!;
    expect(r.fed.incomeTaxCents).toBe(97_682);
    expect(rule.body).not.toMatch(/under the limit/);
    expect(rule.body).toMatch(/Your profit \(\$30,462\) is over the \$16,100 standard deduction, so income tax applies/);
    expect(rule.body).toMatch(/92\.35% of your profit reaches \$400, at any age/);
  });
});
