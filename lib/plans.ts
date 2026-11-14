// Plans the owner set on Nov 14, 2026: $10 a month, or pay per quarter (5% off) or per year (10% off).
// This build only records the choice; it does not collect payment details or charge anyone.
export const MONTHLY_CENTS = 1_000;

export type PlanId = "monthly" | "quarterly" | "annual";
export interface Plan { id: PlanId; name: string; months: number; discountPct: number }

export const PLANS: Plan[] = [
  { id: "monthly", name: "Monthly", months: 1, discountPct: 0 },
  { id: "quarterly", name: "Quarterly", months: 3, discountPct: 5 },
  { id: "annual", name: "Annual", months: 12, discountPct: 10 },
];

/** What one billing period costs, in cents: the monthly price times the months, less the plan's discount. */
export const periodCents = (p: Plan) => Math.round((MONTHLY_CENTS * p.months * (100 - p.discountPct)) / 100);
/** The same price spread over each month, in cents. */
export const perMonthCents = (p: Plan) => Math.round(periodCents(p) / p.months);
/** The undiscounted price for the same months, in cents. */
export const fullPriceCents = (p: Plan) => MONTHLY_CENTS * p.months;

export const dollars = (cents: number) => `$${cents % 100 === 0 ? cents / 100 : (cents / 100).toFixed(2)}`;
export const planById = (id?: string) => PLANS.find((p) => p.id === id);
/** "Monthly · $10 a month", "Quarterly · $28.50 every 3 months", "Annual · $108 a year". */
export function planLabel(id?: string) {
  const p = planById(id);
  if (!p) return undefined;
  const every = p.months === 1 ? "a month" : p.months === 12 ? "a year" : `every ${p.months} months`;
  return `${p.name} · ${dollars(periodCents(p))} ${every}`;
}
