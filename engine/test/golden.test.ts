// Golden tests: every engine listed here must reproduce the locked outputs in engine/golden/
// (recorded from the live page's engine by engine/baseline/record.mjs).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { loadLegacy } from "../baseline/legacy.mjs";
import { runCase, units } from "../baseline/harness.mjs";
import { CASES } from "../fixtures/cases.mjs";
import { fakeFiles, privateCases } from "../baseline/rvtools-files.mjs";

const gold = (dir: string, name: string) => JSON.parse(readFileSync(new URL(`../${dir}/${name}.json`, import.meta.url), "utf8"));

const ENGINES: Record<string, () => any> = {
  "live page engine (vcf-sizing/index.html)": loadLegacy,
};

const fake = fakeFiles();
for (const [label, load] of Object.entries(ENGINES)) {
  const api = load();
  test(`${label}: units`, () => assert.deepStrictEqual(units(api), gold("golden", "_units")));
  for (const c of CASES) test(`${label}: ${c.name}`, () => assert.deepStrictEqual(runCase(api, c, fake), gold("golden", c.name)));
}

// Real RVTools exports: only where engine/test/private.local.json and SheetJS are present
test("private RVTools cases", async (t) => {
  let priv;
  try { priv = await privateCases(); } catch (e) { t.skip((e as Error).message); return; }
  if (!priv) { t.skip("no engine/test/private.local.json"); return; }
  for (const [label, load] of Object.entries(ENGINES)) {
    const api = load();
    for (const c of priv.cases) await t.test(`${label}: ${c.name}`, () => {
      assert.ok(existsSync(new URL(`../golden-private/${c.name}.json`, import.meta.url)), "run npm run golden:record first");
      assert.deepStrictEqual(runCase(api, c, priv.files), gold("golden-private", c.name));
    });
  }
});
