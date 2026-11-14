// Estimate summary with optional itemized activity. Built from the same calculationSteps() list the screen shows,
// so the two cannot disagree. It summarizes an estimate; it is not a return and nobody has reviewed it.
import type { jsPDF as JsPDF } from "jspdf";
import type { NumberResult } from "./number";
import { assumptionLine, calculationSteps, sourceLink, type SourceKey } from "./steps";
import { TAX_YEAR } from "./taxConfig";
import type { Txn } from "./types";
import { isTypedTotal } from "./entry";

// The PDF's built-in Helvetica has no Unicode minus sign, so amounts use a plain hyphen here.
export const pdfUSD = (cents: number) => `${cents < 0 ? "-" : ""}$${(Math.abs(cents) / 100).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;

// Built-in Helvetica only has Latin-1 glyphs. Anything else (a name typed in another script) is shown as "?" rather than garbled.
export const safe = (t: string) => t.replace(/[^\x20-\x7E -ÿ—–’“”]/g, "?").slice(0, 160);

export interface PdfMeta { name?: string; business?: string; source: string; generated: Date; nextDue?: string }

export const isQuickBooksMonthlyEntry = (t: Txn) => t.source === "QuickBooks" && t.reason === "From your QuickBooks Profit & Loss.";

export function buildEstimatePdf(doc: JsPDF, r: NumberResult, meta: PdfMeta, transactions?: readonly Txn[]): JsPDF {
  const M = 48, R = 564, BOTTOM = 770;
  let y = 52;
  const ink = (g: number) => doc.setTextColor(g, g, g);
  const font = (size: number, bold = false) => { doc.setFont("helvetica", bold ? "bold" : "normal"); doc.setFontSize(size); };
  const room = (h: number) => { if (y + h > BOTTOM) { doc.addPage(); y = 58; } };
  const date = meta.generated.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

  font(18, true); ink(10); doc.text("The Number: estimated tax summary", M, y); y += 16;
  font(9.5); ink(90);
  doc.text(`Tax year ${TAX_YEAR}  ·  Generated ${date}  ·  An estimate summary, not a tax return`, M, y); y += 13;
  const who = [meta.name, meta.business].filter(Boolean).map((t) => safe(String(t))).join("  ·  ");
  const block = (t: string) => { const w = doc.splitTextToSize(t, R - M); doc.text(w, M, y); y += w.length * 12; };
  if (who) block(`Prepared for: ${who}`);
  block(`Data source: ${safe(meta.source)}`); y += 8;

  font(10); ink(90); doc.text("Estimated tax you owe", M, y); y += 22;
  font(26, true); ink(10); doc.text(pdfUSD(r.owedSoFarCents), M, y);
  if (meta.nextDue) { font(10); ink(90); doc.text(`Next due date ${meta.nextDue}`, R, y, { align: "right" }); }
  y += 22;

  const heading = (t: string) => { room(30); font(11, true); ink(10); doc.text(t, M, y); y += 4; doc.setDrawColor(210); doc.line(M, y, R, y); y += 12; };
  const row = (label: string, cents: number, bold = false, note?: string) => {
    room(note ? 18 : 12);
    font(9.5, bold); ink(bold ? 10 : 40); doc.text(label, M, y); doc.text(pdfUSD(cents), R, y, { align: "right" }); y += note ? 9 : 12;
    if (note) { font(7.5); ink(120); const w = doc.splitTextToSize(note, R - M - 8); doc.text(w, M + 8, y); y += 9 * w.length; }
  };

  heading("Inputs");
  row("Business income", r.incomeCents);
  row("Business costs", -r.expensesCents);
  row("Business profit", r.netProfitCents, true);
  if (r.wagesCents > 0) row("Paycheck wages (expected; tax on them assumed covered by withholding)", r.wagesCents);
  y += 4;

  const cited = new Set<SourceKey>();
  for (const g of calculationSteps(r)) {
    heading(g.title === "Estimated tax you owe" ? "Total" : `How the estimate adds up: ${g.title.toLowerCase()}`);
    for (const s of g.steps) { if (s.source) cited.add(s.source); row(s.label, s.amountCents, s.kind !== "part" && s.kind !== "input", s.rule === "From above." ? undefined : s.rule); }
    y += 7;
  }

  heading("Payments counted");
  font(9); ink(40);
  doc.text(r.taxPaidCents > 0 ? `${pdfUSD(r.taxPaidCents)} of payments to the IRS found in the data for ${TAX_YEAR}, subtracted above.` : `No payments to the IRS were found in the data for ${TAX_YEAR}.`, M, y); y += 18;

  heading("Assumptions and exclusions");
  font(8.5); ink(40);
  for (const line of [assumptionLine(r), "Not included: state and local tax, other income, credits, and any underpayment penalty.", "Educational estimate, not tax advice. Not reviewed by a CPA or the IRS. Check the amount before paying."]) {
    const wrapped = doc.splitTextToSize(line, R - M); room(wrapped.length * 10); doc.text(wrapped, M, y); y += wrapped.length * 10 + 1;
  }
  y += 6;

  heading("Sources (checked November 12, 2026)");
  font(8); ink(40);
  for (const k of cited) { const s = sourceLink(k); const w = doc.splitTextToSize(`${s.title}: ${s.url}`, R - M); room(w.length * 9); doc.text(w, M, y); y += w.length * 9; }
  if (transactions) appendItemizedActivity(doc, r, meta, transactions);
  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    doc.setPage(page); font(8); ink(100);
    doc.text(`The Number | Educational estimate | Tax year ${TAX_YEAR}`, M, 780);
    doc.text(`Page ${page} of ${pages}`, R, 780, { align: "right" });
  }
  return doc;
}

function appendItemizedActivity(doc: JsPDF, r: NumberResult, meta: PdfMeta, transactions: readonly Txn[]) {
  const M = 48, R = 564, DETAIL = 118, DETAIL_WIDTH = 310, BOTTOM = 738;
  let y = 50;
  const font = (size: number, bold = false, gray = 35) => {
    doc.setFont("helvetica", bold ? "bold" : "normal"); doc.setFontSize(size); doc.setTextColor(gray, gray, gray);
  };
  const label = (s: string) => safe(s).trim() + (s.length > 160 ? "..." : "");
  const newPage = () => {
    doc.addPage(); y = 50;
    font(17, true, 10); doc.text("Itemized activity", M, y); y += 18;
    font(9, false, 90); doc.text(`Tax year ${TAX_YEAR} | Through ${r.asOf} | Amounts in USD`, M, y); y += 14;
    const source = doc.splitTextToSize(`Data source: ${safe(meta.source)}`, R - M);
    doc.text(source, M, y); y += source.length * 12 + 14;
  };
  const room = (height: number) => { if (y + height > BOTTOM) newPage(); };
  const paragraph = (text: string) => {
    font(9); const lines = doc.splitTextToSize(text, R - M); room(lines.length * 12 + 8);
    font(9); doc.text(lines, M, y); y += lines.length * 12 + 8;
  };
  const heading = (text: string, bodyHeight = 30) => {
    room(25 + bodyHeight); font(11, true, 10); doc.text(text, M, y);
    doc.setDrawColor(215); doc.line(M, y + 6, R, y + 6); y += 24;
  };
  const subtotal = (text: string, amount: number) => {
    room(24); font(9.5, true); doc.text(text, M, y); doc.text(pdfUSD(amount), R, y, { align: "right" }); y += 24;
  };
  // Use exactly the engine's date boundary and tags; do not reclassify or recalculate tax.
  const inPeriod = transactions.filter(t => t.date.startsWith(String(TAX_YEAR)) && t.date <= r.asOf)
    .slice().sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  const income = inPeriod.filter(t => t.kind === "business_income" || (t.kind === "review" && t.amountCents > 0));
  const costs = inPeriod.filter(t => t.kind === "business_expense");
  const payments = inPeriod.filter(t => t.kind === "tax_payment");
  const pending = inPeriod.filter(t => t.kind === "review" && t.amountCents <= 0);
  const personal = inPeriod.filter(t => t.kind === "personal").length;
  const transfers = inPeriod.filter(t => t.kind === "transfer").length;
  const outside = transactions.length - inPeriod.length;

  newPage();
  paragraph("Supporting detail for the estimate on page 1. This is not an invoice or an IRS bill. Positive amounts are money in; negative amounts are money out.");
  if (inPeriod.some(isTypedTotal)) paragraph("Typed-in rows are totals for the year so far that you entered yourself, not individual transactions. They have no dates, so none is shown.");
  if (inPeriod.some(isQuickBooksMonthlyEntry)) paragraph("QuickBooks rows are monthly Profit & Loss totals, not individual transactions. Their dates are period-end dates, capped at the import date for an unfinished period.");
  paragraph(`This report itemizes ${income.length + costs.length + payments.length + pending.length} rows. Not itemized or counted: ${personal} personal rows, ${transfers} transfers, and ${outside} rows outside the reporting period.`);
  paragraph("Tags follow the app's current classifications and can be wrong. Review deposits are counted as business income; review outflows are not counted. Tax-payment tags are not verified payment receipts. Long descriptions end with ... when shortened.");

  heading("Business costs by category");
  if (!r.topCategories.length) paragraph("No business costs are counted in this period.");
  for (const category of r.topCategories) {
    font(9.5); const lines = doc.splitTextToSize(label(category.category), 350);
    room(lines.length * 12 + 8); font(9.5);
    doc.text(lines, M, y); doc.text(pdfUSD(category.amountCents), R, y, { align: "right" }); y += lines.length * 12 + 8;
  }
  subtotal("Total business costs", r.expensesCents);

  const columns = () => {
    font(8, true, 85); doc.text("DATE", M, y); doc.text("DESCRIPTION / SOURCE / TAG", DETAIL, y);
    doc.text("AMOUNT (USD)", R, y, { align: "right" }); y += 18;
  };
  const table = (title: string, entries: Txn[], totalLabel: string, total?: number) => {
    heading(`${title} (${entries.length})`, entries.length ? 64 : 24);
    if (!entries.length) { paragraph("No rows in this period."); return; }
    columns();
    for (const t of entries) {
      const tag = t.kind === "review"
        ? (t.amountCents > 0 ? "NEEDS REVIEW - counted as income" : "NEEDS REVIEW - not counted")
        : t.kind === "tax_payment" ? "Tagged tax payment - not verified"
        : isQuickBooksMonthlyEntry(t) ? "Monthly Profit & Loss total" : isTypedTotal(t) ? "Typed-in total, year so far" : label(t.category || (t.kind === "business_income" ? "Business income" : "Other"));
      font(9.5); const desc = doc.splitTextToSize(label(t.description || "(No description)"), DETAIL_WIDTH);
      font(8.5); const detail = doc.splitTextToSize(`${label(t.source)} | ${tag}${t.userSet ? " | User selected" : ""}`, DETAIL_WIDTH);
      const height = desc.length * 12 + detail.length * 11 + 12;
      if (y + height > BOTTOM) { newPage(); heading(`${title} (continued)`, height + 18); columns(); }
      font(9.5); doc.text(isTypedTotal(t) ? "no date" : safe(t.date), M, y); doc.text(desc, DETAIL, y);
      doc.text(pdfUSD(t.amountCents), R, y, { align: "right" }); y += desc.length * 12;
      font(8.5, false, 90); doc.text(detail, DETAIL, y); y += detail.length * 11;
      doc.setDrawColor(235); doc.line(M, y, R, y); y += 12;
    }
    if (total !== undefined) subtotal(totalLabel, total);
  };
  table("Income counted", income, "Total income counted", r.incomeCents);
  table("Business costs counted", costs, "Total cost entries (money out)", -r.expensesCents);
  if (payments.length) table("Payments counted", payments, "Net payment entries (money out)", -r.taxPaidCents);
  if (pending.length) table("Other rows needing review", pending, "");
}
