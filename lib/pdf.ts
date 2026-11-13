// One-page estimate summary for a CPA. Built from the same calculationSteps() list the screen shows,
// so the two cannot disagree. It summarizes an estimate; it is not a return and nobody has reviewed it.
import type { jsPDF as JsPDF } from "jspdf";
import type { NumberResult } from "./number";
import { ASSUMPTION_LINE, calculationSteps, sourceLink, type SourceKey } from "./steps";
import { TAX_YEAR } from "./taxConfig";

// The PDF's built-in Helvetica has no Unicode minus sign, so amounts use a plain hyphen here.
export const pdfUSD = (cents: number) => `${cents < 0 ? "-" : ""}$${(Math.abs(cents) / 100).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;

// Built-in Helvetica only has Latin-1 glyphs. Anything else (a name typed in another script) is shown as "?" rather than garbled.
export const safe = (t: string) => t.replace(/[^\x20-\x7E -ÿ—–’“”]/g, "?").slice(0, 160);

export interface PdfMeta { name?: string; business?: string; source: string; generated: Date; nextDue?: string }

export function buildEstimatePdf(doc: JsPDF, r: NumberResult, meta: PdfMeta): JsPDF {
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
  for (const line of [ASSUMPTION_LINE, "Not included: state and local tax, other income, credits, and any underpayment penalty.", "Educational estimate, not tax advice. Not reviewed by a CPA or the IRS. Check the amount before paying."]) {
    const wrapped = doc.splitTextToSize(line, R - M); room(wrapped.length * 10); doc.text(wrapped, M, y); y += wrapped.length * 10 + 1;
  }
  y += 6;

  heading("Sources (checked November 12, 2026)");
  font(8); ink(40);
  for (const k of cited) { const s = sourceLink(k); const w = doc.splitTextToSize(`${s.title}: ${s.url}`, R - M); room(w.length * 9); doc.text(w, M, y); y += w.length * 9; }
  return doc;
}
