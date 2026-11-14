import { describe, expect, it } from "vitest";
import { payAssistSteps } from "../lib/paySteps";

describe("payment helper order (owner's Nov 14 screenshot of the IRS Tax Information step)", () => {
  const steps = payAssistSteps({ year: 2026, amountFmt: "$5,281.02", amountRaw: "5281.02" });
  it("goes Apply Payment To, then Reason for Payment, then Tax Period, then Amount", () => {
    expect(steps.map((s) => s.label)).toEqual(["Apply Payment To", "Reason for Payment", "Tax Period for Payment", "Amount"]);
  });
  it("names the right dropdown in each instruction and copies the matching value", () => {
    expect(steps.map((s) => [s.verb, s.show, s.copy])).toEqual([
      ["Pick the form in the 1st dropdown", "1040-ES", "1040-ES"],
      ["Then pick the reason in the 2nd dropdown", "Estimated tax", "Estimated Tax"],
      ["Pick the year in the 3rd dropdown", "2026", "2026"],
      ["Type or paste this amount — it's our estimate", "$5,281.02", "5281.02"],
    ]);
  });
});
