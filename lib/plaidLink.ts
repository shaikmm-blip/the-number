// Finishes a Plaid Link session: exchanges the public_token Link returned for the account the person picked
// (/api/plaid/exchange → /item/public_token/exchange, then /transactions/sync) and labels the result honestly.
// Used for Sandbox and live alike, so a successful Link login never shows data from a different item.
import type { Profile, Txn } from "./types";

export type LinkResult =
  | { kind: "data"; txns: Txn[]; balances: Profile["balances"]; source: string }
  | { kind: "empty" | "pending"; message: string }
  | { kind: "error"; message: string };

export async function finishPlaidLink(publicToken: string, opts: { institution?: string; sandbox: boolean }, fetcher: typeof fetch = fetch): Promise<LinkResult> {
  const bank = opts.institution || "your bank";
  let r: Response;
  try {
    r = await fetcher("/api/plaid/exchange", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ public_token: publicToken }) });
  } catch {
    return { kind: "error", message: "Couldn't reach the server to finish connecting. Try again." };
  }
  const j = (await r.json().catch(() => ({}))) as { error?: string; txns?: Txn[]; balances?: Profile["balances"]; complete?: boolean };
  if (!r.ok) return { kind: "error", message: j.error || "Couldn't connect the bank. Try again." };
  const txns = j.txns || [];
  if (!txns.length) return { kind: "empty", message: `Connected to ${bank}, but it hasn't sent any transactions yet. Try again in a minute.` };
  // A tax estimate on part of the year would read too low, so an incomplete history is a "try again", not a result.
  if (j.complete !== true) return { kind: "pending", message: `Connected to ${bank}, but Plaid is still loading earlier transactions. Try again in a minute.` };
  const source = opts.sandbox ? `Plaid Sandbox · ${bank} (test bank, fictional data)` : `Your bank via Plaid · ${bank}`;
  return { kind: "data", txns, balances: j.balances || [], source };
}
