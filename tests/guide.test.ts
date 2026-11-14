import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { classify } from "../lib/classify";
import { normalize } from "../lib/csv";
import { DEMO_PROFILE } from "../lib/demo";
import { formGuide, GUIDE_SOURCES } from "../lib/guide";
import { computeNumber } from "../lib/number";
import { DEMO_FACTOR, scaleBusiness } from "../lib/scale";
import { calculationSteps } from "../lib/steps";

const sample = () => ["chase", "cashapp", "venmo"].flatMap((f) => normalize(readFileSync(`public/demo/${f}.csv`, "utf8"), `${f}.csv`)).map(classify);
const r = computeNumber(scaleBusiness(sample(), DEMO_FACTOR), DEMO_PROFILE);
const [during, filing] = formGuide(r);
const step = (id: string) => calculationSteps(r).flatMap((g) => g.steps).find((s) => s.id === id)!.amountCents;

describe("1040 / 1040-ES guide", () => {
  it("keeps the two forms apart: 1040-ES during the year, 1040 at filing time", () => {
    expect(during.title).toMatch(/1040-ES/); expect(during.title).not.toMatch(/Form 1040 /);
    expect(filing.title).toMatch(/Form 1040 for/); expect(filing.title).not.toMatch(/1040-ES/);
    for (const row of filing.rows) expect(row.where).not.toMatch(/1040-ES|Direct Pay/);
  });
  it("figures match the calculation view to the cent", () => {
    const g = (s: typeof during, id: string) => s.rows.find((x) => x.id === id)!.cents;
    expect(g(during, "pay")).toBe(step("owed"));
    expect(g(filing, "profit")).toBe(step("profit"));
    expect(g(filing, "se-base")).toBe(step("se-base"));
    expect(g(filing, "se")).toBe(step("se-total"));
    expect(g(filing, "half-se")).toBe(-step("half-se"));
    expect(g(filing, "std")).toBe(-step("std"));
    expect(g(filing, "qbi")).toBe(-step("qbi"));
    expect(g(filing, "taxable")).toBe(step("taxable"));
  });
  it("every row has a titled https source, and no row claims to file or fill in a form", () => {
    for (const row of [...during.rows, ...filing.rows]) {
      expect(GUIDE_SOURCES[row.source].title).toMatch(/^IRS: /);
      expect(GUIDE_SOURCES[row.source].url).toMatch(/^https:\/\/www\.irs\.gov\//);
      expect(`${row.label} ${row.where}`).not.toMatch(/we (file|fill|submit)|auto-?fill|filed for you/i);
    }
  });
  it("a loss and a payment: figures still match the calculation, and the clamps are explained", () => {
    const t = (id: string, date: string, cents: number, kind: "business_income" | "business_expense" | "tax_payment") => ({ id, date, source: "test", description: id, amountCents: cents, kind, reason: "t" });
    const loss = computeNumber([t("a", "2026-03-01", 10_000, "business_income"), t("b", "2026-03-02", -110_000, "business_expense"), t("c", "2026-04-15", -20_000, "tax_payment")], { ...DEMO_PROFILE, parentRule: undefined, bills: [], balances: [] });
    const [d, fl] = formGuide(loss);
    const row = (s: typeof d, id: string) => s.rows.find((x) => x.id === id)!;
    expect(row(fl, "se-base").cents).toBe(0); expect(row(fl, "se-base").where).toMatch(/\$0 when there is no profit/);
    expect(row(fl, "std").cents).toBe(0); expect(row(fl, "std").label).toMatch(/used in this estimate/); expect(row(fl, "std").where).toMatch(/\$16,100/);
    expect(row(fl, "paid").cents).toBe(loss.taxPaidCents); expect(row(fl, "paid").cents).toBe(20_000);
    expect(row(d, "pay").cents).toBe(loss.owedSoFarCents);
    expect(row(fl, "qbi").where).toContain("Limited to 20% of taxable income before the QBI deduction (Form 8995 instructions)");
  });
  it("only names line numbers that were confirmed for 2026 (Schedule C and Schedule SE); Form 1040 lines are named by concept", () => {
    for (const row of filing.rows.filter((x) => x.source === "form1040")) expect(row.where).toMatch(/line number for 2026 not confirmed yet/);
    expect(filing.rows.find((x) => x.id === "profit")!.where).toMatch(/line 31/);
    expect(filing.rows.find((x) => x.id === "se")!.where).toMatch(/line 12.*Schedule 2 \(Form 1040\), line 4/);
  });
});
