"use client";

import { useCallback, useEffect, useState } from "react";
import { usePlaidLink, type PlaidLinkOnSuccessMetadata } from "react-plaid-link";
import type { Profile, Txn } from "@/lib/types";

/**
 * Opens the real Plaid Link window (bank search, logos, login).
 * Live mode: exchanges the token and pulls that bank's transactions.
 * Sandbox mode (`onSandbox` given): after a successful test login, loads our full-year fictional sample business through
 * Plaid Sandbox (/api/plaid/demo), because Plaid's built-in test users don't have a realistic year of business income.
 * The app labels that data as a sample, not as the bank account picked in Link.
 * Link (and Plaid's script from cdn.plaid.com) only loads after the button is pressed and a link token exists.
 */
export function PlaidButton({ onData, onSandbox, label = "Connect with Plaid", primary = true }: {
  onData?: (d: { txns: Txn[]; balances: Profile["balances"] }) => void;
  onSandbox?: (institution: string) => void;
  label?: string;
  primary?: boolean;
}) {
  const [token, setToken] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const onSuccess = useCallback(async (public_token: string, meta: PlaidLinkOnSuccessMetadata) => {
    setToken(null);
    if (onSandbox) { onSandbox(meta.institution?.name || "your bank"); return; }
    setBusy(true); setMsg("Pulling your transactions…");
    try {
      const r = await fetch("/api/plaid/exchange", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ public_token }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setMsg((j as { error?: string }).error || "Couldn't connect the bank. Try again."); return; }
      setMsg("");
      onData?.(j as { txns: Txn[]; balances: Profile["balances"] });
    } catch {
      setMsg("Couldn't reach the server to finish connecting. Try again.");
    } finally { setBusy(false); }
  }, [onData, onSandbox]);

  const onExit = useCallback(() => { setToken(null); setBusy(false); }, []);
  const onLoadError = useCallback(() => { setToken(null); setBusy(false); setMsg("Plaid couldn't load. Check your connection and try again."); }, []);

  async function start() {
    setMsg(""); setBusy(true);
    try {
      const r = await fetch("/api/plaid/link-token", { method: "POST" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !(j as { link_token?: string }).link_token) throw new Error((j as { error?: string }).error || "Couldn't open Plaid. Try again.");
      setToken((j as { link_token: string }).link_token);
    } catch (e) { setMsg((e as Error).message || "Couldn't open Plaid. Try again."); }
    setBusy(false);
  }

  return (
    <div className="flex flex-col gap-2">
      <button className={`btn w-full !rounded-xl !py-3.5 ${primary ? "btn-primary" : "btn-ghost"}`} onClick={start} disabled={busy || !!token} aria-busy={busy || !!token || undefined}>{busy || token ? "Opening…" : label}</button>
      {token && <LinkOpener token={token} onSuccess={onSuccess} onExit={onExit} onLoadError={onLoadError} />}
      {msg && <span className="text-xs" style={{ color: "var(--muted)" }} role="status">{msg}</span>}
    </div>
  );
}

// Mounted only while a link token exists, so Plaid's script isn't requested until someone presses the button.
function LinkOpener({ token, onSuccess, onExit, onLoadError }: { token: string; onSuccess: (t: string, m: PlaidLinkOnSuccessMetadata) => void; onExit: () => void; onLoadError: () => void }) {
  const { open, ready, error } = usePlaidLink({ token, onSuccess, onExit });
  useEffect(() => { if (ready) open(); }, [ready, open]);
  useEffect(() => { if (error) onLoadError(); }, [error, onLoadError]);
  return null;
}
