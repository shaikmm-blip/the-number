"use client";

import { useState } from "react";

/**
 * DEMO REPLICA of the IRS Direct Pay step-1 screen.
 * This is NOT the IRS website. It exists only to demo The Number's "Settle Assist"
 * browser extension, which fills these fields for the user. No data is collected and
 * nothing is submitted. No official IRS seal or branding is used.
 *
 * Field ids (#tn-reason, #tn-apply, #tn-period, #tn-amount) are what the extension targets.
 */
export default function DirectPayReplica() {
  const [submitted, setSubmitted] = useState(false);

  return (
    <div style={{ minHeight: "100vh", background: "#f3f4f6", color: "#1b1b1b", fontFamily: "system-ui, 'Segoe UI', Arial, sans-serif" }}>
      {/* demo ribbon */}
      <div style={{ background: "#b91c1c", color: "#fff", textAlign: "center", fontSize: 13, fontWeight: 700, padding: "7px 12px", letterSpacing: 0.3 }}>
        EXAMPLE REPLICA — not the real IRS. Built to show The Number&apos;s Settle Assist extension.
      </div>

      {/* gov-style header (no official seal) */}
      <header style={{ background: "#112e51", color: "#fff", padding: "14px 20px" }}>
        <div style={{ maxWidth: 880, margin: "0 auto", display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 34, height: 34, borderRadius: 7, background: "#fff", color: "#112e51", display: "grid", placeItems: "center", fontWeight: 800 }}>★</div>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>Direct Pay</div>
            <div style={{ fontSize: 12, opacity: 0.8 }}>Pay your taxes from your bank account — example replica</div>
          </div>
        </div>
      </header>

      {/* step bar */}
      <div style={{ background: "#205493", color: "#fff" }}>
        <div style={{ maxWidth: 880, margin: "0 auto", display: "flex", fontSize: 12.5, fontWeight: 600 }}>
          {["1 Tax Information", "2 Verify Identity", "3 Payment", "4 Review", "5 Confirmation"].map((s, i) => (
            <div key={s} style={{ padding: "10px 14px", background: i === 0 ? "#2e78d2" : "transparent", borderRight: "1px solid rgba(255,255,255,.15)" }}>{s}</div>
          ))}
        </div>
      </div>

      <main style={{ maxWidth: 880, margin: "0 auto", padding: "26px 20px 60px" }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, margin: "4px 0 2px" }}>Step 1: Tax Information</h1>
        <p style={{ color: "#555", fontSize: 14, margin: "0 0 20px" }}>Tell us about the payment you&apos;re making. All fields are required.</p>

        {submitted ? (
          <div style={{ background: "#fff", border: "1px solid #d6d7d9", borderRadius: 4, padding: 24 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#2e8540" }}>This example stops here.</div>
            <p style={{ color: "#555", fontSize: 14, marginTop: 8 }}>
              On the real IRS site you&apos;d continue to verify your identity and enter your bank details. The Number never submits a payment for you — you always do that yourself.
            </p>
            <button onClick={() => setSubmitted(false)} style={btnGhost}>Back</button>
          </div>
        ) : (
          <div style={{ background: "#fff", border: "1px solid #d6d7d9", borderRadius: 4, padding: 24, display: "grid", gap: 20, maxWidth: 560 }}>
            <Field label="Reason for Payment" htmlFor="tn-reason">
              <select id="tn-reason" defaultValue="" style={input}>
                <option value="" disabled>- Select -</option>
                <option>Balance Due</option>
                <option>Estimated Tax</option>
                <option>Extension</option>
                <option>Tax Return or Notice</option>
                <option>Amended Return</option>
              </select>
            </Field>

            <Field label="Apply Payment To" htmlFor="tn-apply">
              <select id="tn-apply" defaultValue="" style={input}>
                <option value="" disabled>- Select -</option>
                <option>Form 1040 - Income Tax</option>
                <option>Form 1040 - Health Care</option>
                <option>MFT 31 Separate Assessment (Form 1040)</option>
                <option>Form 5329 - Retirement Plans/Tax Favored Accounts</option>
                <option>Civil Penalty</option>
                <option>Other</option>
              </select>
            </Field>

            <Field label="Tax Period for Payment" htmlFor="tn-period">
              <select id="tn-period" defaultValue="" style={input}>
                <option value="" disabled>- Select -</option>
                <option>2027</option>
                <option>2026</option>
                <option>2025</option>
                <option>2024</option>
              </select>
            </Field>

            <Field label="Payment Amount" htmlFor="tn-amount">
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 18, color: "#555" }}>$</span>
                <input id="tn-amount" inputMode="decimal" placeholder="0.00" style={{ ...input, maxWidth: 220 }} />
              </div>
            </Field>

            <div style={{ display: "flex", gap: 12, paddingTop: 4 }}>
              <button onClick={() => setSubmitted(true)} style={btnPrimary}>Continue</button>
              <button onClick={() => { (document.getElementById("tn-reason") as HTMLSelectElement).value = ""; }} style={btnGhost}>Cancel</button>
            </div>
          </div>
        )}

        <p style={{ color: "#8a8a8a", fontSize: 11.5, marginTop: 22, maxWidth: 560 }}>
          Example replica for The Number. Not affiliated with, or endorsed by, the Internal Revenue Service. No information entered here is collected or transmitted.
        </p>
      </main>
    </div>
  );
}

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: React.ReactNode }) {
  return (
    <label htmlFor={htmlFor} style={{ display: "block" }}>
      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>{label}</div>
      {children}
    </label>
  );
}

const input: React.CSSProperties = { width: "100%", padding: "9px 11px", fontSize: 15, border: "1px solid #5b616b", borderRadius: 3, background: "#fff", color: "#1b1b1b" };
const btnPrimary: React.CSSProperties = { background: "#205493", color: "#fff", border: "none", borderRadius: 3, padding: "11px 22px", fontSize: 15, fontWeight: 700, cursor: "pointer" };
const btnGhost: React.CSSProperties = { background: "transparent", color: "#205493", border: "none", padding: "11px 8px", fontSize: 15, fontWeight: 600, cursor: "pointer" };
