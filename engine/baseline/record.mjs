// Records golden outputs from the LIVE page engine (vcf-sizing/index.html).
// Run only when the page's sizing intentionally changes, and call the change out in the commit.
//   npm run golden:record
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { loadLegacy } from "./legacy.mjs";
import { runCase, units } from "./harness.mjs";
import { CASES } from "../fixtures/cases.mjs";
import { fakeFiles, privateCases } from "./rvtools-files.mjs";

const dir = (p) => fileURLToPath(new URL(p, import.meta.url));
const write = (d, name, data) => writeFileSync(`${d}/${name}.json`, JSON.stringify(data, null, 1) + "\n");

const api = loadLegacy();
const GOLD = dir("../golden");
rmSync(GOLD, { recursive: true, force: true }); mkdirSync(GOLD, { recursive: true });
const fake = fakeFiles();
for (const c of CASES) write(GOLD, c.name, runCase(api, c, fake));
write(GOLD, "_units", units(api));
console.log(`golden: ${CASES.length} cases + units → engine/golden/`);

let priv = null;
try { priv = await privateCases(); } catch (e) { console.log(`private: skipped (${e.message})`); priv = false; }
if (priv) {
  const PG = dir("../golden-private");
  rmSync(PG, { recursive: true, force: true }); mkdirSync(PG, { recursive: true });
  for (const c of priv.cases) write(PG, c.name, runCase(api, c, priv.files));
  console.log(`private: ${priv.cases.length} cases → engine/golden-private/ (git-ignored)`);
} else if (priv === null) console.log("private: no engine/test/private.local.json, skipped");
