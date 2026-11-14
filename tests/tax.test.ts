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
    const s = penaltySummary(q, [], "2026-11-13");
    expect(s.soFarCents).toBe(latePenalty(100_000, "2026-09-15", "2026-11-13"));
    expect(s.perWeekCents).toBe(134);
    expect(s.lateCount).toBe(1);
    expect(s.assumedRate).toBeUndefined();
  });
});

import { penaltyOn } from "../lib/penalty";
describe("estimated-tax penalty with dated payments (applied to the earliest unpaid period, on the day paid)", () => {
  it("hand-checked: a late payment keeps the penalty that built up before it ($1,000 due Jun 15, paid Nov 13 -> $28.55)", () => {
    const r = penaltyOn([{ due: "2026-06-15", amountCents: 100_000 }], [{ date: "2026-11-13", cents: 100_000 }], "2026-12-01");
    expect(r.cents).toBe(2_855); // same as unpaid through Nov 13; nothing after the payment
    expect(r.lateCount).toBe(0);
  });
  it("hand-checked: a partial payment lowers the balance from its date on -> $22.87", () => {
    // $1,000 Jun 16-30 at 6%: 2.4658 -> 2.47; Jul 1-Aug 31 (62 days) at 7%: 11.8904 -> 11.89
    // $600 Sep 1-30 at 7%: 3.4521 -> 3.45; Oct 1-Nov 13 (44 days) at 7%: 5.0630 -> 5.06.  Total 22.87
    const r = penaltyOn([{ due: "2026-06-15", amountCents: 100_000 }], [{ date: "2026-08-31", cents: 40_000 }], "2026-11-13");
    expect(r.cents).toBe(2_287);
    expect(r.lateCount).toBe(1);
  });
  it("a payment made before the due date means no penalty", () => {
    expect(penaltyOn([{ due: "2026-06-15", amountCents: 100_000 }], [{ date: "2026-06-01", cents: 100_000 }], "2026-11-13").cents).toBe(0);
  });
  it("hand-checked: one payment goes to the earliest period first -> $3.99", () => {
    // $500 due Apr 15 paid May 1: Apr 16-May 1 = 16 days at 6% = 1.3151 -> 1.32
    // $500 due Jun 15 unpaid through Jul 15: Jun 16-30 at 6% = 1.2329 -> 1.23; Jul 1-15 at 7% = 1.4384 -> 1.44.  Total 3.99
    const r = penaltyOn([{ due: "2026-04-15", amountCents: 50_000 }, { due: "2026-06-15", amountCents: 50_000 }], [{ date: "2026-05-01", cents: 50_000 }], "2026-07-15");
    expect(r.cents).toBe(399);
    expect(r.lateCount).toBe(1);
  });
  it("flags when the figure uses the carried-forward 2027 rate (not yet published)", () => {
    const q = [{ quarter: "Q3", due: "2026-09-15", covers: "", start: "2026-06-01", end: "2026-08-31", amountCents: 100_000, remainingCents: 100_000, status: "missed" as const }];
    expect(penaltySummary(q, [], "2026-12-28").assumedRate).toBe(true); // next week crosses into 2027
    expect(penaltySummary(q, [], "2026-12-20").assumedRate).toBeUndefined();
  });
});

describe("V2: paycheck wages come first; the business stacks on top (sample profit $30,462.40)", () => {
  const P = 3_046_240;
  it("zero wages reproduces the existing estimate to the cent", () => {
    const a = federalEstimate(P), b = federalEstimate(P, undefined, 0);
    expect(b).toEqual(a);
    expect(b.totalTaxCents).toBe(528_102);
    expect(b.wagesOnlyIncomeTaxCents).toBe(0);
  });
  it("hand-checked: $30,000 of wages -> business income tax $2,717.79, total $7,021.99", () => {
    // SE unchanged (wages + earnings under $184,500): 4,304.20; half 2,152.10
    // AGI = 30,000 + (30,462.40 - 2,152.10) = 58,310.30; minus $16,100 = 42,210.30
    // QBI = min(20% x 28,310.30 = 5,662.06, 20% x 42,210.30 = 8,442.06) = 5,662.06; taxable 36,548.24
    // tax on all: 10% x 12,400 = 1,240 + 12% x 24,148.24 = 2,897.79 -> 4,137.79
    // tax on wages alone: 30,000 - 16,100 = 13,900 -> 1,240 + 12% x 1,500 = 180 -> 1,420.00
    // business share 4,137.79 - 1,420.00 = 2,717.79; total 4,304.20 + 2,717.79 = 7,021.99
    const r = federalEstimate(P, undefined, 3_000_000);
    expect(r.se.totalCents).toBe(430_420);
    expect(r.agiCents).toBe(5_831_030);
    expect(r.qbiDeductionCents).toBe(566_206);
    expect(r.taxableIncomeCents).toBe(3_654_824);
    expect(r.incomeTaxAllCents).toBe(413_779);
    expect(r.wagesOnlyIncomeTaxCents).toBe(142_000);
    expect(r.incomeTaxCents).toBe(271_779);
    expect(r.totalTaxCents).toBe(702_199);
  });
  it("hand-checked: $60,000 of wages -> business income tax $4,332.61", () => {
    // AGI 88,310.30; before QBI 72,210.30; QBI 5,662.06 (20% of business); taxable 66,548.24
    // tax on all: 1,240 + 12% x 38,000 = 4,560 + 22% x 16,148.24 = 3,552.61 -> 9,352.61
    // wages alone: 43,900 taxable -> 1,240 + 12% x 31,500 = 3,780 -> 5,020.00; business 4,332.61
    const r = federalEstimate(P, undefined, 6_000_000);
    expect(r.taxableIncomeCents).toBe(6_654_824);
    expect(r.incomeTaxAllCents).toBe(935_261);
    expect(r.wagesOnlyIncomeTaxCents).toBe(502_000);
    expect(r.incomeTaxCents).toBe(433_261);
    expect(r.totalTaxCents).toBe(430_420 + 433_261);
  });
  it("hand-checked: $160,000 of wages -> Social Security part stops at $184,500 - wages: $3,038.00", () => {
    // SE earnings 28,132.03; SS on min(28,132.03, 184,500 - 160,000 = 24,500) x 12.4% = 3,038.00; Medicare 2.9% x 28,132.03 = 815.83
    // half SE 3,853.83 / 2 = 1,926.915 -> 1,926.92; business share of income tax 5,478.81 (independent model)
    const r = federalEstimate(P, undefined, 16_000_000);
    expect(r.se.socialSecurityCents).toBe(303_800);
    expect(r.se.medicareCents).toBe(81_583);
    expect(r.halfSeDeductionCents).toBe(192_692);
    expect(r.incomeTaxCents).toBe(547_881);
    expect(r.totalTaxCents).toBe(933_264);
  });
  it("wages at or above the wage base leave no Social Security part; a loss is not used against wages", () => {
    expect(federalEstimate(P, undefined, 18_450_000).se.socialSecurityCents).toBe(0);
    const loss = federalEstimate(-500_000, undefined, 3_000_000);
    expect(loss.incomeTaxCents).toBe(0);
    expect(loss.totalTaxCents).toBe(0);
  });
});
