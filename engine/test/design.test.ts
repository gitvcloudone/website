// Design document: every saved "Copy settings" file must load into a design that sizes exactly as
// the live page sizes it after its own Load settings (engine/baseline/legacy-loader.mjs).
import { test } from "node:test";
import assert from "node:assert/strict";
import { openPage } from "../baseline/legacy-loader.mjs";
import { buildInputs, relabel, sizeState } from "../baseline/harness.mjs";
import { CASES } from "../fixtures/cases.mjs";
import { SETTINGS_CASES } from "../fixtures/settings-cases.mjs";
import { fakeFiles } from "../baseline/rvtools-files.mjs";
import * as engine from "../src/index.ts";

const ALL_KEYS = Object.values(engine.SECTION_KEYS).flat();

// Load a settings file both ways and compare: the page's sizing after its Load settings, and the TS
// engine's sizing of the loaded design. Also the settings themselves, section by section.
function compare(file: unknown, browserHostTypes: object[] = []) {
  const page = openPage(browserHostTypes);
  const pageNote = page.ui.applySettings(JSON.parse(JSON.stringify(file)));
  const ps = page.ui.state();
  const r = engine.loadDesign(JSON.stringify(file), { browserHostTypes });
  assert.equal(r.kind, "design");
  if (r.kind !== "design") return;
  const e = engine.designToEngine(r.design);
  const mine = { S: e.s, hostTypes: e.hostTypes, topo: e.topo, groups: e.groups };
  assert.deepStrictEqual(sizeState(engine, relabel(mine)), sizeState(page.api, relabel(ps)), "sizing");
  const pick = (S: Record<string, unknown>) => Object.fromEntries(ALL_KEYS.map(k => [k, S[k]]));
  assert.deepStrictEqual(pick(relabel(mine).S), pick(relabel(ps).S), "settings");
  assert.deepStrictEqual(relabel(mine).hostTypes, relabel(ps).hostTypes, "host types");
  const plain = (x: unknown) => JSON.parse(JSON.stringify(x));
  assert.deepStrictEqual(plain(relabel(mine).topo), plain(relabel(ps).topo), "topology");
  const grp = (gs: Record<string, unknown>[]) => plain(gs.map(({ id, name, include, values, opts, meta }) => ({ id, name, include, values, opts, meta })));
  assert.deepStrictEqual(grp(relabel(mine).groups), grp(relabel(ps).groups), "workload groups");
  if (String(pageNote).trim()) assert.ok(r.notes.includes(String(pageNote).trim()), "page's note is reported");
  return r;
}

// 1. Every golden case, saved with the page's own Copy settings and loaded back
const fake = fakeFiles();
for (const c of CASES) test(`Copy settings round trip: ${c.name}`, () => {
  const page = openPage();
  const st = buildInputs(page.api, c, fake);
  page.ui.set(st);
  const text = page.ui.settingsJSON();
  const r = compare(JSON.parse(text));
  // nothing lost: the loaded design sizes exactly like the design before saving
  const e = engine.designToEngine(r!.design);
  const after = sizeState(engine, relabel({ S: e.s, hostTypes: e.hostTypes, topo: e.topo, groups: e.groups })), before = sizeState(page.api, relabel(st));
  if (st.hostTypes.length) assert.deepStrictEqual(after, before);
  else {
    // no host types: the engine sized with its built-in default; on load the page adds that same default as "Host type 1". Same numbers, new id.
    const nums = (x: { result: Record<string, unknown> }) => ({ hosts: x.result.hosts, licCores: x.result.licCores, lic: x.result.lic, D: x.result.D, warnings: x.result.warnings });
    assert.deepStrictEqual(nums(after), nums(before));
  }
});

// 2. Older and odd shapes of saved settings
for (const c of SETTINGS_CASES) test(`old settings shape: ${c.name}`, () => { compare(c.file, c.browserHostTypes); });

// 3. Design documents
test("design round trip: save and load gives the same design", () => {
  for (const c of [...CASES.slice(0, 8), ...SETTINGS_CASES]) {
    const r = engine.loadDesign("file" in c ? c.file : {}, { browserHostTypes: (c as { browserHostTypes?: object[] }).browserHostTypes });
    if (r.kind !== "design") throw new Error("not a design");
    const again = engine.loadDesign(engine.serializeDesign(r.design));
    assert.equal(again.kind, "design");
    if (again.kind === "design") { assert.deepStrictEqual(again.design, r.design); assert.equal(again.from, "design"); assert.deepStrictEqual(again.notes, []); }
  }
});
test("design keeps RVTools as the group source; Copy settings loads them as manual totals", () => {
  const file = { groups: [{ name: "vc-a", source: "rvtools", values: { vcpu: 1 } }] };
  const r = engine.loadDesign(file);
  assert.ok(r.kind === "design" && r.design.workload.groups[0].source === "manual" && r.notes.includes("RVTools groups load as manual totals."));
  if (r.kind !== "design") return;
  const d = { ...r.design, workload: { ...r.design.workload, groups: [{ ...r.design.workload.groups[0], source: "rvtools" }] } };
  const again = engine.loadDesign(engine.serializeDesign(d));
  assert.ok(again.kind === "design" && again.design.workload.groups[0].source === "rvtools");
});
test("a new design holds today's defaults, and the sections cover every setting exactly once", () => {
  assert.equal(new Set(ALL_KEYS).size, ALL_KEYS.length);
  assert.deepStrictEqual([...ALL_KEYS].sort(), [...Object.keys(engine.DEFAULTS), "customer", "site", "notes"].sort());
  const d = engine.newDesign();
  assert.deepStrictEqual(engine.designToEngine(d).s, { ...engine.DEFAULTS, customer: "", site: "", notes: "" });
  assert.equal(d.format, "vcf-design"); assert.equal(d.formatVersion, engine.FORMAT_VERSION);
});
test("sizing never changes the design", () => {
  const r = engine.loadDesign(JSON.stringify(SETTINGS_CASES.find(c => c.name === "dangling-references")!.file));
  if (r.kind !== "design") throw new Error();
  const before = engine.serializeDesign(r.design), e = engine.designToEngine(r.design);
  engine.size(e.s, e.topo, e.groups, e.hostTypes);
  assert.equal(engine.serializeDesign(r.design), before);
});

// 4. Versions and migrations
test("a design from a newer version is refused with a clear message", () => {
  assert.throws(() => engine.loadDesign({ format: "vcf-design", formatVersion: engine.FORMAT_VERSION + 1 }), /newer version/);
  assert.throws(() => engine.loadDesign({ format: "vcf-design" }), /no valid format version/);
});
test("migrations run in order up to the current version", () => {
  const seen: number[] = [];
  const reg = { 1: (d: Record<string, unknown>) => { seen.push(1); return { ...d, a: 1 }; }, 2: (d: Record<string, unknown>) => { seen.push(2); return { ...d, b: 2 }; } };
  const out = engine.migrateDesign({ format: "vcf-design", formatVersion: 1 }, reg, 3);
  assert.deepStrictEqual(seen, [1, 2]); assert.equal(out.formatVersion, 3); assert.equal(out.a, 1); assert.equal(out.b, 2);
  assert.throws(() => engine.migrateDesign({ formatVersion: 1 }, {}, 2), /No upgrade/);
});
test("other files are recognised or refused", () => {
  assert.throws(() => engine.loadDesign("{not json"), /isn't valid settings/);
  assert.throws(() => engine.loadDesign({ tool: "vmc", v: 1 }), /VMC file/);
  assert.throws(() => engine.loadDesign(42), /isn't a VCF design/);
});

// 5. Host-types files (the page's Export / Import host types)
test("host-types files: current, plain array and older presets shapes", () => {
  const cur = engine.loadDesign({ tool: "vcf-host-types", v: 1, hostTypes: [{ name: "A", cores: 48 }, { name: "B", vendor: "amd", cores: 96 }] });
  const arr = engine.loadDesign([{ name: "A", cores: 48 }, null, 5]);
  const old = engine.loadDesign({ presets: [{ name: "P", hw: { fam: "EPYC", cores: 64 } }] });
  assert.ok(cur.kind === "hostTypes" && cur.hostTypes.length === 2 && cur.hostTypes[1].vendor === "amd");
  assert.ok(arr.kind === "hostTypes" && arr.hostTypes.length === 1 && arr.hostTypes[0].cores === 48);
  assert.ok(old.kind === "hostTypes" && old.hostTypes[0].name === "P" && old.hostTypes[0].vendor === "amd" && old.hostTypes[0].cores === 64);
  assert.throws(() => engine.loadDesign({ tool: "vcf-host-types", hostTypes: [] }), /isn't a host types file/);
  const ids = cur.kind === "hostTypes" ? cur.hostTypes.map(h => h.id) : [];
  assert.equal(new Set(ids).size, ids.length);
});
test("importing host types replaces same names (keeping their id) and adds the rest", () => {
  const have = [engine.fixHw({ id: "h1", name: "A", cores: 32 }), engine.fixHw({ id: "h2", name: "B" })];
  const inc = engine.parseHostTypesFile([{ id: "h1", name: "B", cores: 64 }, { name: "C" }, { name: "C", cores: 96 }]);
  const out = engine.mergeHostTypes(have, inc);
  assert.deepStrictEqual(out.map(h => [h.name, h.cores]), [["A", 32], ["B", 64], ["C", 96]]);
  assert.equal(out[1].id, "h2");
  assert.equal(new Set(out.map(h => h.id)).size, 3);
  assert.equal(have[1].cores, 32, "input not changed");
});
