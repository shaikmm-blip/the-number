// The full calculation as a list of labelled steps, built only from the engine's own result.
// The screen ("Full IRS calculation") and the PDF summary both render this list, so they cannot disagree.
// Nothing here recomputes tax: every amount is a field of NumberResult.
import type { NumberResult } from "./number";
import { SOURCES, SOURCE_TITLES, TAX_YEAR } from "./taxConfig";
import { formatUSD } from "./tax";

export type SourceKey = keyof typeof SOURCES;
export interface Step {
  id: string;
  label: string; // what the line is
  rule: string; // the rule in plain words, then the formal name
  amountCents: number; // signed: deductions and payments are negative
  kind: "input" | "part" | "subtotal" | "total";
  source?: SourceKey;
}
export interface StepGroup { title: string; steps: Step[] }

export const sourceLink = (k: SourceKey) => ({ title: SOURCE_TITLES[k], url: SOURCES[k] });

export const ASSUMPTION_LINE = `Assumes a sole proprietor filing single with no other income, federal tax only, the standard deduction, tax year ${TAX_YEAR}.`;

export function calculationSteps(r: NumberResult): StepGroup[] {
  const f = r.fed;
  const usd = (c: number) => formatUSD(c, { cents: true });
  const se: Step[] = [
    { id: "profit", label: "Business profit", rule: "Business income minus business costs (Schedule C net profit).", amountCents: f.netProfitCents, kind: "input", source: "soleProprietor" },
    { id: "se-base", label: "Earnings counted for self-employment tax", rule: "92.35% of profit, never below $0 (Schedule SE, line 4a). Under $400 of these earnings, there is no self-employment tax.", amountCents: f.se.netEarningsCents, kind: "part", source: "scheduleSE" },
    { id: "ss", label: "Social Security part", rule: "12.4% of those earnings, on earnings up to $184,500 for 2026.", amountCents: f.se.socialSecurityCents, kind: "part", source: "seTax" },
    { id: "medicare", label: "Medicare part", rule: "2.9% of those earnings.", amountCents: f.se.medicareCents, kind: "part", source: "seTax" },
    { id: "se-total", label: "Self-employment tax", rule: "Social Security part plus Medicare part.", amountCents: f.se.totalCents, kind: "subtotal", source: "seTax" },
  ];
  // The engine never lets income or the amount owed go below $0. When it clamps, show that as its own line so the steps still add up.
  const lossUnused = f.agiCents - (f.netProfitCents - f.halfSeDeductionCents);
  const overpaid = Math.max(0, r.taxPaidCents - f.totalTaxCents);
  const it: Step[] = [
    { id: "half-se", label: "Minus half of self-employment tax", rule: "Half of self-employment tax comes off your income (the deduction for one-half of SE tax).", amountCents: -f.halfSeDeductionCents, kind: "part", source: "seTax" },
    ...(lossUnused > 0 ? [{ id: "loss", label: "Business loss not used here", rule: "This estimate does not go below $0 income; a loss is not applied against anything else (an estimate convention, not an IRS rule).", amountCents: lossUnused, kind: "part" } as Step] : []),
    { id: "agi", label: "Adjusted gross income", rule: "Profit minus half of self-employment tax, never below $0 in this estimate.", amountCents: f.agiCents, kind: "subtotal", source: "seTax" },
    { id: "std", label: "Minus the standard deduction", rule: `This estimate uses the ${formatUSD(f.standardDeductionCents)} single-filer standard deduction for ${TAX_YEAR}, up to the income left.`, amountCents: -Math.min(f.standardDeductionCents, f.agiCents), kind: "part", source: "irs2026" },
    { id: "qbi", label: "Minus the small-business deduction", rule: "Up to 20% of business income (qualified business income deduction). This estimate also limits it to 20% of the income left after the standard deduction; that limit is not yet checked against an IRS source.", amountCents: -f.qbiDeductionCents, kind: "part", source: "qbi" },
    { id: "taxable", label: "Taxable income", rule: "What is left after the deductions.", amountCents: f.taxableIncomeCents, kind: "subtotal", source: "irs2026" },
    ...f.incomeTaxLines.filter((b) => b.amountCents > 0).map((b): Step => ({ id: `bracket-${b.rateBps}`, label: `${b.rateBps / 100}% bracket`, rule: `${b.rateBps / 100}% on ${usd(b.amountCents)} of taxable income (${TAX_YEAR} single-filer brackets).`, amountCents: b.taxCents, kind: "part", source: "irs2026" })),
    { id: "it-total", label: "Income tax", rule: "The bracket amounts added together.", amountCents: f.incomeTaxCents, kind: "subtotal", source: "irs2026" },
  ];
  const total: Step[] = [
    { id: "se-again", label: "Self-employment tax", rule: "From above.", amountCents: f.se.totalCents, kind: "part", source: "seTax" },
    { id: "it-again", label: "Income tax", rule: "From above.", amountCents: f.incomeTaxCents, kind: "part", source: "irs2026" },
    ...(r.taxPaidCents > 0 ? [{ id: "paid", label: "Minus payments already made", rule: "Payments to the IRS found in your data this year.", amountCents: -r.taxPaidCents, kind: "part", source: "estimatedTaxes" } as Step] : []),
    ...(overpaid > 0 ? [{ id: "overpaid", label: "Paid more than this estimate", rule: "Payments above the estimate are not shown as a refund here (an estimate convention).", amountCents: overpaid, kind: "part" } as Step] : []),
    { id: "owed", label: "Estimated tax you owe", rule: "Self-employment tax plus income tax, minus payments made (never below $0).", amountCents: r.owedSoFarCents, kind: "total", source: "estimatedTaxes" },
  ];
  return [
    { title: "Self-employment tax", steps: se },
    { title: "Income tax", steps: it },
    { title: "Estimated tax you owe", steps: total },
  ];
}
