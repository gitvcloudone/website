// RVTools inputs for the golden cases: the fake exports, and (on David's Mac only) real .xlsx
// files listed in engine/test/private.local.json, read the same way the page reads them.
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { basename } from "node:path";
import { fakeExports } from "../fixtures/fake-rvtools.mjs";
import { PRIVATE_DESIGNS } from "../fixtures/cases.mjs";

export const PRIVATE_CONFIG = fileURLToPath(new URL("../test/private.local.json", import.meta.url));
export const SHEETS = ["vInfo", "vHost", "vDisk", "vPartition", "vCPU", "vMemory"];

export async function readXlsx(path) {
  let XLSX;
  try { XLSX = (await import("xlsx")).default; } catch { throw new Error("SheetJS (xlsx 0.18.5) isn't installed: run npm install"); }
  const wb = XLSX.read(new Uint8Array(readFileSync(path)), { type: "array", sheets: SHEETS, dense: true });
  const rows = (n) => wb.Sheets[n] ? XLSX.utils.sheet_to_json(wb.Sheets[n], { defval: null }) : null;
  return { fileName: basename(path), ...Object.fromEntries(SHEETS.map(n => [n, rows(n)])) };
}

// { "rvtools": { "<label>": "/absolute/path.xlsx", ... } } → cases: each file alone and all together, through each private design
export async function privateCases() {
  if (!existsSync(PRIVATE_CONFIG)) return null;
  const cfg = JSON.parse(readFileSync(PRIVATE_CONFIG, "utf8"));
  const files = {};
  for (const [label, path] of Object.entries(cfg.rvtools || {})) files[label] = await readXlsx(path);
  const labels = Object.keys(files), sets = labels.map(l => [l]);
  if (labels.length > 1) sets.push(labels);
  const cases = [];
  for (const set of sets) for (const d of PRIVATE_DESIGNS) cases.push({ name: `private-${set.join("+")}-${d.suffix}`, settings: d.settings, hostTypes: d.hostTypes, topo: d.topo,
    rvtools: { files: set, scope: d.scope } });
  return { files, cases };
}

export const fakeFiles = () => fakeExports();
