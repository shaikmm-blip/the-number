import { TAX_2026 } from "./taxConfig";

// All math is integer cents with explicit rounding (half up). No floats for money.
export const pct = (cents: number, bps: number) => Math.round((cents * bps) / 10_000);

export interface SETax {
  netEarningsCents: number; // net profit x 92.35%
  socialSecurityCents: number;
  medicareCents: number;
  totalCents: number;
  belowThreshold: boolean;
}

// V2: wages already taxed for Social Security use up part of the wage base (Schedule SE 2026, lines 7-10).
export function selfEmploymentTax(netProfitCents: number, cfg = TAX_2026, wagesCents = 0): SETax {
  const netEarnings = Math.max(0, pct(netProfitCents, cfg.seEarningsFactorBps));
  if (netEarnings < cfg.seThresholdCents) {
    return { netEarningsCents: netEarnings, socialSecurityCents: 0, medicareCents: 0, totalCents: 0, belowThreshold: true };
  }
  const ss = pct(Math.min(netEarnings, Math.max(0, cfg.ssWageBaseCents - Math.max(0, wagesCents))), cfg.socialSecurityBps);
  const medicare = pct(netEarnings, cfg.medicareBps);
  return { netEarningsCents: netEarnings, socialSecurityCents: ss, medicareCents: medicare, totalCents: ss + medicare, belowThreshold: false };
}

export function bracketTax(taxableCents: number, cfg = TAX_2026) {
  let remaining = Math.max(0, taxableCents);
  let lower = 0;
  let total = 0;
  const lines: { rateBps: number; amountCents: number; taxCents: number }[] = [];
  for (const b of cfg.brackets) {
    if (remaining <= 0) break;
    const width = b.upToCents - lower;
    const inBracket = Math.min(remaining, width);
    const t = pct(inBracket, b.rateBps);
    lines.push({ rateBps: b.rateBps, amountCents: inBracket, taxCents: t });
    total += t;
    remaining -= inBracket;
    lower = b.upToCents;
  }
  return { totalCents: total, lines };
}

export interface FederalEstimate {
  netProfitCents: number;
  /** V2: this year's expected paycheck wages (0 when none). */
  wagesCents: number;
  se: SETax;
  halfSeDeductionCents: number;
  agiCents: number;
  standardDeductionCents: number;
  qbiDeductionCents: number;
  /** Taxable income, wages included. */
  taxableIncomeCents: number;
  /** The business's share of income tax: tax on everything minus tax on wages alone (equals all income tax when there are no wages). */
  incomeTaxCents: number;
  /** Bracket lines for all taxable income, wages included. */
  incomeTaxLines: { rateBps: number; amountCents: number; taxCents: number }[];
  /** V2: income tax on all taxable income, and on the wages alone. */
  incomeTaxAllCents: number;
  wagesOnlyIncomeTaxCents: number;
  totalTaxCents: number;
}

// V2: with paycheck wages, wages fill the standard deduction and the lower brackets first and the business stacks on top.
// The business's income tax is the tax on everything minus the tax on the wages alone (assumes withholding covers the wages).
// A business loss is not used against wages (the estimate's existing convention). With wages = 0 every figure is unchanged.
export function federalEstimate(netProfitCents: number, cfg = TAX_2026, wagesCents = 0): FederalEstimate {
  const wages = Math.max(0, wagesCents);
  const se = selfEmploymentTax(netProfitCents, cfg, wages);
  const halfSe = Math.round(se.totalCents / 2);
  const agi = wages + Math.max(0, netProfitCents - halfSe);
  const beforeQbi = Math.max(0, agi - cfg.standardDeductionCents);
  // Sole-proprietor QBI deduction: 20% of (profit - half SE tax), but no more than 20% of taxable income before it (wages included).
  const qbi = Math.min(pct(Math.max(0, netProfitCents - halfSe), cfg.qbiBps), pct(beforeQbi, cfg.qbiBps));
  const taxable = Math.max(0, beforeQbi - qbi);
  const it = bracketTax(taxable, cfg);
  const wagesOnly = bracketTax(Math.max(0, wages - cfg.standardDeductionCents), cfg).totalCents;
  const business = Math.max(0, it.totalCents - wagesOnly);
  return {
    netProfitCents,
    wagesCents: wages,
    se,
    halfSeDeductionCents: halfSe,
    agiCents: agi,
    standardDeductionCents: cfg.standardDeductionCents,
    qbiDeductionCents: qbi,
    taxableIncomeCents: taxable,
    incomeTaxCents: business,
    incomeTaxLines: it.lines,
    incomeTaxAllCents: it.totalCents,
    wagesOnlyIncomeTaxCents: wagesOnly,
    totalTaxCents: se.totalCents + business,
  };
}

export function formatUSD(cents: number, opts: { cents?: boolean } = {}) {
  const neg = cents < 0;
  const abs = Math.abs(cents);
  const dollars = opts.cents ? (abs / 100).toFixed(2) : Math.round(abs / 100).toString();
  const [whole, frac] = dollars.split(".");
  const withCommas = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${neg ? "−" : ""}$${withCommas}${frac ? "." + frac : ""}`;
}

export function toCents(value: string | number): number {
  const s = String(value).replace(/[$,\s]/g, "");
  if (!/^-?\d+(\.\d{1,2})?$/.test(s)) throw new Error(`Not a money amount: ${value}`);
  const neg = s.startsWith("-");
  const [w, f = ""] = s.replace("-", "").split(".");
  const c = parseInt(w, 10) * 100 + parseInt((f + "00").slice(0, 2), 10);
  return neg ? -c : c;
}
