// Security checks for the whole site: no third-party scripts (the spreadsheet reader is served from this
// site, pinned to a fixed SheetJS release), and the RVTools reading path is tested with real .xlsx files.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import * as XLSX from "xlsx";
import { fakeExports } from "../fixtures/fake-rvtools.mjs";
import { SHEETS } from "../baseline/rvtools-files.mjs";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
/** The SheetJS file the pages load: this exact release, these exact bytes. 0.20.2+ fixes CVE-2023-30533 and CVE-2024-22363. */
export const SHEETJS = { path: "assets/vendor/xlsx-0.20.3.full.min.js", version: "0.20.3",
  sha384: "EnyY0/GSHQGSxSgMwaIPzSESbqoOLSexfnSMN2AP+39Ckmn92stwABZynq1JyzdT" };

const htmlFiles = (dir: string): string[] => readdirSync(dir).flatMap(f => {
  if (f.startsWith(".") || f === "node_modules") return [];
  const p = join(dir, f); return statSync(p).isDirectory() ? htmlFiles(p) : f.endsWith(".html") ? [p] : [];
});

test("no page on the site loads a script from another site", () => {
  const files = htmlFiles(ROOT); assert.ok(files.length > 20, "walked the site");
  const external = files.flatMap(f => [...readFileSync(f, "utf8").matchAll(/<script\b[^>]*\bsrc="((?:https?:)?\/\/[^"]+)"/gi)].map(m => `${f.slice(ROOT.length)}: ${m[1]}`));
  assert.deepStrictEqual(external, [], "serve scripts from this site (assets/vendor/) instead");
});

test("the spreadsheet reader is this site's pinned copy of a fixed SheetJS release, on every page that reads RVTools", () => {
  const buf = readFileSync(join(ROOT, SHEETJS.path));
  assert.equal(createHash("sha384").update(buf).digest("base64"), SHEETJS.sha384, "the vendored file changed: re-verify it against the official release");
  assert.match(buf.toString("utf8", 0, 200), /SheetJS/); assert.ok(buf.includes(`.version="${SHEETJS.version}"`));
  assert.equal(XLSX.version, SHEETJS.version, "the tests read RVTools with the same release the pages load");
  assert.ok(readFileSync(join(ROOT, "node_modules/xlsx/dist/xlsx.full.min.js")).equals(buf), "same bytes as the package the tests use");
  for (const p of ["vcf-design-studio", "vcf-design-studio-ai", "vcf-sizing", "evs-sizing", "vmc-sizing"])
    assert.match(readFileSync(join(ROOT, p, "index.html"), "utf8"), new RegExp(`<script src="/${SHEETJS.path.replace(/\./g, "\\.")}"></script>`), p);
});

test("RVTools .xlsx files read back exactly: every row of every sample export, through a real spreadsheet file", () => {
  let rows = 0;
  for (const [label, f] of Object.entries(fakeExports()) as [string, Record<string, unknown>][]) {
    const wb = XLSX.utils.book_new();
    for (const s of SHEETS) if (Array.isArray(f[s])) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(f[s] as object[]), s);
    if (!wb.SheetNames.length) continue;
    const back = XLSX.read(XLSX.write(wb, { type: "array", bookType: "xlsx" }), { type: "array", sheets: SHEETS, dense: true });   // as the page reads it
    for (const s of SHEETS) {
      const got = back.Sheets[s] ? XLSX.utils.sheet_to_json(back.Sheets[s], { defval: null }) : null;
      assert.deepStrictEqual(got, Array.isArray(f[s]) ? f[s] : null, `${label} ${s}`); rows += got?.length || 0;
    }
  }
  assert.ok(rows > 1000, `${rows} rows checked`);
});
