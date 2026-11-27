// The knowledge files must rebuild exactly the constants the live page uses, and every table
// must say where it comes from and when it was last checked.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { loadLegacy } from "../baseline/legacy.mjs";
import * as engine from "../src/index.ts";

const legacy = loadLegacy();
const plain = (x: unknown) => JSON.parse(JSON.stringify(x));
for (const k of ["TIB", "GIB", "TB", "VENDORS", "DIMMS", "NVME_TB", "TIER_MAX_GIB", "HOST_RAM_MAX_GB", "HOST_LCPU_MAX", "PROFILES", "VCENTER", "NSXMGR",
  "EDGE", "WITNESS", "OPSNET", "SUPERVISOR", "ADDON", "DEFAULTS", "CLUSTER_DEFAULTS", "POL", "COLS", "HCOLS"])
  test(`knowledge matches the page: ${k}`, () => assert.deepStrictEqual(plain((engine as Record<string, unknown>)[k]), plain(legacy[k])));

const dir = new URL("../knowledge/", import.meta.url);
for (const f of readdirSync(dir).filter(f => f.endsWith(".json"))) test(`knowledge/${f}: every table has a source and a verified date`, () => {
  const j = JSON.parse(readFileSync(new URL(f, dir), "utf8"));
  assert.ok(j.about);
  for (const [name, t] of Object.entries(j.tables as Record<string, { source: string; verified: string; data: unknown }>)) {
    assert.ok(t.source, `${name}: source`);
    assert.match(t.verified, /^\d{4}-\d{2}-\d{2}$/, `${name}: verified`);
    assert.ok(t.data !== undefined, `${name}: data`);
  }
});
