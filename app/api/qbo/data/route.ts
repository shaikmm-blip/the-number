import { cookies } from "next/headers";
import { plToTxns, qboBase } from "@/lib/qbo";
import { TAX_YEAR } from "@/lib/taxConfig";

// Step 3: read this year's Profit & Loss (by month) and turn it into entries the tax engine uses.
export async function GET(req: Request) {
  const at = cookies().get("qbo_at")?.value, realm = cookies().get("qbo_realm")?.value;
  if (!at || !realm) return Response.json({ error: "QuickBooks isn't connected. Connect it again." }, { status: 401 });
  // V5: use the viewer's calendar date when the app sends one (the server's clock is UTC); accept only a real date within a day of now.
  const asked = new URL(req.url).searchParams.get("today") || "";
  const today = /^\d{4}-\d{2}-\d{2}$/.test(asked) && Math.abs(Date.parse(asked + "T12:00:00Z") - Date.now()) < 2 * 86_400_000 ? asked : new Date().toISOString().slice(0, 10);
  const q = new URLSearchParams({ start_date: `${TAX_YEAR}-01-01`, end_date: today, summarize_column_by: "Month", accounting_method: "Cash", minorversion: "75" });
  try {
    const r = await fetch(`${qboBase()}/v3/company/${encodeURIComponent(realm)}/reports/ProfitAndLoss?${q}`, { headers: { Authorization: `Bearer ${at}`, Accept: "application/json" }, cache: "no-store" });
    if (!r.ok) return Response.json({ error: `QuickBooks said ${r.status}. Try connecting again.` }, { status: 502 });
    const report = await r.json();
    return Response.json({ txns: plToTxns(report, today) });
  } catch {
    // Network failure or an unreadable reply: say so plainly instead of an unhandled 500.
    return Response.json({ error: "Couldn't reach QuickBooks. Try connecting again." }, { status: 502 });
  }
}
