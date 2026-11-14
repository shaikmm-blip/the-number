import { classify } from "./classify";
import type { Txn } from "./types";

// QuickBooks Online (Intuit) — OAuth 2.0 + Profit & Loss report. Sandbox by default.
export const QBO_AUTH = "https://appcenter.intuit.com/connect/oauth2";
export const QBO_TOKEN = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";
export const qboBase = () => ((process.env.QBO_ENV || "").trim().toLowerCase() === "production" ? "https://quickbooks.api.intuit.com" : "https://sandbox-quickbooks.api.intuit.com");

export function qboConfig(origin: string) {
  const id = (process.env.QBO_CLIENT_ID || "").trim(), secret = (process.env.QBO_CLIENT_SECRET || "").trim();
  if (!id || !secret) return null;
  return { id, secret, redirect: (process.env.QBO_REDIRECT_URI || "").trim() || `${origin}/api/qbo/callback` };
}

export const qboNotConfigured = () =>
  Response.json({ error: "QuickBooks isn't set up on this site yet. Pick a payment app below to see a sample business instead." }, { status: 501 });

type Col = { ColTitle?: string; MetaData?: { Name: string; Value: string }[] };
type Row = { group?: string; Summary?: { ColData: { value: string }[] }; Rows?: { Row?: Row[] } };

/** Turns a ProfitAndLoss report (summarized by month) into monthly income/expense entries the tax engine understands. */
export function plToTxns(report: { Columns?: { Column?: Col[] }; Rows?: { Row?: Row[] } }, today: string): Txn[] {
  const cols = report.Columns?.Column || [];
  const meta = (c: Col, k: string) => c.MetaData?.find((m) => m.Name === k)?.Value;
  const rows = report.Rows?.Row || [];
  const sumOf = (groups: string[]) => rows.filter((r) => r.group && groups.includes(r.group)).map((r) => r.Summary?.ColData || []);
  const income = sumOf(["Income", "OtherIncome"]);
  const costs = sumOf(["COGS", "Expenses", "OtherExpenses"]);
  const out: Txn[] = [];
  cols.forEach((c, i) => {
    const end = meta(c, "EndDate");
    if (!end || i === 0 || c.ColTitle === "Total") return;
    const date = end > today ? today : end;
    const label = c.ColTitle || end.slice(0, 7);
    const inc = income.reduce((s, cd) => s + Math.round(Number(cd[i]?.value || 0) * 100), 0);
    const exp = costs.reduce((s, cd) => s + Math.round(Number(cd[i]?.value || 0) * 100), 0);
    if (inc) out.push({ ...classify({ id: `qbo-in-${end}`, date, source: "QuickBooks", description: `Income · ${label}`, counterparty: "QuickBooks", amountCents: inc }), kind: "business_income", category: "Customer payment", reason: "From your QuickBooks Profit & Loss." });
    if (exp) out.push({ ...classify({ id: `qbo-ex-${end}`, date, source: "QuickBooks", description: `Business expenses · ${label}`, counterparty: "QuickBooks", amountCents: -exp }), kind: "business_expense", category: "Business expense", reason: "From your QuickBooks Profit & Loss." });
  });
  return out;
}
