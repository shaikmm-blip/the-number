export type Kind = "business_income" | "business_expense" | "personal" | "transfer" | "tax_payment" | "review";

export interface Txn {
  id: string;
  date: string; // YYYY-MM-DD
  source: string; // Chase, Cash App, Venmo, Plaid
  description: string;
  counterparty?: string;
  amountCents: number; // money in > 0, money out < 0
  kind: Kind;
  category?: string;
  reason: string; // why it was tagged this way (shown to the user)
  userSet?: boolean;
}

export interface Bill {
  name: string;
  amountCents: number;
  due: string; // YYYY-MM-DD
}

export interface AccountBalance {
  name: string;
  balanceCents: number;
}

export interface Profile {
  ownerName: string;
  businessName: string;
  age: number;
  state: string;
  parentRule?: { label: string; amountCents: number };
  asOf: string;
  /** V1: did last year's return show any total tax? "no" = $0 total tax or no return required, a full 12-month year, U.S. citizen or resident all year. Unset = not answered. */
  priorYearTax?: "yes" | "no";
  /** V7: the data is typed-in totals with no dates, so nothing can be placed in a period or called late. */
  typedTotals?: boolean;
  /** V2: this year's expected paycheck (W-2) wages before tax, in cents. Unset or 0 = no paycheck job. */
  wagesCents?: number;
  balances: AccountBalance[];
  bills: Bill[];
}
