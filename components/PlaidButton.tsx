"use client";

import { useCallback, useEffect, useState } from "react";
import { usePlaidLink, type PlaidLinkError, type PlaidLinkOnSuccessMetadata } from "react-plaid-link";
import { finishPlaidLink } from "@/lib/plaidLink";
import type { Profile, Txn } from "@/lib/types";

/**
 * Opens the real Plaid Link window (bank search, logos, login). After a successful login it exchanges the public_token for the
 * account the person picked and imports that item's transactions (lib/plaidLink.ts), in Sandbox (fictional test data) and live alike.
 * The separate fictional sample business is offered elsewhere (payment apps, landing), never in place of this connection.
 * Link (and Plaid's script from cdn.plaid.com) only loads after the button is pressed and a link token exists.
 */
export function PlaidButton({ onData, sandbox = true, label = "Connect with Plaid", primary = true }: {
  onData: (d: { txns: Txn[]; balances: Profile["balances"]; source: string }) => void;
  sandbox?: boolean;
  label?: string;
  primary?: boolean;
}) {
  const [token, setToken] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const onSuccess = useCallback(async (public_token: string, meta: PlaidLinkOnSuccessMetadata) => {
    setToken(null);
    setBusy(true); setMsg("Pulling your transactions…");
    try {
      const res = await finishPlaidLink(public_token, { institution: meta.institution?.name || undefined, sandbox });
      if (res.kind !== "data") { setMsg(res.message); return; }
      setMsg("");
      onData({ txns: res.txns, balances: res.balances, source: res.source });
    } finally { setBusy(false); }
  }, [onData, sandbox]);

  // Plaid passes an error when Link itself failed; a plain cancel has none and stays silent.
  const onExit = useCallback((err: PlaidLinkError | null) => {
    setToken(null); setBusy(false);
    if (err) setMsg(err.display_message || err.error_message || "Plaid stopped before connecting. Try again.");
  }, []);
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
function LinkOpener({ token, onSuccess, onExit, onLoadError }: { token: string; onSuccess: (t: string, m: PlaidLinkOnSuccessMetadata) => void; onExit: (err: PlaidLinkError | null) => void; onLoadError: () => void }) {
  const { open, ready, error } = usePlaidLink({ token, onSuccess, onExit });
  useEffect(() => { if (ready) open(); }, [ready, open]);
  useEffect(() => { if (error) onLoadError(); }, [error, onLoadError]);
  return null;
}
