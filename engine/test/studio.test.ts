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

// ---------- RVTools import and design format 2 ----------
import * as rvi from "../../studio/src/rvimport.ts";
import { readFileSync as readText } from "node:fs";

test("a format 1 design opens in the current format with nothing changed: RVTools values are kept as saved, none shown as edited", () => {
  const raw = JSON.parse(readText(new URL("../fixtures/designs/format-1.vcf-design.json", import.meta.url), "utf8"));
  assert.equal(raw.formatVersion, 1);
  const r = engine.loadDesign(raw); if (r.kind !== "design") throw new Error();
  assert.equal(r.design.formatVersion, engine.FORMAT_VERSION);
  assert.deepStrictEqual(r.design.decisions, { steps: {} });
  assert.deepStrictEqual(r.design.workload.groups.map(g => [g.source, g.parsed]), [["rvtools", null], ["rvtools", null], ["manual", null]]);
  assert.deepStrictEqual(r.design.workload.groups.map(g => g.values), raw.workload.groups.map((g: { values: unknown }) => g.values));
  assert.ok(r.design.workload.groups.every(g => rvi.overridden(g).length === 0));
  const e = engine.designToEngine(raw);
  const noParsed = (x: unknown) => JSON.parse(JSON.stringify(x, (k, v) => (k === "parsed" ? undefined : v)));
  assert.deepStrictEqual(noParsed(store.sizeDesign(r.design)), noParsed(engine.size(e.s, e.topo, e.groups, e.hostTypes)), "same sizing (the result only echoes the new field)");
  // saved again it keeps parsed
  const again = engine.loadDesign(engine.serializeDesign(r.design)); assert.ok(again.kind === "design" && again.design.workload.groups[0].parsed === null);
});

const fake = fakeFiles() as Record<string, Record<string, unknown>>;
const readFake = (n: string) => rvi.readExport(fake[n].fileName as string, s => (fake[n][s] as never) ?? null);
const rvCases = CASES.filter(c => c.rvtools);
const strip = (gs: { name: string; source?: string; include?: boolean; values: unknown; meta?: unknown }[]) => gs.map(g => ({ name: g.name, source: g.source, include: g.include, values: g.values, meta: g.meta }));

test("RVTools import in the studio builds the same groups and sizing as the VCF Sizing page, for every RVTools case", () => {
  assert.equal(rvCases.length, 3);
  for (const c of rvCases) {
    const i = buildInputs(engine, c, fake);
    const manual = i.groups.filter((g: { source: string }) => g.source === "manual");
    const r = engine.loadDesign({ v: 1, tool: "vcf", settings: i.S, hostTypes: i.hostTypes, topo: i.topo, groups: manual }); if (r.kind !== "design") throw new Error();
    let d = r.design;
    const scope = { ...engine.DEFAULT_SCOPE, ...(c.rvtools!.scope || {}) };
    const files = c.rvtools!.files.map(readFake);
    const rb = rvi.rebuild(d, files, scope);
    const opts = (c.rvtools!.opts || {}) as Record<string, object>;
    rb.groups.forEach(g => { if (opts[g.name]) g.opts = { ...g.opts!, ...opts[g.name] }; });
    d = must(d, [{ op: "set", path: ["workload", "rvtoolsScope"], value: scope }, { op: "set", path: ["workload", "groups"], value: rb.groups }]);
    assert.deepStrictEqual(strip(d.workload.groups), strip(i.groups), `${c.name}: groups`);
    assert.ok(d.workload.groups.filter(g => g.source === "rvtools").every(g => g.parsed && rvi.overridden(g).length === 0));
    const want = engine.size(i.S, i.topo, i.groups, i.hostTypes), got = store.sizeDesign(d);
    assert.deepStrictEqual([got.hosts, got.licCores, got.clusters.map(x => x.total)], [want.hosts, want.licCores, want.clusters.map(x => x.total)], `${c.name}: sizing`);
    assert.equal(rb.stats.dups, i.rv!.build.dups); assert.equal(rb.stats.excluded, i.rv!.build.excluded);
  }
});

test("re-reading or rescoping keeps a group's include, placement and hand edits, as on the page; Reset goes back to RVTools", () => {
  let d = engine.newDesign();
  const files = ["A", "B"].map(readFake), scope = { ...engine.DEFAULT_SCOPE };
  d = must(d, [{ op: "set", path: ["workload", "groups"], value: rvi.rebuild(d, files, scope).groups }]);
  const name = d.workload.groups[0].name, read = d.workload.groups[0].values.vcpu as number;
  d = must(d, [{ op: "set", path: ["workload", "groups", 0, "values", "vcpu"], value: 9999 }, { op: "set", path: ["workload", "groups", 0, "opts", "cpuPeak"], value: 30 }, { op: "set", path: ["workload", "groups", 1, "include"], value: false }]);
  assert.deepStrictEqual(rvi.overridden(d.workload.groups[0]), ["vcpu"]);
  const scope2 = { ...scope, includeOff: false };
  const rb = rvi.rebuild(d, files, scope2);
  d = must(d, [{ op: "set", path: ["workload", "groups"], value: rb.groups }]);
  const g = d.workload.groups.find(x => x.name === name)!;
  assert.equal(g.values.vcpu, 9999, "hand edit kept"); assert.equal(g.opts!.cpuPeak, 30, "peak kept"); assert.equal(d.workload.groups[1].include, false, "include kept");
  assert.ok(g.parsed && g.parsed.vcpu <= read, "parsed values follow the new scope");
  d = must(d, edit.actionOps(d, { act: "resetGroup", index: d.workload.groups.indexOf(g) }).ops);
  assert.deepStrictEqual(d.workload.groups[0].values, d.workload.groups[0].parsed, "reset");
  // removing every file removes the RVTools groups, manual ones stay (as on the page)
  d = must(d, edit.actionOps(d, { act: "addGroup" }).ops);
  d = must(d, [{ op: "set", path: ["workload", "groups"], value: rvi.rebuild(d, [], scope2).groups }]);
  assert.deepStrictEqual(d.workload.groups.map(x => x.source), ["manual"]);
});

test("a file that isn't an RVTools export is reported, not thrown", () => {
  const f = rvi.readExport("notes.xlsx", () => null);
  assert.equal(f.status, "error"); assert.ok(f.error);
  assert.equal(rvi.rebuild(engine.newDesign(), [f], { ...engine.DEFAULT_SCOPE }).groups.length, 0);
});

// ---------- guided steps (3c) ----------
import * as steps from "../../studio/src/steps.ts";
import { stepHtml } from "../../studio/src/guided.ts";
import { STEPS } from "../../studio/src/flow.ts";

test("a format 2 design opens in format 3 with no step choices", () => {
  const raw = JSON.parse(readText(new URL("../fixtures/designs/format-2.vcf-design.json", import.meta.url), "utf8"));
  assert.equal(raw.formatVersion, 2);
  const r = engine.loadDesign(raw); if (r.kind !== "design") throw new Error();
  assert.equal(r.design.formatVersion, 3); assert.deepStrictEqual(r.design.decisions, { steps: {} });
  assert.equal(r.design.workload.groups[1].values.vms, raw.workload.groups[1].values.vms);
  assert.deepStrictEqual(rvi.overridden(r.design.workload.groups[1]), ["vms"], "format 2 parsed values kept");
  assert.equal(steps.stepState(r.design, "policy").state, "decided", "cpuRatio 5 is a decision");
});

test("required steps say what's missing; a filled design has them done", () => {
  const n = engine.newDesign();
  assert.deepStrictEqual(["project", "workload", "hosts", "topology"].map(id => steps.stepState(n, id).state), ["todo", "todo", "todo", "todo"]);
  const d = caseDesign("multi-instance"); d.project.customer = "Acme";
  assert.deepStrictEqual(["project", "workload", "hosts", "topology"].map(id => steps.stepState(d, id).state), ["done", "done", "done", "done"]);
  assert.equal(steps.stepState(d, "identity").state, "coming");
});

test("skippable steps: open, then Skip / Use recommended are recorded; changed values make it a decision; Use recommended resets them", () => {
  let d = caseDesign("simple-basic");
  for (const id of ["policy", "fleet", "storage", "addons"]) {
    d = must(d, steps.reopenOps(d, id));
    const before = steps.changes(d, id).length;
    assert.equal(steps.stepState(d, id).state, before ? "decided" : "open", id);
    d = must(d, steps.skipOps(d, id));
    assert.equal(steps.stepState(d, id).state, before ? "decided" : "skipped", id);
    d = must(d, steps.recommendOps(d, id));
    assert.equal(steps.stepState(d, id).state, "recommended", id); assert.equal(steps.changes(d, id).length, 0, id);
    assert.equal(d.decisions.steps[id], "recommended");
    d = must(d, steps.reopenOps(d, id)); assert.equal(steps.stepState(d, id).state, "open");
  }
  d = must(d, [{ op: "set", path: ["policy", "cpuRatio"], value: 6 }]);
  assert.deepStrictEqual(steps.changes(d, "policy").map(c => [c.label, c.value, c.def]), [["Workload CPU ratio (vCPU : core)", "6", "4"]]);
  const c = allClusters(d)[1];
  d = must(d, edit.fieldOps(d, c.id, "comp", 1.5));
  assert.deepStrictEqual(steps.changes(d, "storage").map(x => [x.where, x.value]), [[c.name, "1.5"]]);
  d = must(d, steps.recommendOps(d, "storage")); assert.equal(allClusters(d)[1].comp, 1.25);
  assert.equal(d.policy.cpuRatio, 6, "other steps untouched");
});

test("Use recommended restores the defaults' sizing exactly", () => {
  const c0 = caseDesign("simple-basic"), n = must(c0, steps.recommendOps(c0, "policy"));
  let d = must(n, [{ op: "set", path: ["policy", "cpuRatio"], value: 2 }, { op: "set", path: ["policy", "memFill"], value: 50 }]);
  assert.notEqual(store.sizeDesign(d).hosts, store.sizeDesign(n).hosts);
  d = must(d, steps.recommendOps(d, "policy"));
  assert.deepStrictEqual(store.sizeDesign(d), store.sizeDesign(n));
});

test("every guided step renders for every golden case", () => {
  for (const c of CASES) {
    const d = caseDesign(c.name), r = store.sizeDesign(d);
    for (const s of STEPS) {
      const html = stepHtml(d, r, { sel: "", closed: new Set() }, s.id);
      assert.ok(html.includes(s.title.replace("&", "&amp;")) && !html.includes("undefined") && !html.includes("NaN"), `${c.name} / ${s.id}`);
      if (s.id === "topology") assert.ok(!html.includes('&quot;key&quot;:&quot;comp&quot;'), "storage fields are left to the storage step");
    }
  }
});
