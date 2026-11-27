// VCF Design Studio: the browser build matches the source, and the studio's state logic
// (opening what this browser has saved, proposals) works. The page itself is checked in a browser.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { build } from "../../studio/build.mjs";
import * as store from "../../studio/src/store.ts";
import * as engine from "../src/index.ts";
import { CASES } from "../fixtures/cases.mjs";
import { buildInputs } from "../baseline/harness.mjs";
import { fakeFiles } from "../baseline/rvtools-files.mjs";

test("vcf-design-studio/app is up to date with the source (run npm run build)", () => {
  const dir = mkdtempSync(join(tmpdir(), "studio-"));
  try {
    const files = build(dir);
    for (const f of files) assert.equal(readFileSync(join(dir, f), "utf8"), readFileSync(new URL(`../../vcf-design-studio/app/${f}`, import.meta.url), "utf8"), f);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

const mem = (init: Record<string, string> = {}) => {
  const m = { ...init };
  return { m, getItem: (k: string) => (k in m ? m[k] : null), setItem: (k: string, v: string) => { m[k] = v; }, removeItem: (k: string) => { delete m[k]; } };
};
const sizerSession = JSON.stringify({ v: 1, tool: "vcf", settings: { customer: "Acme" }, hostTypes: [], topo: { instances: [{ id: "i1", mgmt: { id: "d1", name: "Management", clusters: [{ id: "m1", name: "m1" }] } }] }, groups: [{ name: "Apps", values: { vcpu: 400, vramGiB: 1600 } }] });
const sizerHosts = JSON.stringify([{ id: "h3", name: "From the sizer", cores: 48 }]);

test("opens this tool's saved design first", () => {
  const d = engine.newDesign(); d.project.customer = "Mine";
  const r = store.openSaved(mem({ [store.KEY]: engine.serializeDesign(d), [store.SIZER_SESSION]: sizerSession }));
  assert.equal(r.origin, "saved"); assert.equal(r.design.project.customer, "Mine");
});
test("otherwise brings in the VCF Sizing page's last session, with its host types", () => {
  const r = store.openSaved(mem({ [store.SIZER_SESSION]: sizerSession, [store.SIZER_HOST_TYPES]: sizerHosts }));
  assert.equal(r.origin, "vcf-sizing"); assert.equal(r.design.project.customer, "Acme");
  assert.equal(r.design.hostTypes[0].name, "From the sizer");
  assert.equal(r.design.topology.instances[0].mgmt.clusters[0].hostType, r.design.hostTypes[0].id);
  assert.match(r.notes[0], /VCF Sizing page/);
});
test("otherwise just the sizer's host types, otherwise a new design; unreadable data never blocks opening", () => {
  assert.equal(store.openSaved(mem({ [store.SIZER_HOST_TYPES]: sizerHosts })).origin, "sizing-host-types");
  assert.equal(store.openSaved(mem()).origin, "new");
  assert.equal(store.openSaved(mem({ [store.KEY]: "{broken", [store.SIZER_SESSION]: "also broken", [store.SIZER_HOST_TYPES]: "[" })).origin, "new");
  const throwing = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); }, removeItem() { throw new Error("blocked"); } };
  assert.equal(store.openSaved(throwing).origin, "new");
  assert.equal(store.save(throwing, engine.newDesign()), false);
});
test("save then open gives the same design", () => {
  const st = mem(), d = store.openSaved(mem({ [store.SIZER_SESSION]: sizerSession })).design;
  assert.ok(store.save(st, d));
  assert.deepStrictEqual(store.openSaved(st).design, d);
});

test("proposals: valid changes apply to a copy; bad ones are refused and change nothing", () => {
  const d = engine.newDesign(), before = engine.serializeDesign(d);
  const ok = store.propose(d, { source: "test", ops: [{ op: "set", path: ["policy", "cpuRatio"], value: 5 }, { op: "set", path: ["project", "customer"], value: "Acme" }] });
  assert.ok(ok.ok && ok.design.policy.cpuRatio === 5 && ok.design.project.customer === "Acme");
  assert.equal(engine.serializeDesign(d), before, "original untouched");
  for (const [ops, why] of [
    [[{ op: "set", path: ["policy", "cpuRatio"], value: "5" }], /takes a number/],
    [[{ op: "set", path: ["policy", "nope"], value: 1 }], /no policy.nope/],
    [[{ op: "set", path: ["fleet", "profile"], value: "Mega" }], /isn't a valid value/],
    [[{ op: "insert", path: ["project"], value: 1 }], /not a list/],
  ] as const) { const r = store.propose(d, { source: "test", ops: ops as unknown as store.Op[] }); assert.ok(!r.ok && why.test(r.error), JSON.stringify(r)); }
  const ins = store.propose(d, { source: "test", ops: [{ op: "insert", path: ["hostTypes"], value: { name: "A", cores: 30 } }] });
  assert.ok(ins.ok && ins.design.hostTypes.length === 1 && ins.design.hostTypes[0].cores === 28 && ins.design.hostTypes[0].id, "inserted host type is normalised and gets an id");
  const rm = ins.ok ? store.propose(ins.design, { source: "test", ops: [{ op: "remove", path: ["hostTypes", 0] }] }) : null;
  assert.ok(rm && rm.ok && rm.design.hostTypes.length === 0);
});

test("sizing a design in the studio gives the golden results", () => {
  const fake = fakeFiles();
  for (const name of ["multi-instance", "addons", "auto-spill"]) {
    const c = CASES.find(x => x.name === name)!, i = buildInputs(engine, c, fake);
    const r = engine.loadDesign({ v: 1, tool: "vcf", settings: i.S, hostTypes: i.hostTypes, topo: i.topo, groups: i.groups });
    if (r.kind !== "design") throw new Error();
    assert.equal(store.sizeDesign(r.design).hosts, engine.size(i.S, i.topo, i.groups, i.hostTypes).hosts, name);
  }
});

test("each cluster's deciding factor reads plainly", () => {
  const i = buildInputs(engine, CASES.find(x => x.name === "simple-basic")!, {});
  const r = engine.size(i.S, i.topo, i.groups, i.hostTypes);
  assert.equal(engine.summaryLine(r), "11 hosts, 8 of them memory-bound · 704 VCF cores");
  assert.deepStrictEqual(r.clusters.map(c => engine.clusterReason(c)), ["3 hosts: at the minimum for this cluster (3); CPU and RAM need 2 with spares", "8 hosts: memory-bound (RAM needs 7, CPU 5, + 1 spare)"]);
  const j = buildInputs(engine, CASES.find(x => x.name === "auto-spill")!, {});
  const f1 = engine.size(j.S, j.topo, j.groups, j.hostTypes).clusters.find(c => c.c.id === "f1")!;
  assert.equal(engine.clusterReason(f1), "4 hosts: set by hand, needs 18 (memory-bound)");
});
