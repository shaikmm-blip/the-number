// "Upload a CSV instead": read statement files in the browser, through the same normalize → classify path
// the sample statements use, and summarize them for a preview before anything counts. Nothing is sent anywhere.
import { classify } from "./classify";
import { normalize } from "./csv";
import type { Kind, Txn } from "./types";

export const MAX_FILE_BYTES = 2_000_000; // 2 MB per file; a year of bank exports is far smaller
export const MAX_FILES = 6;

export interface UploadFile { name: string; text: string; size: number }
export interface UploadPreview {
  files: { name: string; source: string; rows: number }[];
  txns: Txn[];
  rows: number;
  first: string;
  last: string;
  inCents: number;
  outCents: number;
  byKind: Record<Kind, number>;
}

export function readUploads(files: UploadFile[]): UploadPreview {
  if (!files.length) throw new Error("Choose at least one CSV file.");
  if (files.length > MAX_FILES) throw new Error(`That's ${files.length} files. Upload up to ${MAX_FILES} at a time.`);
  const out: UploadPreview["files"] = [];
  const txns: Txn[] = [];
  const seen = new Map<string, string>();
  files.forEach((f, n) => {
    if (!/\.csv$/i.test(f.name)) throw new Error(`${f.name} isn't a CSV file. Export your statement as CSV and try again.`);
    if (f.size > MAX_FILE_BYTES) throw new Error(`${f.name} is over 2 MB. Export a shorter date range and try again.`);
    if (!f.text.trim()) throw new Error(`${f.name} is empty.`);
    // The same statement chosen twice would count every row twice.
    const same = seen.get(f.text); if (same) throw new Error(`${f.name} and ${same} are the same file. Choose each statement once.`);
    seen.set(f.text, f.name);
    let raw: ReturnType<typeof normalize>;
    try { raw = normalize(f.text, f.name); }
    catch (e) {
      const m = (e as Error).message;
      if (/^Not a money amount/.test(m)) throw new Error(`${f.name} has an amount we couldn't read (${m.replace("Not a money amount: ", "")}). Amounts should look like 12.50 or -12.50.`);
      if (/^Unrecognized date/.test(m)) throw new Error(`${f.name} has a date we couldn't read (${m.replace("Unrecognized date: ", "")}). Dates should look like 2026-03-15 or 03/15/2026.`);
      if (m.startsWith("This file has no transactions")) throw new Error(`${f.name} has no transactions. ${m.replace("This file has no transactions. ", "")}`);
      if (m.startsWith("We couldn't read")) throw new Error(m);
      // Anything else (a column the format needs is missing or empty) gets a plain message, not a JavaScript error.
      throw new Error(`We couldn't read ${f.name}: a column it needs is missing or empty. Export the full statement as CSV and try again.`);
    }
    // File number in the id, so two exports of the same kind can't collide.
    const tagged = raw.map((t) => classify({ ...t, id: `u${n}-${t.id}` }));
    out.push({ name: f.name, source: tagged[0]?.source ?? "", rows: tagged.length });
    txns.push(...tagged);
  });
  const dates = txns.map((t) => t.date).sort();
  const byKind = { business_income: 0, business_expense: 0, personal: 0, transfer: 0, tax_payment: 0, review: 0 } as Record<Kind, number>;
  for (const t of txns) byKind[t.kind]++;
  return {
    files: out, txns, rows: txns.length, first: dates[0], last: dates[dates.length - 1],
    inCents: txns.filter((t) => t.amountCents > 0).reduce((s, t) => s + t.amountCents, 0),
    outCents: txns.filter((t) => t.amountCents < 0).reduce((s, t) => s - t.amountCents, 0),
    byKind,
  };
}
