import { Configuration, CountryCode, PlaidApi, PlaidEnvironments, Products } from "plaid";
import { toCents } from "./tax";
import type { Txn } from "./types";

// Server-only. Keys come from environment variables (never committed, never sent to the browser).
export function plaidClient() {
  // Trim in case a key was pasted with a stray space or newline.
  const id = process.env.PLAID_CLIENT_ID?.trim(), secret = process.env.PLAID_SECRET?.trim();
  // Only "production" switches to live banks; anything else (missing, typo) safely uses sandbox.
  const env: keyof typeof PlaidEnvironments = (process.env.PLAID_ENV || "").trim().toLowerCase() === "production" ? "production" : "sandbox";
  if (!id || !secret) return null;
  return new PlaidApi(new Configuration({
    basePath: PlaidEnvironments[env],
    baseOptions: { headers: { "PLAID-CLIENT-ID": id, "PLAID-SECRET": secret } },
  }));
}

export const LINK_CONFIG = { products: [Products.Transactions], country_codes: [CountryCode.Us], language: "en" as const, client_name: "The Number", transactions: { days_requested: 730 } };

// Plaid amounts are positive for money leaving the account. We store money in as positive cents.
export function mapPlaidTxn(t: { transaction_id: string; date: string; name: string; merchant_name?: string | null; amount: number; account_id: string }, accountName: string): Omit<Txn, "kind" | "reason"> {
  return {
    id: `plaid-${t.transaction_id}`,
    date: t.date,
    source: `Plaid · ${accountName}`,
    // Keep Plaid's original text (it carries notes like "driveway wash"); the merchant name is extra context.
    description: t.name,
    counterparty: t.merchant_name || t.name,
    amountCents: toCents((-t.amount).toFixed(2)),
  };
}

export const notConfigured = () =>
  Response.json({ error: "Bank connections aren't set up on this site yet. Pick a payment app below to see a sample business instead." }, { status: 501 });
