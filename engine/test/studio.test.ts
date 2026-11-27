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

// ---------- Expert view (3b) ----------
import * as edit from "../../studio/src/edit.ts";
import { expertHtml } from "../../studio/src/expert.ts";

const caseDesign = (name: string) => {
  const i = buildInputs(engine, CASES.find(x => x.name === name)!, fakeFiles());
  const r = engine.loadDesign({ v: 1, tool: "vcf", settings: i.S, hostTypes: i.hostTypes, topo: i.topo, groups: i.groups });
  if (r.kind !== "design") throw new Error(); return r.design;
};
const must = (d: engine.Design, ops: store.Op[]) => { const o = store.propose(d, { source: "test", ops }); if (!o.ok) throw new Error(o.error); return o.design; };
const allClusters = (d: engine.Design) => d.topology.instances.flatMap(i => [i.mgmt, ...i.wlds].flatMap(x => x.clusters));

test("the Expert view renders every golden case, every node selected, without changing results", () => {
  for (const c of CASES) {
    const d = caseDesign(c.name), before = engine.serializeDesign(d), r = store.sizeDesign(d);
    const ids = d.topology.instances.flatMap(i => [i.id, ...[i.mgmt, ...i.wlds].flatMap(x => [x.id, ...x.clusters.map(k => k.id), ...x.edges.map(e => e.id)])]);
    for (const sel of ["", ...ids]) {
      const html = expertHtml(d, r, { sel, closed: new Set() });
      assert.ok(html.includes("Sizing policy") && !html.includes("undefined") && !html.includes("NaN"), `${c.name} / ${sel}`);
    }
    assert.equal(engine.serializeDesign(d), before, `${c.name}: rendering changed the design`);
  }
  assert.ok(expertHtml(engine.newDesign(), store.sizeDesign(engine.newDesign()), { sel: "", closed: new Set() }).includes("No instances yet"));
});

test("Expert view: every field's input says what it changes, and that change is accepted", () => {
  const d = caseDesign("addons"), r = store.sizeDesign(d), html = expertHtml(d, r, { sel: allClusters(d)[0].id, closed: new Set() });
  const edits = [...html.matchAll(/data-edit="([^"]+)"/g)].map(m => JSON.parse(m[1].replace(/&quot;/g, '"')));
  assert.ok(edits.length > 60, `${edits.length} fields`);
  for (const e of edits) {
    const path = e.t === "sec" ? [e.sec, e.key] : e.t === "grp" ? ["workload", "groups", e.i, ...(e.sub ? [e.sub] : []), e.key] : null;
    if (!path) continue;
    let cur: any = d; for (const k of path) cur = cur?.[k];
    if (cur === undefined) continue;   // an option not set yet (e.g. a group's peak); a set refuses unknown paths, so skip it here
    assert.ok(store.propose(d, { source: "test", ops: [{ op: "set", path, value: cur }] }).ok, JSON.stringify(e));
  }
});

test("cluster edits follow the page's rules", () => {
  const d = caseDesign("simple-basic"), c = allClusters(d)[1];
  const one = (key: string, v: unknown) => { const x = must(d, edit.fieldOps(d, c.id, key, v)); return allClusters(x).find(k => k.id === c.id)!; };
  assert.equal(one("maxHosts", 500).maxHosts, 64, "vSAN cluster capped at 64");
  assert.equal(one("maxHosts", 1).maxHosts, 2);
  assert.equal(one("fixedHosts", 7.4).fixedHosts, 7);
  assert.equal(one("comp", 0.5).comp, 1);
  assert.equal(one("name", "   ").name, c.name, "a blank name keeps the old one");
  const r6 = must(d, edit.fieldOps(d, c.id, "policy", "r6"));
  assert.equal(allClusters(must(r6, edit.fieldOps(r6, c.id, "fixedHosts", 4))).find(k => k.id === c.id)!.policy, "auto", "a policy 4 fixed hosts can't meet goes back to Auto");
  assert.deepStrictEqual(edit.fieldOps(d, c.id, "nPlus", c.nPlus), [], "no change, no ops");
});

test("structural edits: add, duplicate and remove keep the design valid and references intact", () => {
  let d = engine.newDesign();
  const step = (a: edit.Action) => { const { ops, select } = edit.actionOps(d, a); d = must(d, ops); return select; };
  assert.throws(() => edit.actionOps(d, { act: "addClu", id: "x" }));
  const h = step({ act: "addHt" })!, i = step({ act: "addInst" })!;
  const m = d.topology.instances[0].mgmt.id;
  const c1 = step({ act: "addClu", id: m })!;
  assert.equal(allClusters(d)[0].maxHosts, 16, "management cluster max 16"); assert.equal(allClusters(d)[0].auto, false);
  const w = step({ act: "addWld", id: i })!;
  assert.equal(d.topology.instances[0].wlds[0].nsx, "dedicated", "first workload domain gets its own NSX");
  const c2 = step({ act: "addClu", id: w })!;
  assert.equal(allClusters(d).find(k => k.id === c2)!.name, "wld01-cl01");
  step({ act: "addEdge", id: w });
  step({ act: "addGroup" });
  d = must(d, [{ op: "set", path: ["workload", "groups", 0, "opts", "place"], value: c2 }, { op: "set", path: ["workload", "groups", 0, "values", "vcpu"], value: 400 }]);
  const i2 = step({ act: "dupInst", id: i })!;
  const copy = d.topology.instances[1];
  assert.equal(copy.id, i2); assert.equal(copy.name, "Instance 1 copy");
  const ids = new Set(); for (const x of [d.topology.instances[0], copy]) for (const dm of [x.mgmt, ...x.wlds]) { ids.add(dm.id); dm.clusters.forEach(k => ids.add(k.id)); dm.edges.forEach(e => ids.add(e.id)); }
  assert.equal(ids.size, 10, "every id in the copy is new (5 per instance)");
  assert.equal(copy.wlds[0].edges[0].on, copy.wlds[0].clusters[0].id, "the copy's edge runs on the copy's cluster");
  assert.ok(copy.wlds[0].clusters.every(k => !k.auto), "copied clusters don't take auto workloads");
  assert.throws(() => edit.actionOps(d, { act: "delHt", id: h }), /used by a cluster/);
  step({ act: "delClu", id: c2 });
  assert.equal(d.topology.instances[0].wlds[0].edges[0].on, "bm", "an edge on a removed cluster moves to bare metal");
  assert.equal(d.workload.groups[0].opts!.place, "auto", "a group placed on a removed cluster goes back to Auto");
  step({ act: "delInst", id: i2 }); step({ act: "delDom", id: w }); step({ act: "delGroup", index: 0 });
  assert.equal(allClusters(d).length, 1); assert.equal(d.workload.groups.length, 0); assert.ok(c1);
});

test("host type edits only keep real configurations", () => {
  let d = engine.newDesign(); d = must(d, edit.actionOps(d, { act: "addHt" }).ops);
  const h = d.hostTypes[0];
  d = must(d, edit.hostTypeOps(d, h.id, "cores", 30));
  assert.equal(d.hostTypes[0].cores, 28);
  d = must(d, edit.hostTypeOps(d, h.id, "name", ""));
  assert.equal(d.hostTypes[0].name, h.name);
});
