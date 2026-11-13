import { readFileSync } from "node:fs";
import { jsPDF } from "jspdf";
import { describe, expect, it } from "vitest";
import { classify } from "../lib/classify";
import { normalize } from "../lib/csv";
import { DEMO_PROFILE } from "../lib/demo";
import { computeNumber } from "../lib/number";
import { buildEstimatePdf, pdfUSD } from "../lib/pdf";
import { DEMO_FACTOR, scaleBusiness } from "../lib/scale";
import { calculationSteps } from "../lib/steps";

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
