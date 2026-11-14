import { describe, expect, it } from "vitest";
import { bracketTax, federalEstimate, selfEmploymentTax, toCents } from "../lib/tax";

describe("self-employment tax", () => {
  it("is zero below the $400 threshold (any age)", () => {
    const r = selfEmploymentTax(toCents("400.00")); // 400 x 92.35% = 369.40 < 400
    expect(r.totalCents).toBe(0);
    expect(r.belowThreshold).toBe(true);
  });
  it("hand-checked: $30,000 profit -> $4,238.87", () => {
    // 30,000 x 0.9235 = 27,705.00; x 12.4% = 3,435.42; x 2.9% = 803.45 (803.445 rounds half up)
    const r = selfEmploymentTax(toCents("30000"));
    expect(r.netEarningsCents).toBe(2_770_500);
    expect(r.socialSecurityCents).toBe(343_542);
    expect(r.medicareCents).toBe(80_345);
    expect(r.totalCents).toBe(423_887);
  });
  it("caps the Social Security part at the 2026 wage base", () => {
    const r = selfEmploymentTax(toCents("300000"));
    expect(r.socialSecurityCents).toBe(Math.round(18_450_000 * 0.124));
  });
  it("never goes negative on a loss", () => {
    expect(selfEmploymentTax(toCents("-5000")).totalCents).toBe(0);
  });
});

describe("income tax brackets (2026 single)", () => {
  it("10% up to $12,400 then 12%", () => {
    // 15,000 taxable = 1,240.00 + 2,600 x 12% = 312.00 -> 1,552.00
    expect(bracketTax(toCents("15000")).totalCents).toBe(155_200);
  });
});

describe("federal estimate", () => {
  it("hand-checked: $30,000 profit", () => {
    const r = federalEstimate(toCents("30000"));
    // half SE = 2,119.44; AGI = 27,880.56; before QBI = 11,780.56
    // QBI = min(20% x (30,000 - 2,119.44) = 5,576.11, 20% x 11,780.56 = 2,356.11) = 2,356.11
    // taxable = 9,424.45; tax at 10% = 942.45 (942.445 rounds half up)
    expect(r.halfSeDeductionCents).toBe(211_944);
    expect(r.qbiDeductionCents).toBe(235_611);
    expect(r.taxableIncomeCents).toBe(942_445);
    expect(r.incomeTaxCents).toBe(94_245);
    expect(r.totalTaxCents).toBe(423_887 + 94_245);
  });
  it("no income tax when profit is under the standard deduction", () => {
    expect(federalEstimate(toCents("10000")).incomeTaxCents).toBe(0);
  });
});

describe("money parsing", () => {
  it("parses dollars to integer cents", () => {
    expect(toCents("$1,234.5")).toBe(123_450);
    expect(toCents("-85.10")).toBe(-8_510);
    expect(() => toCents("abc")).toThrow();
  });
});

import { latePenalty, penaltySummary } from "../lib/penalty";
describe("estimated-tax penalty (Form 2210 method: amount x days late / 365 x rate, by rate period, not compounded)", () => {
  it("hand-checked: $1,000 due Jun 15, 2026, still unpaid on Nov 13 -> $28.55", () => {
    // Jun 16-30: 15 days at 6% = 1,000 x 15/365 x 0.06 = 2.4658 -> 2.47
    // Jul 1-Sep 30: 92 days at 7% = 17.6438 -> 17.64;  Oct 1-Nov 13: 44 days at 7% = 8.4384 -> 8.44.  Total 28.55
    expect(latePenalty(100_000, "2026-06-15", "2026-11-13")).toBe(2_855);
  });
  it("hand-checked: $1,000 due Apr 15, 2026 stops on Apr 15, 2027 -> $67.91 (not the compounded $72.50)", () => {
    // Apr 16-Jun 30: 76 days at 6% = 12.4932 -> 12.49;  Jul-Sep: 92 at 7% = 17.64;  Oct-Dec: 92 at 7% = 17.64
    // Jan 1-Apr 15, 2027: 105 days at 7% (latest rate carried; not yet published) = 20.137 -> 20.14
    // Total 12.49 + 17.64 + 17.64 + 20.14 = 67.91; nothing accrues after Apr 15, 2027
    expect(latePenalty(100_000, "2026-04-15", "2027-12-31")).toBe(6_791);
    expect(latePenalty(100_000, "2026-04-15", "2027-04-15")).toBe(6_791);
  });
  it("is zero on or before the due date", () => {
    expect(latePenalty(100_000, "2026-09-15", "2026-09-01")).toBe(0);
    expect(latePenalty(100_000, "2026-09-15", "2026-09-15")).toBe(0);
  });
  it("hand-checked: one more week in Q4 on $1,000 adds $1.34", () => {
    // 1,000 x 7/365 x 0.07 = 1.3425 -> 1.34
    const q = [{ quarter: "Q3", due: "2026-09-15", covers: "", start: "2026-06-01", end: "2026-08-31", amountCents: 100_000, remainingCents: 100_000, status: "missed" as const }];
    const s = penaltySummary(q, "2026-11-13");
    expect(s.soFarCents).toBe(latePenalty(100_000, "2026-09-15", "2026-11-13"));
    expect(s.perWeekCents).toBe(134);
    expect(s.lateCount).toBe(1);
  });
});
