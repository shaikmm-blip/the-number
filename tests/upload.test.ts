import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { classify } from "../lib/classify";
import { normalize } from "../lib/csv";
import { DEMO_PROFILE } from "../lib/demo";
import { computeNumber } from "../lib/number";
import { MAX_FILE_BYTES, readUploads, type UploadFile } from "../lib/upload";

const fx = (name: string): UploadFile => { const text = readFileSync(`tests/fixtures/upload/${name}`, "utf8"); return { name, text, size: Buffer.byteLength(text) }; };
const profile = { ...DEMO_PROFILE, parentRule: undefined, bills: [], balances: [], asOf: "2026-11-12" };

describe("CSV upload", () => {
  for (const [file, source, rows] of [["chase.csv", "Chase", 3], ["cashapp.csv", "Cash App", 2], ["venmo.csv", "Venmo", 2], ["generic.csv", "generic.csv", 2]] as const) {
    it(`reads a ${source} export`, () => {
      const p = readUploads([fx(file)]);
      expect(p.files).toEqual([{ name: file, source, rows }]);
      expect(p.rows).toBe(rows);
      expect(Object.values(p.byKind).reduce((a, b) => a + b, 0)).toBe(rows);
    });
  }

  it("totals after upload equal the same rows through the existing normalize → classify path", () => {
    const names = ["chase.csv", "cashapp.csv", "venmo.csv", "generic.csv"];
    const viaUpload = computeNumber(readUploads(names.map(fx)).txns, profile);
    const viaExisting = computeNumber(names.flatMap((n) => normalize(fx(n).text, n)).map(classify), profile);
    for (const k of ["incomeCents", "expensesCents", "netProfitCents", "owedSoFarCents", "taxPaidCents"] as const) expect(viaUpload[k]).toBe(viaExisting[k]);
    expect(viaUpload.fed.totalTaxCents).toBe(viaExisting.fed.totalTaxCents);
  });

  it("the four fixtures give a known headline (used by the browser check)", () => {
    const r = computeNumber(readUploads(["chase.csv", "cashapp.csv", "venmo.csv", "generic.csv"].map(fx)).txns, profile);
    expect([r.owedSoFarCents, r.netProfitCents]).toEqual([11_681, 82_670]); // $116.81 estimated tax on $826.70 profit
  });

  it("summarizes rows, dates and money in/out for the preview", () => {
    const p = readUploads([fx("chase.csv"), fx("venmo.csv")]);
    expect(p.rows).toBe(5);
    expect([p.first, p.last]).toEqual(["2026-03-02", "2026-05-09"]);
    expect(p.inCents).toBe(25_000 + 32_000);
    expect(p.outCents).toBe(4_120 + 1_376 + 1_850);
  });

  it("two exports of the same kind do not share transaction ids", () => {
    const other = fx("chase.csv"); other.text = other.text.replace("250.00", "260.00");
    const p = readUploads([fx("chase.csv"), { ...other, name: "chase-2.csv" }]);
    expect(new Set(p.txns.map((t) => t.id)).size).toBe(p.txns.length);
  });

  it("explains an unsupported layout", () => { expect(() => readUploads([fx("unsupported.csv")])).toThrow(/couldn't read unsupported\.csv.*Chase, Cash App, Venmo/); });
  it("explains an unreadable amount", () => { expect(() => readUploads([fx("bad-amount.csv")])).toThrow(/bad-amount\.csv has an amount we couldn't read/); });
  it("explains an empty file", () => { expect(() => readUploads([fx("empty.csv")])).toThrow(/empty\.csv is empty/); });
  it("explains a file with only a header", () => { expect(() => readUploads([fx("header-only.csv")])).toThrow(/header-only\.csv has no transactions/); });
  it("rejects an oversized file (a real 2 MB+ CSV)", () => {
    const row = "2026-06-01,Gutter cleaning job,150.00\n"; const text = "date,description,amount\n" + row.repeat(Math.ceil((MAX_FILE_BYTES + 1) / row.length));
    expect(Buffer.byteLength(text)).toBeGreaterThan(MAX_FILE_BYTES);
    expect(() => readUploads([{ name: "big.csv", text, size: Buffer.byteLength(text) }])).toThrow(/big\.csv is over 2 MB/);
  });
  it("refuses the same statement chosen twice", () => { expect(() => readUploads([fx("chase.csv"), { ...fx("chase.csv"), name: "copy.csv" }])).toThrow(/copy\.csv and chase\.csv are the same file/); });
  it("explains a file whose format matches but a needed column is missing", () => { expect(() => readUploads([{ name: "cash.csv", text: "Transaction ID,Net Amount\nT1,10.00\n", size: 30 }])).toThrow(/couldn't read cash\.csv: a column it needs is missing/); });
  it("all-personal and tax-only uploads give a $0 estimate", () => {
    const allPersonal = computeNumber(readUploads([{ name: "p.csv", text: "date,description,amount\n2026-05-01,CHIPOTLE 2291,-13.76\n", size: 60 }]).txns, profile);
    expect(allPersonal.owedSoFarCents).toBe(0);
    const taxOnly = computeNumber(readUploads([{ name: "t.csv", text: "date,description,amount\n2026-04-15,IRS USATAXPYMT,-500.00\n", size: 60 }]).txns, profile);
    expect([taxOnly.owedSoFarCents, taxOnly.taxPaidCents]).toEqual([0, 50_000]);
  });
  it("rejects a file that is not a CSV", () => { expect(() => readUploads([{ name: "statement.pdf", text: "%PDF", size: 4 }])).toThrow(/isn't a CSV/); });
  it("asks for a file when none is given", () => { expect(() => readUploads([])).toThrow(/Choose at least one/); });
});
