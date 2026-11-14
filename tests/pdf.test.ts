import { readFileSync } from "node:fs";
import { jsPDF } from "jspdf";
import { describe, expect, it } from "vitest";
import { classify } from "../lib/classify";
import { normalize } from "../lib/csv";
import { DEMO_PROFILE } from "../lib/demo";
import { computeNumber } from "../lib/number";
import { buildEstimatePdf, pdfUSD } from "../lib/pdf";
import { plToTxns } from "../lib/qbo";
import { DEMO_FACTOR, scaleBusiness } from "../lib/scale";
import { calculationSteps } from "../lib/steps";
import type { Txn } from "../lib/types";

const sample = () => ["chase", "cashapp", "venmo"].flatMap((f) => normalize(readFileSync(`public/demo/${f}.csv`, "utf8"), `${f}.csv`)).map(classify);
// Pull the text the PDF actually draws: every (string) Tj operator in the uncompressed file.
const pdfText = (doc: jsPDF) => [...doc.output().matchAll(/\(((?:\\.|[^\\)])*)\)\s*Tj/g)].map((m) => m[1].replace(/\\([()\\])/g, "$1")).join("\n");

describe("CPA estimate summary PDF", () => {
  const r = computeNumber(scaleBusiness(sample(), DEMO_FACTOR), DEMO_PROFILE);
  const doc = buildEstimatePdf(new jsPDF({ unit: "pt", format: "letter" }), r, { name: "Jay", business: "Pressure washing", source: "Full-year sample business", generated: new Date("2026-11-12T12:00:00"), nextDue: "January 15, 2027" });
  const text = pdfText(doc);

  it("fits on one page", () => { expect(doc.getNumberOfPages()).toBe(1); });
  it("says what it is: an estimate summary for the tax year, not a return", () => {
    expect(text).toMatch(/estimated tax summary/);
    expect(text).toMatch(/Tax year 2026/);
    expect(text).toMatch(/not a tax return/);
    expect(text).toMatch(/Generated November 12, 2026/);
    expect(text).toMatch(/Data source: Full-year sample business/);
  });
  it("shows the same headline the screen shows ($5,281.02)", () => {
    expect(r.owedSoFarCents).toBe(528_102);
    expect(text).toContain("Estimated tax you owe");
    expect(text.split("\n").filter((l) => l === "$5,281.02").length).toBeGreaterThanOrEqual(2); // headline and total row
  });
  it("prints every calculation step paired with its own amount (label, then that amount)", () => {
    const lines = text.split("\n");
    for (const s of calculationSteps(r).flatMap((g) => g.steps)) {
      const pairs = lines.map((l, i) => (l === s.label ? lines[i + 1] : null)).filter((x) => x !== null);
      expect(pairs).toContain(pdfUSD(s.amountCents));
    }
  });
  it("every step note fits inside the margins (notes are drawn at 7.5 pt, 508 pt wide)", () => {
    const d = new jsPDF({ unit: "pt", format: "letter" }); d.setFont("helvetica", "normal"); d.setFontSize(7.5);
    for (const s of calculationSteps(r).flatMap((g) => g.steps).filter((x) => x.rule !== "From above.")) for (const line of d.splitTextToSize(s.rule, 508)) expect(text).toContain(line);
  });
  it("wraps a long name and replaces characters Helvetica cannot draw, staying on one page", () => {
    const d = buildEstimatePdf(new jsPDF({ unit: "pt", format: "letter" }), r, { name: "W".repeat(100), business: "東京 detailing", source: "Your CSV upload", generated: new Date("2026-11-12T12:00:00") });
    const t = pdfText(d);
    expect(d.getNumberOfPages()).toBe(1);
    expect(t).not.toMatch(/[東京]/);
    expect(t).toContain("?? detailing");
    d.setFontSize(9.5); d.setFont("helvetica", "normal");
    for (const line of t.split("\n").filter((l) => /^(Prepared for|W{5}|Data source)/.test(l))) expect(d.getTextWidth(line)).toBeLessThanOrEqual(516);
  });
  it("lists inputs, payments counted, assumptions and titled sources", () => {
    for (const t of ["Business income", "Business costs", "Business profit", "Payments counted", "Assumptions and exclusions", "IRS: Self-employment tax", "https://www.irs.gov/"]) expect(text).toContain(t);
  });
  it("makes no review or approval claim, and has no transaction list", () => {
    expect(text).not.toMatch(/CPA[- ](reviewed|approved|verified)|IRS[- ]approved|AI can/i);
    expect(text).toMatch(/Not reviewed by a CPA or the IRS/);
    expect(text).not.toMatch(/CHIPOTLE|TACO BELL|driveway wash/i);
  });
});

describe("itemized estimate export", () => {
  const txn = (id: string, kind: Txn["kind"], amountCents: number, extra: Partial<Txn> = {}): Txn => ({
    id, kind, amountCents, date: "2026-02-01", description: id, source: "Fictional CSV", reason: "Test fixture", ...extra,
  });
  const entries = [
    txn("Job A", "business_income", 3_000_000),
    txn("Income reversal", "business_income", -10_000),
    txn("Unconfirmed deposit", "review", 10_000),
    txn("Supplies purchase", "business_expense", -150_000, { category: "Supplies" }),
    txn("Supplies refund", "business_expense", 5_000, { category: "Supplies" }),
    txn("Tagged tax debit", "tax_payment", -90_000),
    txn("Tagged tax reversal", "tax_payment", 2_500),
    txn("Unconfirmed outflow", "review", -5_000),
    txn("Personal excluded", "personal", -6_000),
    txn("Transfer excluded", "transfer", 9_000),
    txn("Prior year excluded", "business_income", 20_000, { date: "2025-12-01" }),
    txn("Future excluded", "business_income", 80_000, { date: "2026-12-01" }),
  ];
  const meta = { source: "Fictional CSV", generated: new Date("2026-11-13T12:00:00") };
  const result = computeNumber(entries, DEMO_PROFILE);
  const report = () => buildEstimatePdf(new jsPDF({ unit: "pt", format: "letter" }), result, meta, entries);

  it("itemizes the same dated inputs and signed reversals that feed the estimate", () => {
    const text = pdfText(report());
    for (const entry of entries.slice(0, 8)) expect(text).toContain(`${entry.description}\n${pdfUSD(entry.amountCents)}`);
    for (const entry of entries.slice(8)) expect(text).not.toContain(entry.description);
    expect(text).toContain("1 personal rows, 1 transfers, and 2");
    expect(text).toContain(`Total income counted\n${pdfUSD(result.incomeCents)}`);
    expect(text).toContain(`Total cost entries (money out)\n${pdfUSD(-result.expensesCents)}`);
    expect(text).toContain(`Net payment entries (money out)\n${pdfUSD(-result.taxPaidCents)}`);
    expect(result.incomeCents).toBe(3_000_000);
    expect(result.expensesCents).toBe(145_000);
    expect(result.taxPaidCents).toBe(87_500);
    expect(text).toContain(pdfUSD(result.owedSoFarCents));
  });

  it("includes expense-category subtotals and flags provisional classifications", () => {
    const text = pdfText(report());
    expect(text).toContain("Supplies\n$1,450.00");
    expect(text).toContain("NEEDS REVIEW - counted as income");
    expect(text).toContain("NEEDS REVIEW - not counted");
    expect(text).toContain("Tagged tax payment - not verified");
    expect(text).toContain("not an invoice or an IRS bill");
  });

  it("handles an empty account without inventing transactions", () => {
    const empty = computeNumber([], DEMO_PROFILE);
    const doc = buildEstimatePdf(new jsPDF({ unit: "pt", format: "letter" }), empty, meta, []);
    const text = pdfText(doc);
    expect(text).toContain("itemizes 0 rows");
    expect(text).toContain("No business costs are counted in this period.");
    expect(text).toContain("Income counted (0)");
    expect(text).not.toContain("Payments counted (0)");
    expect(text).not.toContain("Other rows needing review (0)");
    expect(text).toContain("$0.00");
  });

  it("identifies QuickBooks monthly aggregates and their reporting dates without inventing transaction detail", () => {
    const monthly = plToTxns({
      Columns: { Column: [{ ColTitle: "" },
        { ColTitle: "Jan 2026", MetaData: [{ Name: "EndDate", Value: "2026-01-31" }] },
        { ColTitle: "Nov 2026", MetaData: [{ Name: "EndDate", Value: "2026-11-30" }] }] },
      Rows: { Row: [
        { group: "Income", Summary: { ColData: [{ value: "Income" }, { value: "2000" }, { value: "1000" }] } },
        { group: "Expenses", Summary: { ColData: [{ value: "Costs" }, { value: "300" }, { value: "150" }] } },
      ] },
    }, DEMO_PROFILE.asOf);
    const r = computeNumber(monthly, DEMO_PROFILE);
    const text = pdfText(buildEstimatePdf(new jsPDF({ unit: "pt", format: "letter" }), r, { ...meta, source: "QuickBooks (sandbox company), Profit & Loss" }, monthly));
    expect(text.replace(/\n/g, " ")).toContain("monthly Profit & Loss totals, not individual transactions");
    expect(text.replace(/\n/g, " ")).toContain("period-end dates, capped at the import date");
    expect(text.match(/Monthly Profit & Loss total/g)).toHaveLength(4);
    expect(monthly.map(t => t.date)).toEqual(["2026-01-31", "2026-01-31", DEMO_PROFILE.asOf, DEMO_PROFILE.asOf]);
    for (const t of monthly) expect(text).toContain(`${t.date}\n${t.description}\n${pdfUSD(t.amountCents)}`);
    expect(text).toContain("Total income counted\n$3,000.00");
    expect(text).toContain("Total cost entries (money out)\n-$450.00");
    expect(text).toContain(pdfUSD(r.owedSoFarCents));
    expect(pdfText(report())).not.toContain("QuickBooks rows are monthly");
  });

  it("paginates long descriptions, repeats column headers, and keeps every row and footer", () => {
    const long = Array.from({ length: 90 }, (_, i) => txn(`item-${i}`, "business_expense", -100 - i, {
      description: `ROW${String(i).padStart(3, "0")} ${"very long description ".repeat(30)}`,
      category: "Long category ".repeat(20), source: "Long source ".repeat(20),
    }));
    const original = long.map(t => ({ ...t }));
    const doc = buildEstimatePdf(new jsPDF({ unit: "pt", format: "letter" }), computeNumber(long, DEMO_PROFILE), meta, long);
    const text = pdfText(doc);
    expect(doc.getNumberOfPages()).toBeGreaterThan(4);
    for (let i = 0; i < 90; i++) expect(text.match(new RegExp(`ROW${String(i).padStart(3, "0")}`, "g"))).toHaveLength(1);
    expect(text.match(/DESCRIPTION \/ SOURCE \/ TAG/g)!.length).toBeGreaterThan(1);
    for (let i = 1; i <= doc.getNumberOfPages(); i++) expect(text).toContain(`Page ${i} of ${doc.getNumberOfPages()}`);
    expect(text).toContain("...");
    expect(long).toEqual(original);
  });
});

import { typedTotalsTxns } from "../lib/entry";
describe("V7: typed-in totals in the itemized PDF", () => {
  const txns = typedTotalsTxns({ incomeCents: 3_391_213, costsCents: 344_973, paidCents: 50_000 }, "2026-11-13");
  const r = computeNumber(txns, { ...DEMO_PROFILE, typedTotals: true, priorYearTax: undefined, balances: [], bills: [], asOf: "2026-11-13" }, "2026-11-13");
  const text = pdfText(buildEstimatePdf(new jsPDF({ unit: "pt", format: "letter" }), r, { source: "Typed in by you", generated: new Date("2026-11-13T12:00:00Z") }, txns));
  it("says the rows are typed totals, not individual transactions, and shows no dates for them", () => {
    expect(text).toMatch(/Typed-in rows are totals for the year so far/);
    expect(text).toMatch(/not individual transactions/);
    expect(text.split("\n").filter((l) => l === "no date").length).toBe(3);
    expect(text.split("\n")).not.toContain("2026-11-13");
    expect(text).toContain("Typed in by you | Typed-in total, year so far");
  });
  it("totals still match the screen", () => {
    expect(text).toContain(pdfUSD(r.owedSoFarCents));
    expect(text).toContain(pdfUSD(r.incomeCents));
  });
});

describe("V2 fallback in the PDF", () => {
  it("says wages aren't modeled and gives the range", () => {
    const r = computeNumber(scaleBusiness(sample(), DEMO_FACTOR), { ...DEMO_PROFILE, paycheck: "yes" });
    const text = pdfText(buildEstimatePdf(new jsPDF({ unit: "pt", format: "letter" }), r, { source: "Full-year sample business", generated: new Date("2026-11-13T12:00:00Z") })).replace(/\n/g, " ");
    expect(text).toMatch(/Has a paycheck job: wages are not modeled/);
    expect(text).toMatch(/\$2,717\.79 at 12%/);
    expect(text).toMatch(/\$4,982\.61 at 22%/);
    expect(text).toContain("$5,281.02");
  });
});
