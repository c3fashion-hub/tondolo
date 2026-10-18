import { test } from "node:test";
import assert from "node:assert/strict";
import { RateBook } from "../../src/lib/rates.ts";
import { crc32, sheetName, xlsx, zipStore } from "../../src/lib/xlsx.ts";
import { decimal, exportFileName, exportSheets, type ExportInput } from "../../src/lib/export.ts";
import { BUDGETS, DESTINATION, NOTES, PAYMENTS, PEOPLE, RATES, REMINDERS, SUPPLIERS, TODAY, WEDDING_DATE } from "../../src/lib/example/wedding.ts";

const dec = new TextDecoder();

// Reads back a stored (uncompressed) zip: name -> text. Enough to check what we wrote.
function unzip(bytes: Uint8Array): Map<string, string> {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const out = new Map<string, string>();
  let p = 0;
  while (v.getUint32(p, true) === 0x04034b50) {
    const crc = v.getUint32(p + 14, true), size = v.getUint32(p + 18, true), nameLen = v.getUint16(p + 26, true);
    const name = dec.decode(bytes.subarray(p + 30, p + 30 + nameLen));
    const data = bytes.subarray(p + 30 + nameLen, p + 30 + nameLen + size);
    assert.equal(crc32(data), crc, `CRC of ${name}`);
    out.set(name, dec.decode(data));
    p += 30 + nameLen + size;
  }
  assert.equal(v.getUint32(bytes.length - 22, true), 0x06054b50, "end of central directory");
  assert.equal(v.getUint16(bytes.length - 12, true), out.size, "entry count");
  return out;
}

test("crc32 and the zip container are correct", () => {
  assert.equal(crc32(new TextEncoder().encode("hello")), 0x3610a686);
  const files = unzip(zipStore([["a.txt", new TextEncoder().encode("one")], ["b/c.txt", new TextEncoder().encode("two")]]));
  assert.deepEqual([...files], [["a.txt", "one"], ["b/c.txt", "two"]]);
});

test("the workbook has every part Excel needs, with text escaped and numbers exact", () => {
  const files = unzip(xlsx([{ name: "Pay/ments", rows: [["Payment", "Amount"], ["Caterer <deposit> & co", { n: "3360.00" }], ["=HYPERLINK(\"x\")", null]] }]));
  for (const part of ["[Content_Types].xml", "_rels/.rels", "xl/workbook.xml", "xl/_rels/workbook.xml.rels", "xl/styles.xml", "xl/worksheets/sheet1.xml"]) {
    assert.ok(files.has(part), part);
  }
  assert.match(files.get("xl/workbook.xml")!, /<sheet name="Pay ments"/);
  const sheet = files.get("xl/worksheets/sheet1.xml")!;
  assert.match(sheet, /<c r="A2" t="inlineStr"><is><t xml:space="preserve">Caterer &lt;deposit&gt; &amp; co<\/t><\/is><\/c>/);
  assert.match(sheet, /<c r="B2"><v>3360.00<\/v><\/c>/);
  assert.match(sheet, /<c r="A3" t="inlineStr"><is><t xml:space="preserve">=HYPERLINK/, "a formula-looking value stays plain text");
  assert.match(sheet, /<c r="A1" t="inlineStr" s="1">/, "header row bold");
  assert.equal(sheetName("A very long budget line name over thirty-one"), "A very long budget line name ov");
});

const input: ExportInput = {
  names: "Ade & Sam", destination: DESTINATION, weddingDate: WEDDING_DATE, home: "GBP", today: TODAY, role: "owner",
  payments: PAYMENTS, budgets: BUDGETS, suppliers: SUPPLIERS, people: PEOPLE.map((p) => ({ name: p.name, role: p.role })),
  documents: [{ file_name: "fatura-quinta-do-rio.pdf", kind: "invoice", created_at: "2026-06-15T10:00:00Z" }],
  notes: NOTES, reminders: REMINDERS, book: new RateBook(RATES),
};

test("the couple's spreadsheet has every payment in both currencies, plus budget, suppliers and notes", () => {
  const sheets = exportSheets(input);
  assert.deepEqual(sheets.map((s) => s.name), ["About", "Payments", "Budget", "Suppliers", "Documents", "People", "Notes", "Reminders"]);
  const pay = sheets[1].rows;
  assert.equal(pay.length, PAYMENTS.length + 1);
  const caterer = pay.find((r) => r[0] === "Caterer – deposit 30%")!;
  assert.deepEqual(caterer.slice(0, 10), ["Caterer – deposit 30%", "Sabores do Douro", "Catering", "To pay", { n: "3360.00" }, "EUR", { n: "2889.60" }, "Today's rate (a guide)", "2026-10-23", ""]);
  const venue = pay.find((r) => r[0] === "Venue hire – deposit 30%")!;
  assert.deepEqual([venue[3], venue[6], venue[7], venue[14], venue[15]], ["Paid", { n: "7000.00" }, "From your statement", "No", { n: "23" }]);
  assert.equal(pay.find((r) => r[0] === "DJ and sound – deposit")![3], "Estimate");
});

test("family get only their own payments' sheet and People; no budget, suppliers or notes", () => {
  const sheets = exportSheets({ ...input, role: "family", notes: null, reminders: null });
  assert.deepEqual(sheets.map((s) => s.name), ["About", "Payments", "People"]);
});

test("amounts and file names are exact and safe", () => {
  assert.deepEqual(decimal(5, "GBP"), { n: "0.05" });
  assert.deepEqual(decimal(-125050, "EUR"), { n: "-1250.50" });
  assert.deepEqual(decimal(5000, "JPY"), { n: "5000" });
  assert.deepEqual(decimal(1234, "TND"), { n: "1.234" });
  assert.equal(exportFileName("Ade & Sam", "2026-10-18"), "tondolo-ade-sam-2026-10-18.xlsx");
  assert.equal(exportFileName(null, "2026-10-18"), "tondolo-wedding-2026-10-18.xlsx");
});
