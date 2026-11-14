import { describe, expect, it } from "vitest";
import { PLANS, dollars, fullPriceCents, perMonthCents, periodCents, planById, planLabel } from "../lib/plans";

describe("plans (owner, Nov 14): $10 a month, 5% off quarterly, 10% off yearly", () => {
  it("prices each billing period from the $10 monthly price", () => {
    // monthly 10.00; quarterly 3 x 10 = 30.00 less 5% = 28.50 (9.50 a month); annual 12 x 10 = 120.00 less 10% = 108.00 (9.00 a month)
    expect(PLANS.map((p) => [p.id, periodCents(p), perMonthCents(p), fullPriceCents(p)])).toEqual([
      ["monthly", 1_000, 1_000, 1_000], ["quarterly", 2_850, 950, 3_000], ["annual", 10_800, 900, 12_000]]);
    expect(PLANS.map((p) => dollars(periodCents(p)))).toEqual(["$10", "$28.50", "$108"]);
  });
  it("labels a chosen plan with its real cadence and shows nothing for no plan or an old plan id", () => {
    expect(planLabel("monthly")).toBe("Monthly · $10 a month");
    expect(planLabel("quarterly")).toBe("Quarterly · $28.50 every 3 months");
    expect(planLabel("annual")).toBe("Annual · $108 a year");
    for (const old of [undefined, "trial", "season", "free"]) { expect(planLabel(old)).toBeUndefined(); expect(planById(old)).toBeUndefined(); }
  });
});
