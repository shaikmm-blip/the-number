import { describe, expect, it } from "vitest";
import { parseEntry } from "../lib/entry";

describe("typed money entries", () => {
  it("got", () => expect(parseEntry("got $350 for a house wash")).toMatchObject({ amountCents: 35000, kind: "business_income", description: "house wash" }));
  it("earned", () => expect(parseEntry("earned $350 washing a driveway")).toMatchObject({ amountCents: 35000, kind: "business_income" }));
  it("customer paid", () => expect(parseEntry("customer paid me 200")).toMatchObject({ amountCents: 20000, direction: "in" }));
  it("sold", () => expect(parseEntry("sold shoes for $90")).toMatchObject({ amountCents: 9000, direction: "in" }));
  it("k shorthand", () => expect(parseEntry("made 1.2k this weekend")).toMatchObject({ amountCents: 120000 }));
  it("whole k", () => expect(parseEntry("made 2k on a deck job")).toMatchObject({ amountCents: 200000 }));
  it("personal spend", () => expect(parseEntry("spent 180 on sneakers")).toMatchObject({ amountCents: 18000, kind: "personal", direction: "out" }));
  it("business spend", () => expect(parseEntry("bought $42.50 of surface cleaner soap")).toMatchObject({ amountCents: 4250, kind: "business_expense" }));
  it("bill", () => expect(parseEntry("insurance bill 480")).toMatchObject({ amountCents: 48000, kind: "business_expense" }));
  it("signs", () => { expect(parseEntry("+120 tip")).toMatchObject({ direction: "in" }); expect(parseEntry("-45 gas")).toMatchObject({ kind: "business_expense" }); });
  it("no verb, job word", () => expect(parseEntry("350 house wash")).toMatchObject({ direction: "in" }));
  it("commas", () => expect(parseEntry("made $1,200 on a deck job")).toMatchObject({ amountCents: 120000, kind: "business_income" }));
  it("needs an amount", () => expect(parseEntry("got paid")).toHaveProperty("error"));
  it("needs a direction", () => expect(parseEntry("$50 sneakers")).toHaveProperty("error"));
});

import { readFileSync } from "node:fs";
import { classify } from "../lib/classify";
import { normalize } from "../lib/csv";
import { DEMO_PROFILE } from "../lib/demo";
import { computeNumber } from "../lib/number";
import { DEMO_FACTOR, scaleBusiness } from "../lib/scale";
import { parseTypedAmount, typedTotalsTxns } from "../lib/entry";
describe("V7: type in income and costs", () => {
  const sample = computeNumber(scaleBusiness(["chase", "cashapp", "venmo"].flatMap((f) => normalize(readFileSync(`public/demo/${f}.csv`, "utf8"), `${f}.csv`)).map(classify), DEMO_FACTOR), DEMO_PROFILE, "2026-11-13");
  const typedProfile = { ...DEMO_PROFILE, typedTotals: true, priorYearTax: undefined, balances: [], bills: [], asOf: "2026-11-13" };
  const typed = (paidCents = 0) => computeNumber(typedTotalsTxns({ incomeCents: sample.incomeCents, costsCents: sample.expensesCents, paidCents }, "2026-11-13"), typedProfile, "2026-11-13");
  it("typing the sample's income and costs gives the sample's annual estimate to the cent", () => {
    const r = typed();
    expect(r.incomeCents).toBe(sample.incomeCents);
    expect(r.expensesCents).toBe(sample.expensesCents);
    expect(r.fed.totalTaxCents).toBe(sample.fed.totalTaxCents);
    expect(r.owedSoFarCents).toBe(528_102);
  });
  it("nothing is called late from typed data; the next payment is shown and the missing dates are explained", () => {
    const r = typed();
    expect(r.missed).toEqual([]);
    expect(r.quarters.some((q) => q.status === "missed")).toBe(false);
    expect(r.penalty.lateCount).toBe(0);
    expect(r.alerts.some((a) => a.id === "missed")).toBe(false);
    const next = r.alerts.find((a) => a.id === "next")!;
    expect(next.title).toContain("2027-01-15");
    expect(next.body).toMatch(/no dates/);
    expect(next.body).toMatch(/CSV upload or a bank connection/);
  });
  it("tax already paid comes off the estimate", () => {
    expect(typed(100_000).owedSoFarCents).toBe(528_102 - 100_000);
  });
  it("validates what was typed", () => {
    expect(parseTypedAmount("18,500", "income")).toBe(1_850_000);
    expect(parseTypedAmount("$3,450.5", "income")).toBe(345_050);
    expect(parseTypedAmount(" 0 ", "income")).toBe(0);
    expect(parseTypedAmount("", "tax paid", true)).toBe(0);
    expect(parseTypedAmount("", "income")).toEqual({ error: expect.stringMatching(/Enter your income/) });
    expect(parseTypedAmount("-5", "income")).toEqual({ error: expect.stringMatching(/no minus sign/) });
    expect(parseTypedAmount("12.345", "income")).toEqual({ error: expect.stringMatching(/dollar amount/) });
    expect(parseTypedAmount("abc", "income")).toEqual({ error: expect.stringMatching(/dollar amount/) });
    expect(parseTypedAmount("20000000", "income")).toEqual({ error: expect.stringMatching(/over \$10,000,000/) });
  });
});
