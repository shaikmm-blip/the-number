// Finishes a Plaid Link session: exchanges the public_token Link returned for the account the person picked
// (/api/plaid/exchange → /item/public_token/exchange, then /transactions/sync) and labels the result honestly.
// Used for Sandbox and live alike, so a successful Link login never shows data from a different item.
// If that item has no transactions yet or is still loading history, retryPlaidSync() checks the SAME item again
// through /api/plaid/sync (its access token stays in an httpOnly cookie); the public token is never exchanged twice.
import type { Profile, Txn } from "./types";

export type LinkResult =
  | { kind: "data"; txns: Txn[]; balances: Profile["balances"]; source: string }
  | { kind: "empty" | "pending"; message: string }
  | { kind: "error"; message: string };

export interface LinkContext { institution?: string; sandbox: boolean }

async function interpret(call: () => Promise<Response>, ctx: LinkContext, failMsg: string): Promise<LinkResult> {
  const bank = ctx.institution || "your bank";
  let r: Response;
  try { r = await call(); } catch { return { kind: "error", message: "Couldn't reach the server to finish connecting. Try again." }; }
  const j = (await r.json().catch(() => ({}))) as { error?: string; txns?: Txn[]; balances?: Profile["balances"]; complete?: boolean };
  if (!r.ok) return { kind: "error", message: j.error || failMsg };
  const txns = j.txns || [];
  if (!txns.length) return { kind: "empty", message: `Connected to ${bank}, but it hasn't sent any transactions yet. Check again in a minute.` };
  // A tax estimate on part of the year would read too low, so an incomplete history is a "check again", not a result.
  if (j.complete !== true) return { kind: "pending", message: `Connected to ${bank}, but Plaid is still loading earlier transactions. Check again in a minute.` };
  const source = ctx.sandbox ? `Plaid Sandbox · ${bank} (test bank, fictional data)` : `Your bank via Plaid · ${bank}`;
  return { kind: "data", txns, balances: j.balances || [], source };
}

/** First finish after Link success: exchange the selected item's public token, then read its transactions. */
export function finishPlaidLink(publicToken: string, ctx: LinkContext, fetcher: typeof fetch = fetch): Promise<LinkResult> {
  return interpret(() => fetcher("/api/plaid/exchange", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ public_token: publicToken }) }), ctx, "Couldn't connect the bank. Try again.");
}

/** "Check again": read the same, already-connected item again (no new Link, no new token exchange). */
export function retryPlaidSync(ctx: LinkContext, fetcher: typeof fetch = fetch): Promise<LinkResult> {
  return interpret(() => fetcher("/api/plaid/sync", { method: "POST" }), ctx, "Couldn't check the bank again. Try again.");
}

/** What "Check again" should point at after a result: keep the connected item unless the import finished,
 *  or the very first exchange failed (then there may be no item, so the person reconnects). A failed retry keeps it. */
export function keepWaiting(res: LinkResult, ctx: LinkContext, fromRetry: boolean): LinkContext | null {
  if (res.kind === "data") return null;
  if (res.kind === "error" && !fromRetry) return null;
  return ctx;
}
