import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { classify } from "../lib/classify";
import { normalize } from "../lib/csv";
import { DEMO_PROFILE } from "../lib/demo";
import { computeNumber, type NumberResult } from "../lib/number";
import { DEMO_FACTOR, scaleBusiness } from "../lib/scale";
import { calculationSteps } from "../lib/steps";
import { SOURCES, SOURCE_TITLES } from "../lib/taxConfig";
import type { Txn } from "../lib/types";

const sample = () => ["chase", "cashapp", "venmo"].flatMap((f) => normalize(readFileSync(`public/demo/${f}.csv`, "utf8"), `${f}.csv`)).map(classify);
const amt = (r: NumberResult, id: string) => calculationSteps(r).flatMap((g) => g.steps).find((s) => s.id === id)?.amountCents ?? 0;

// Every displayed step adds up to the next subtotal, and the last line equals the headline, to the cent.
function reconciles(r: NumberResult) {
  const all = calculationSteps(r).flatMap((g) => g.steps);
  expect(amt(r, "ss") + amt(r, "medicare")).toBe(amt(r, "se-total"));
  expect(amt(r, "profit") + amt(r, "half-se") + amt(r, "loss")).toBe(amt(r, "agi"));
  expect(amt(r, "agi") + amt(r, "std") + amt(r, "qbi")).toBe(amt(r, "taxable"));
  const brackets = all.filter((s) => s.id.startsWith("bracket-")).reduce((t, s) => t + s.amountCents, 0);
  expect(brackets).toBe(amt(r, "it-total"));
  expect(amt(r, "se-again") + amt(r, "it-again") + amt(r, "paid") + amt(r, "overpaid")).toBe(amt(r, "owed"));
  expect(amt(r, "owed")).toBe(r.owedSoFarCents);
  return r.owedSoFarCents;
}

describe("full calculation steps", () => {
  it("sample business as the app shows it (fixed demo size) reconciles to the headline", () => {
    const r = computeNumber(scaleBusiness(sample(), DEMO_FACTOR), DEMO_PROFILE);
    expect(reconciles(r)).toBe(528_102); // $5,281.02, the figure a fresh sample load shows
  });
  it("unscaled sample reconciles", () => { reconciles(computeNumber(sample(), DEMO_PROFILE)); });
  it("another profile, with a payment already made and a higher bracket, reconciles", () => {
    const t = (id: string, date: string, cents: number, kind: Txn["kind"]): Txn => ({ id, date, source: "test", description: id, amountCents: cents, kind, reason: "test" });
    const txns = [t("a", "2026-02-10", 4_000_000, "business_income"), t("b", "2026-05-03", 6_500_000, "business_income"), t("c", "2026-06-01", -900_000, "business_expense"), t("d", "2026-06-14", -300_000, "tax_payment")];
    const r = computeNumber(txns, { ...DEMO_PROFILE, parentRule: undefined, bills: [], balances: [] });
    expect(r.taxPaidCents).toBe(300_000);
    expect(calculationSteps(r).flatMap((g) => g.steps).some((s) => s.id === "bracket-2200")).toBe(true);
    reconciles(r);
  });
  describe("edge cases still reconcile", () => {
    const t = (id: string, date: string, cents: number, kind: Txn["kind"]): Txn => ({ id, date, source: "test", description: id, amountCents: cents, kind, reason: "test" });
    const run = (txns: Txn[]) => computeNumber(txns, { ...DEMO_PROFILE, parentRule: undefined, bills: [], balances: [] });
    it("a business loss", () => { const r = run([t("a", "2026-03-01", 100_000, "business_income"), t("b", "2026-03-02", -400_000, "business_expense")]); expect(amt(r, "loss")).toBeGreaterThan(0); expect(reconciles(r)).toBe(0); });
    it("zero activity", () => { expect(reconciles(run([]))).toBe(0); });
    it("profit under the $400 threshold", () => { const r = run([t("a", "2026-03-01", 40_000, "business_income")]); expect(r.fed.se.totalCents).toBe(0); reconciles(r); });
    it("payments larger than the estimate", () => { const r = run([t("a", "2026-03-01", 2_000_000, "business_income"), t("b", "2026-04-15", -900_000, "tax_payment")]); expect(amt(r, "overpaid")).toBeGreaterThan(0); expect(reconciles(r)).toBe(0); });
    it("profit above the Social Security wage base", () => { const r = run([t("a", "2026-03-01", 25_000_000, "business_income")]); expect(r.fed.se.socialSecurityCents).toBe(Math.round(18_450_000 * 0.124)); reconciles(r); });
  });
  it("every source a step cites has a human title and an https link", () => {
    for (const k of Object.keys(SOURCES) as (keyof typeof SOURCES)[]) {
      expect(SOURCE_TITLES[k]).toMatch(/^[A-Z][^:]+: .{6,}/);
      expect(SOURCES[k]).toMatch(/^https:\/\//);
    }
  });
});

describe("V2: steps with paycheck wages reconcile to the headline", () => {
  function reconcilesWithWages(r: NumberResult) {
    const all = calculationSteps(r).flatMap((g) => g.steps);
    expect(amt(r, "ss") + amt(r, "medicare")).toBe(amt(r, "se-total"));
    expect(amt(r, "profit") + amt(r, "wages") + amt(r, "half-se") + amt(r, "loss")).toBe(amt(r, "agi"));
    expect(amt(r, "agi") + amt(r, "std") + amt(r, "qbi")).toBe(amt(r, "taxable"));
    expect(all.filter((s) => s.id.startsWith("bracket-")).reduce((t, s) => t + s.amountCents, 0)).toBe(amt(r, "it-all"));
    expect(amt(r, "it-all") + amt(r, "it-wages")).toBe(amt(r, "it-total"));
    expect(amt(r, "se-again") + amt(r, "it-again") + amt(r, "paid") + amt(r, "overpaid")).toBe(amt(r, "owed"));
    expect(amt(r, "owed")).toBe(r.owedSoFarCents);
  }
  for (const w of [3_000_000, 6_000_000, 16_000_000]) {
    it(`sample + $${w / 100} of wages`, () => {
      const r = computeNumber(scaleBusiness(sample(), DEMO_FACTOR), { ...DEMO_PROFILE, wagesCents: w });
      reconcilesWithWages(r);
      expect(r.unsupported).toBeUndefined();
    });
  }
  it("declines combined income over $200,000 instead of showing a low number", () => {
    const r = computeNumber(scaleBusiness(sample(), DEMO_FACTOR), { ...DEMO_PROFILE, wagesCents: 17_000_000 });
    expect(r.unsupported).toMatch(/^Not supported yet/);
    expect(computeNumber(scaleBusiness(sample(), DEMO_FACTOR), { ...DEMO_PROFILE, wagesCents: 16_000_000 }).unsupported).toBeUndefined();
  });
});
