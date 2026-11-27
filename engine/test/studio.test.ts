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

test("a format 2 design opens in the current format with no step choices", () => {
  const raw = JSON.parse(readText(new URL("../fixtures/designs/format-2.vcf-design.json", import.meta.url), "utf8"));
  assert.equal(raw.formatVersion, 2);
  const r = engine.loadDesign(raw); if (r.kind !== "design") throw new Error();
  assert.equal(r.design.formatVersion, engine.FORMAT_VERSION); assert.deepStrictEqual(r.design.decisions, { steps: {} });
  assert.equal(r.design.workload.groups[1].values.vms, raw.workload.groups[1].values.vms);
  assert.deepStrictEqual(rvi.overridden(r.design.workload.groups[1]), ["vms"], "format 2 parsed values kept");
  assert.equal(steps.stepState(r.design, "policy").state, "decided", "cpuRatio 5 is a decision");
});

test("required steps say what's missing; a filled design has them done", () => {
  const n = engine.newDesign();
  assert.deepStrictEqual(["project", "workload", "hosts", "topology"].map(id => steps.stepState(n, id).state), ["todo", "todo", "todo", "todo"]);
  const d = caseDesign("multi-instance"); d.project.customer = "Acme";
  assert.deepStrictEqual(["project", "workload", "hosts", "topology"].map(id => steps.stepState(d, id).state), ["done", "done", "done", "done"]);
  assert.equal(steps.stepState(d, "identity").state, "open"); assert.equal(steps.stepState(d, "nsx").state, "open");
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

// ---------- identity & access (4a) ----------
test("a format 3 design opens with identity not decided and its step choices kept", () => {
  const raw = JSON.parse(readText(new URL("../fixtures/designs/format-3.vcf-design.json", import.meta.url), "utf8"));
  assert.equal(raw.formatVersion, 3);
  const r = engine.loadDesign(raw); if (r.kind !== "design") throw new Error();
  assert.equal(r.design.formatVersion, engine.FORMAT_VERSION);
  assert.deepStrictEqual(r.design.identity, engine.newIdentity());
  assert.deepStrictEqual(r.design.decisions.steps, { fleet: "skipped", storage: "recommended" });
  assert.equal(steps.stepState(r.design, "identity").state, "open");
});

test("identity never changes sizing (VCF 9.1: instance mode runs on VCF management services)", () => {
  const d0 = caseDesign("multi-instance");
  let d = must(d0, steps.recommendOps(d0, "identity"));
  d = must(d, [...edit.identityOps(d, "idp", "entra"), { op: "set", path: ["identity", "provisioning"], value: "scim" }]);
  d = must(d, edit.actionOps(d, { act: "suggestRoles" }).ops);
  assert.deepStrictEqual(store.sizeDesign(d), store.sizeDesign(d0));
});

test("identity: choices are checked against the knowledge file; the step reports what's still open", () => {
  let d = caseDesign("multi-instance");
  assert.equal(steps.stepState(d, "identity").state, "open");
  d = must(d, steps.recommendOps(d, "identity"));
  let st = steps.stepState(d, "identity");
  assert.equal(st.state, "recommended"); assert.equal(d.identity.mode, "instance");
  assert.deepStrictEqual(st.open, ["Choose the identity provider.", "Define who gets which access (role matrix).", "Name who holds the break-glass accounts."]);
  assert.ok(!store.propose(d, { source: "t", ops: [{ op: "set", path: ["identity", "idp"], value: "myidp" }] }).ok, "unknown provider refused");
  assert.ok(!store.propose(d, { source: "t", ops: [{ op: "set", path: ["identity", "provisioning"], value: "scim" }] }).ok, "provisioning needs a provider");
  d = must(d, edit.identityOps(d, "idp", "okta")); d = must(d, [{ op: "set", path: ["identity", "provisioning"], value: "jit" }]);
  assert.ok(!store.propose(d, { source: "t", ops: [{ op: "set", path: ["identity", "provisioning"], value: "directory" }] }).ok, "directory sync is for directories");
  d = must(d, edit.identityOps(d, "idp", "adldap"));
  assert.equal(d.identity.provisioning, "", "switching to a directory clears JIT");
  d = must(d, [{ op: "set", path: ["identity", "provisioning"], value: "directory" }, { op: "set", path: ["identity", "breakGlass", "holder"], value: "On-call lead" }]);
  d = must(d, edit.actionOps(d, { act: "suggestRoles" }).ops);
  assert.deepStrictEqual(steps.stepState(d, "identity").open, []);
  d = must(d, [{ op: "set", path: ["identity", "mode"], value: "embedded" }]);
  assert.equal(steps.stepState(d, "identity").state, "decided");
  assert.deepStrictEqual(steps.changes(d, "identity").map(c => c.value), ["Embedded in the management vCenter"]);
});

test("a role scoped to a removed domain loses its scope instead of widening to the fleet", () => {
  let d = caseDesign("multi-instance");
  const inst = d.topology.instances[0], wld = inst.wlds[0];
  d = must(d, edit.actionOps(d, { act: "addRole" }).ops);
  d = must(d, [{ op: "set", path: ["identity", "roles", 0, "scope"], value: wld.id }, { op: "set", path: ["identity", "roles", 0, "access"], value: "admin" }]);
  assert.equal(d.identity.roles[0].scope, wld.id);
  d = must(d, edit.actionOps(d, { act: "delDom", id: wld.id }).ops);
  assert.equal(d.identity.roles[0].scope, "", "scope cleared");
  assert.ok(steps.identityOpen(d).some(t => /lost its scope/.test(t)));
  // a saved file pointing at a cluster or an unknown id gets the same treatment
  const r = engine.loadDesign({ ...JSON.parse(engine.serializeDesign(d)), identity: { ...d.identity, roles: [{ group: "g", scope: allClusters(d)[0].id, access: "root" }] } });
  assert.ok(r.kind === "design"); assert.deepStrictEqual(r.design.identity.roles, [{ group: "g", scope: "", access: "readonly" }]);
});

test("the identity knowledge file has a source, a link and a verified date for each table", () => {
  const k = JSON.parse(readText(new URL("../knowledge/identity.json", import.meta.url), "utf8"));
  for (const [name, t] of Object.entries(k.tables) as [string, { source: string; url: string; verified: string }][]) assert.ok(t.source && /^https:\/\/techdocs\.broadcom\.com\//.test(t.url) && /^\d{4}-\d\d-\d\d$/.test(t.verified), name);
});

// ---------- VCF 9.1 and later ----------
import { projectFields } from "../../studio/src/fields.ts";
test("new designs offer VCF 9.1 only; a design brought in at 9.0 keeps 9.0 and its numbers until moved", () => {
  const choices = (v?: string) => projectFields(v).find(f => f.key === "version")!.choices!.map(c => c[0]);
  assert.deepStrictEqual(choices(), ["9.1"]); assert.deepStrictEqual(choices("9.0"), ["9.1", "9.0"]);
  assert.equal(engine.newDesign().project.version, "9.1");
  // a 9.0 sizing with vSAN dedupe set: dedupe only applies on 9.1
  const i = buildInputs(engine, CASES.find(x => x.name === "simple-basic")!, {});
  const S = { ...i.S, version: "9.0" }, topo = structuredClone(i.topo);
  const c = topo.instances[0].wlds[0].clusters[0]; c.dedupe = 2;
  const r = engine.loadDesign({ v: 1, tool: "vcf", settings: S, hostTypes: i.hostTypes, topo, groups: i.groups }); if (r.kind !== "design") throw new Error();
  const d = r.design;
  assert.equal(d.project.version, "9.0");
  assert.deepStrictEqual(store.sizeDesign(d).hosts, engine.size(S, topo, i.groups, i.hostTypes).hosts, "opens unchanged");
  const m = edit.moveTo91(d, store.sizeDesign);
  const after = must(d, edit.actionOps(d, { act: "moveTo91" }).ops);
  assert.equal(after.project.version, "9.1");
  assert.deepStrictEqual(m.hosts, [store.sizeDesign(d).hosts, store.sizeDesign(after).hosts], "the notice reports exactly what moving does");
  assert.deepStrictEqual(m.licCores, [store.sizeDesign(d).licCores, store.sizeDesign(after).licCores]);
  assert.ok(expertHtml(d, store.sizeDesign(d), { sel: "", closed: new Set() }).includes("This design is for VCF 9.0."));
  assert.ok(!expertHtml(after, store.sizeDesign(after), { sel: "", closed: new Set() }).includes("This design is for VCF 9.0."));
});

// ---------- host networking (4b) ----------
import * as hostnet from "../../studio/src/hostnet.ts";
test("a format 4 design opens with host networking at the recommendation and its identity kept", () => {
  const raw = JSON.parse(readText(new URL("../fixtures/designs/format-4.vcf-design.json", import.meta.url), "utf8"));
  assert.equal(raw.formatVersion, 4);
  const r = engine.loadDesign(raw); if (r.kind !== "design") throw new Error();
  assert.equal(r.design.formatVersion, engine.FORMAT_VERSION);
  assert.deepStrictEqual(r.design.network, engine.newNetwork());
  assert.deepStrictEqual(r.design.identity, raw.identity);
  assert.equal(steps.stepState(r.design, "hostnet").state, "open");
});

test("host networking: storage separation is recommended only for vSAN clusters on hosts with 4+ NICs; values differing are decisions", () => {
  let d = caseDesign("multi-instance");
  const vsan = hostnet.allClusters(d).find(x => engine.isVsan(x.c))!.c;
  assert.deepStrictEqual(hostnet.recommended(d, vsan), { vds: "single", nicGbps: 25, mtu: 9000, tep: "pool" });
  d = must(d, hostnet.nicsOps(d, vsan.hostType, 4));
  assert.equal(hostnet.recommended(d, vsan).vds, "storage");
  assert.deepStrictEqual(d.network.clusters, {}, "a recommendation is never stored");
  assert.equal(steps.changes(d, "hostnet").length, 0);
  d = must(d, hostnet.netOps(d, vsan.id, "nicGbps", 10));
  d = must(d, hostnet.netOps(d, vsan.id, "mtu", 1500));   // below the overlay minimum: clamped, not dropped
  assert.deepStrictEqual(d.network.clusters[vsan.id], { nicGbps: 10, mtu: 1600 });
  assert.equal(steps.stepState(d, "hostnet").state, "decided");
  assert.deepStrictEqual(steps.changes(d, "hostnet").map(c => [c.where, c.value, c.def]), [[vsan.name, "10 GbE", "25 GbE"], [vsan.name, "1600", "9000"]]);
  d = must(d, hostnet.netOps(d, vsan.id, "mtu", 9000));
  assert.deepStrictEqual(d.network.clusters[vsan.id], { nicGbps: 10 }, "back to recommended: not stored");
  d = must(d, steps.recommendOps(d, "hostnet"));
  assert.deepStrictEqual(d.network.clusters, {}); assert.equal(steps.stepState(d, "hostnet").state, "recommended");
});

test("host networking: networks and address counts follow the switch model and the sized hosts; sizing never changes", () => {
  const d0 = caseDesign("multi-instance"), r0 = store.sizeDesign(d0);
  const vsan = hostnet.allClusters(d0).find(x => engine.isVsan(x.c))!.c;
  let d = must(d0, hostnet.nicsOps(d0, vsan.hostType, 4));
  d = must(d, [...hostnet.netOps(d, vsan.id, "tep", "dhcp"), { op: "set", path: ["network", "domain"], value: "vcf.example.com" }]);
  assert.deepStrictEqual(store.sizeDesign(d), r0);
  const n = hostnet.hostsByCluster(r0).get(vsan.id)!;
  assert.ok(n > 0);
  assert.deepStrictEqual(hostnet.networksOf(d, vsan, n).map(x => [x.net, x.vds, x.mtu, x.addr, x.ips]), [
    ["ESX management", 1, 1500, "Static", n], ["vMotion", 1, 9000, "Network pool", n], ["vSAN", 2, 9000, "Network pool", n], ["Host TEP (NSX overlay)", 1, 9000, "DHCPv4", 2 * n]]);
});

test("host networking: open items for DNS / NTP and for a switch model the hardware can't carry", () => {
  let d = caseDesign("multi-instance");
  const c = hostnet.allClusters(d)[0].c;
  assert.deepStrictEqual(hostnet.hostnetOpen(d), ["Enter the DNS domain.", "Enter the DNS servers.", "Enter the NTP servers."]);
  d = must(d, [{ op: "set", path: ["network", "domain"], value: "vcf.example.com" }, { op: "set", path: ["network", "dns"], value: "10.0.0.10" }, { op: "set", path: ["network", "ntp"], value: "10.0.0.10" }]);
  d = must(d, hostnet.netOps(d, c.id, "vds", "storage"));
  assert.ok(hostnet.hostnetOpen(d).some(t => t.startsWith(`${c.name}: the storage separation model needs 4 NICs`)));
  assert.ok(steps.stepState(d, "hostnet").open!.length > 0);
  d = must(d, hostnet.nicsOps(d, c.hostType, 4));
  assert.ok(!hostnet.hostnetOpen(d).some(t => /needs 4 NICs/.test(t)));
});

test("host networking: a saved file keeps only known values for clusters and host types in the design", () => {
  const d = caseDesign("multi-instance"), c = hostnet.allClusters(d)[0].c, h = d.hostTypes[0].id;
  const raw = { ...JSON.parse(engine.serializeDesign(d)), network: { domain: "x.example", dns: 5, ntp: "n", hostNics: { [h]: 4, nope: 4, [d.hostTypes[0].id + "x"]: 2 },
    clusters: { [c.id]: { vds: "storage", nicGbps: 33, mtu: 1200, tep: "pool", junk: 1 }, nope: { vds: "single" } } } };
  const r = engine.loadDesign(raw); if (r.kind !== "design") throw new Error();
  assert.deepStrictEqual(r.design.network, { domain: "x.example", dns: "", ntp: "n", hostNics: { [h]: 4 }, clusters: { [c.id]: { vds: "storage", tep: "pool" } }, domains: {} });
  // deleting a cluster drops its values
  const dm = r.design.topology.instances[0].wlds[0];
  const add = edit.actionOps(r.design, { act: "addClu", id: dm.id });
  let d2 = must(r.design, add.ops); const nc = add.select!;
  d2 = must(d2, hostnet.netOps(d2, nc, "nicGbps", 100));
  assert.deepStrictEqual(d2.network.clusters[nc], { nicGbps: 100 });
  d2 = must(d2, edit.actionOps(d2, { act: "delClu", id: nc }).ops);
  assert.equal(d2.network.clusters[nc], undefined); assert.deepStrictEqual(Object.keys(d2.network.clusters), [c.id]);
});

test("the network knowledge file has a source, a link and a verified date for each table", () => {
  const k = JSON.parse(readText(new URL("../knowledge/network.json", import.meta.url), "utf8"));
  for (const [name, t] of Object.entries(k.tables) as [string, { source: string; url: string; verified: string }][]) assert.ok(t.source && /^https:\/\/techdocs\.broadcom\.com\//.test(t.url) && /^\d{4}-\d\d-\d\d$/.test(t.verified), name);
});

// ---------- NSX & connectivity (4c) ----------
import * as nsx from "../../studio/src/nsx.ts";
const dom = (d: engine.Design, name: string) => nsx.allDomains(d).find(x => x.dm.name === name)!.dm;
test("a format 5 design opens with NSX connectivity at the recommendation and its host networking kept", () => {
  const raw = JSON.parse(readText(new URL("../fixtures/designs/format-5.vcf-design.json", import.meta.url), "utf8"));
  assert.equal(raw.formatVersion, 5);
  const r = engine.loadDesign(raw); if (r.kind !== "design") throw new Error();
  assert.equal(r.design.formatVersion, engine.FORMAT_VERSION);
  assert.deepStrictEqual(r.design.network, { ...raw.network, domains: {} });
  assert.equal(steps.stepState(r.design, "nsx").state, "open");
});

test("NSX: centralized by default, distributed when chosen; transit gateway standby follows VCF Automation and Supervisor", () => {
  let d = caseDesign("vdefend-atp");
  const w1 = dom(d, "WLD-01");
  assert.equal(d.fleet.automation, true);
  assert.deepStrictEqual(nsx.recommendedNsx(d, w1), { model: "centralized", t0Ha: "aa", tgwHa: "as", bfd: true, edgeTep: "separate", extPrefix: 24, privPrefix: 23 });
  d = must(d, [{ op: "set", path: ["fleet", "automation"], value: false }]);
  assert.equal(nsx.recommendedNsx(d, dom(d, "WLD-01")).tgwHa, "aa");
  d = must(d, nsx.nsxOps(d, w1.id, "model", "distributed"));
  assert.deepStrictEqual(d.network.domains[w1.id], { model: "distributed" });
  assert.deepStrictEqual(steps.changes(d, "nsx").map(c => [c.where, c.value]), [["WLD-01", "Distributed VLAN (no edges required)"]]);
  assert.equal(steps.stepState(d, "nsx").state, "decided");
  d = must(d, nsx.nsxOps(d, w1.id, "model", "centralized"));
  assert.deepStrictEqual(d.network.domains, {}, "a recommendation is never stored");
});

test("NSX: open items for ASNs, edge node limits, transit gateway HA and edges a distributed domain doesn't need", () => {
  let d = caseDesign("vdefend-atp");
  const m = dom(d, "Management"), w1 = dom(d, "WLD-01"), w2 = dom(d, "WLD-02");
  let open = nsx.nsxOpen(d);
  assert.ok(open.includes("WLD-01: enter the Tier-0 BGP ASN.") && open.includes("WLD-01: enter the physical network's BGP ASN."));
  assert.ok(open.some(t => /^WLD-01 \/ .+: an edge cluster needs 2 or more nodes\.$/.test(t)), "the 1-node edge cluster");
  d = must(d, [...nsx.nsxOps(d, w1.id, "t0Ha", "as")]);
  assert.ok(nsx.nsxOpen(d).some(t => /an active\/standby Tier-0 runs on 2 edge nodes; this edge cluster has 4\./.test(t)));
  d = must(d, nsx.nsxOps(d, w1.id, "tgwHa", "aa"));
  assert.ok(nsx.nsxOpen(d).includes("WLD-01: the transit gateway must be active/standby for VCF Automation All Apps orgs and vSphere Supervisor."));
  // ASNs: private, unique per Tier-0; a bad entry is refused, blank clears
  d = must(d, nsx.nsxOps(d, m.id, "localAsn", "65001")); d = must(d, nsx.nsxOps(d, w1.id, "localAsn", " 65001 ")); d = must(d, nsx.nsxOps(d, w2.id, "localAsn", "64000"));
  open = nsx.nsxOpen(d);
  assert.ok(open.includes("Tier-0 ASN 65001 is used by Management, WLD-01: each Tier-0 needs its own ASN."));
  assert.ok(open.includes("WLD-02: Tier-0 ASN 64000 isn't a private ASN (64512-65534 or 4200000000-4294967294)."));
  assert.throws(() => nsx.nsxOps(d, w1.id, "peerAsn", "65a"), /whole number/);
  d = must(d, nsx.nsxOps(d, w2.id, "localAsn", ""));
  assert.equal(d.network.domains[w2.id], undefined);
  // distributed with edges: kept, flagged
  d = must(d, nsx.nsxOps(d, w2.id, "model", "distributed"));
  assert.ok(nsx.nsxOpen(d).includes("WLD-02: distributed connectivity doesn't need its 2 edge nodes unless you need NAT or other stateful north/south services. Remove them in Topology if not."));
  assert.equal(dom(d, "WLD-02").edges.length, 1, "edges are never removed by the tool");
  // Use recommended keeps the ASNs
  d = must(d, steps.recommendOps(d, "nsx"));
  assert.deepStrictEqual(d.network.domains, { [m.id]: { localAsn: 65001 }, [w1.id]: { localAsn: 65001 } });
  assert.equal(steps.stepState(d, "nsx").state, "recommended");
});

test("NSX: networks and blocks per domain; sizing never changes", () => {
  const d0 = caseDesign("vdefend-atp"), r0 = store.sizeDesign(d0), w1 = dom(d0, "WLD-01");
  assert.deepStrictEqual(nsx.nsxNetworks(d0, w1), [
    { net: "Edge TEP (own VLAN), MTU 9000", size: "IP pool", ips: "14" },
    { net: "Tier-0 peering VLAN A", size: "/28 or larger", ips: "" }, { net: "Tier-0 peering VLAN B", size: "/28 or larger", ips: "" },
    { net: "VPC external IP block (enterprise routable)", size: "/24", ips: "" }]);
  let d = must(d0, [...nsx.nsxOps(d0, w1.id, "model", "distributed")]);
  d = must(d, [...nsx.nsxOps(d, w1.id, "localAsn", "65010"), ...[]]);
  assert.deepStrictEqual(nsx.nsxNetworks(d, dom(d, "WLD-01")).map(x => x.net), ["Edge TEP (own VLAN), MTU 9000", "VPC external IP block (from the external VLAN CIDR)", "Private transit gateway IP block (not routed)"]);
  assert.deepStrictEqual(store.sizeDesign(d), r0);
});

test("NSX: a saved file keeps only known values for domains in the design", () => {
  const d = caseDesign("vdefend-atp"), w1 = dom(d, "WLD-01");
  const raw = { ...JSON.parse(engine.serializeDesign(d)) };
  raw.network.domains = { [w1.id]: { model: "flat", t0Ha: "as", tgwHa: "x", bfd: "yes", edgeTep: "shared", extPrefix: 40, privPrefix: 22, localAsn: 65001.5, peerAsn: 65000 }, nope: { model: "distributed" } };
  const r = engine.loadDesign(raw); if (r.kind !== "design") throw new Error();
  assert.deepStrictEqual(r.design.network.domains, { [w1.id]: { t0Ha: "as", edgeTep: "shared", privPrefix: 22, peerAsn: 65000 } });
});

test("the NSX knowledge file has a source, a link and a verified date for each table", () => {
  const k = JSON.parse(readText(new URL("../knowledge/nsx.json", import.meta.url), "utf8"));
  for (const [name, t] of Object.entries(k.tables) as [string, { source: string; url: string; verified: string }][]) assert.ok(t.source && /^https:\/\/techdocs\.broadcom\.com\//.test(t.url) && /^\d{4}-\d\d-\d\d$/.test(t.verified), name);
});

// ---------- IP / VLAN / DNS plan (4d) ----------
import * as ip from "../../studio/src/ip.ts";
test("a format 6 design opens with an empty plan and its NSX choices kept", () => {
  const raw = JSON.parse(readText(new URL("../fixtures/designs/format-6.vcf-design.json", import.meta.url), "utf8"));
  assert.equal(raw.formatVersion, 6);
  const r = engine.loadDesign(raw); if (r.kind !== "design") throw new Error();
  assert.equal(r.design.formatVersion, engine.FORMAT_VERSION);
  assert.deepStrictEqual(r.design.plan, engine.newPlan()); assert.deepStrictEqual(r.design.network, raw.network);
});

test("plan: IPv4 subnets parse strictly", () => {
  assert.deepStrictEqual(ip.parseCidr("10.1.2.0/24"), { net: ((10 << 24) >>> 0) + (1 << 16) + (2 << 8), prefix: 24, hostBits: false });
  assert.equal(ip.parseCidr("10.1.2.5/24")!.hostBits, true);
  for (const bad of ["10.1.2/24", "10.1.2.256/24", "10.1.2.0/33", "10.1.2.0", "fe80::/64"]) assert.equal(ip.parseCidr(bad), null, bad);
  assert.equal(ip.cidrText(ip.parseCidr("192.168.10.0/23")!), "192.168.10.0/23");
});

test("plan: records and networks follow the design (VCF 9.1 first-instance counts)", () => {
  const d = caseDesign("vdefend-atp"), r = store.sizeDesign(d), recs = ip.dnsRecords(d, r);
  const get = (l: string) => recs.filter(x => x.label.startsWith(l));
  assert.equal(get("vCenter")[0].fqdn, 3, "management + two workload domains");
  assert.equal(get("NSX Manager node")[0].fqdn, 6, "management NSX (HA: 3) + WLD-01 dedicated (3)");
  assert.equal(get("NSX Manager cluster VIP")[0].fqdn, 2);
  assert.equal(get("VCF Operations")[0].fqdn, 3, "HA profile");
  assert.equal(get("VCF Automation (")[0].ips, 5);
  assert.equal(get("VCF Identity Broker").length, 0, "identity mode not chosen yet");
  assert.equal(get("NSX Edge node")[0].ips, 11);
  const hosts = hostnet.hostsByCluster(r);
  for (const x of get("ESX host")) assert.equal(x.ips, hosts.get(x.net.split(":")[0]));
  const nets = ip.planNets(d, r), mg = nets.find(n => n.key.endsWith(":vmmgmt"))!;
  assert.equal(mg.need, recs.filter(x => x.net === mg.key).reduce((a, x) => a + x.ips, 0));
  assert.ok(2 ** (32 - mg.prefix) - 3 >= mg.need * 2, "room for twice today's addresses");
  const w1 = dom(d, "WLD-01");
  assert.deepStrictEqual(nets.filter(n => n.key.startsWith(w1.id + ":")).map(n => [n.name, n.need, n.prefix]), [["Edge TEP", 14, 27], ["Tier-0 peering A", 8, 28], ["Tier-0 peering B", 8, 28], ["VPC external IP block", 0, 24]]);
  // identity in instance mode adds its FQDN; distributed drops peering and adds the private block; shared TEPs fold into the host TEP
  let d2 = must(d, [{ op: "set", path: ["identity", "mode"], value: "instance" }, ...nsx.nsxOps(d, w1.id, "model", "distributed")]);
  d2 = must(d2, nsx.nsxOps(d2, w1.id, "edgeTep", "shared"));
  assert.equal(ip.dnsRecords(d2, r).filter(x => x.label === "VCF Identity Broker").length, 1);
  const n2 = ip.planNets(d2, r).filter(n => n.key.startsWith(w1.id + ":")).map(n => n.name);
  assert.deepStrictEqual(n2, ["VPC external IP block", "Private transit gateway block"]);
  const c1 = w1.clusters[0], tep = ip.planNets(d2, r).find(n => n.key === `${c1.id}:tep`)!;
  assert.equal(tep.name, "Host and edge TEP"); assert.equal(tep.need, hosts.get(c1.id)! * 2 + 14);
});

test("plan: the proposer fills only empty rows, without overlaps, and the result passes every check", () => {
  let d = caseDesign("vdefend-atp"); const r = store.sizeDesign(d);
  assert.throws(() => ip.proposePlan(d, r), /base block/);
  const c1 = dom(d, "WLD-01").clusters[0];
  d = must(d, [{ op: "set", path: ["plan", "base"], value: "10.10.0.0/16" }, { op: "set", path: ["plan", "vlanStart"], value: 1610 }]);
  d = must(d, [...ip.planOps(d, `${c1.id}:vmotion`, "vlan", "1611"), ...[]]);
  d = must(d, ip.planOps(d, `${c1.id}:vmotion`, "cidr", "10.10.0.0/26"));
  d = must(d, ip.planOps(d, `${c1.id}:vmotion`, "gw", "10.10.0.62"));
  d = must(d, ip.proposePlan(d, r));
  assert.deepStrictEqual(d.plan.rows[`${c1.id}:vmotion`], { vlan: 1611, cidr: "10.10.0.0/26", gw: "10.10.0.62" }, "entered row kept");
  const nets = ip.planNets(d, r);
  for (const n of nets) { const x = d.plan.rows[n.key]; assert.ok(x && x.cidr && ip.parseCidr(x.cidr)!.prefix === (n.key === `${c1.id}:vmotion` ? 26 : n.prefix), n.key); if (n.kind === "vlan") assert.ok(x.vlan && x.gw, n.key); }
  assert.equal(new Set(nets.filter(n => n.kind === "vlan").map(n => d.plan.rows[n.key].vlan)).size, nets.filter(n => n.kind === "vlan").length, "a VLAN each");
  assert.deepStrictEqual(ip.planIssues(d, r), { issues: [], missing: 0 });
  assert.deepStrictEqual(store.sizeDesign(d), r, "sizing unchanged");
  // too small a base
  const small = must(caseDesign("vdefend-atp"), [{ op: "set", path: ["plan", "base"], value: "10.10.0.0/24" }, { op: "set", path: ["plan", "vlanStart"], value: 100 }]);
  assert.throws(() => ip.proposePlan(small, r), /too small for the plan/);
});

test("plan: checks catch too-small subnets, overlaps, duplicate VLANs, gateways and reserved ranges; shared subnets add up", () => {
  let d = caseDesign("vdefend-atp"); const r = store.sizeDesign(d);
  const w1 = dom(d, "WLD-01"), c1 = w1.clusters[0], c2 = w1.clusters[1], n1 = hostnet.hostsByCluster(r).get(c1.id)!;
  const set = (key: string, vlan: string, cidr: string, gw: string) => { d = must(d, ip.planOps(d, key, "vlan", vlan)); d = must(d, ip.planOps(d, key, "cidr", cidr)); d = must(d, ip.planOps(d, key, "gw", gw)); };
  set(`${c1.id}:esx`, "10", "10.0.0.0/28", "10.0.0.1");          // 14 hosts, 13 usable
  set(`${c1.id}:vmotion`, "11", "10.0.0.8/29", "10.0.0.9");       // overlaps the one above
  set(`${c1.id}:vsan`, "10", "10.0.1.0/24", "");                  // VLAN 10 again, other subnet; no gateway
  set(`${c1.id}:tep`, "12", "198.18.4.0/24", "198.18.4.1");       // reserved
  set(`${c2.id}:esx`, "13", "10.0.2.0/27", "10.0.2.40");          // gateway outside
  set(`${c2.id}:vmotion`, "14", "10.0.3.5/24", "10.0.3.1");       // host bits
  const t = ip.planIssues(d, r).issues.map(i => i.t).join("\n");
  assert.match(t, new RegExp(`ESX management \\(WLD-01 / ${c1.name}\\): 10.0.0.0/28 is too small: ${n1} addresses needed, 13 usable`));
  assert.match(t, /10\.0\.0\.0\/28 \(ESX management .*\) overlaps 10\.0\.0\.8\/29/);
  assert.match(t, /VLAN 10 is used for different subnets/);
  assert.match(t, /vSAN \(WLD-01 .*\): enter the gateway\./);
  assert.match(t, /198\.18\.4\.0\/24 overlaps 198\.18\.0\.0\/15, reserved for VCF services runtime/);
  assert.match(t, /gateway 10\.0\.2\.40 isn't a usable address in 10\.0\.2\.0\/27/);
  assert.match(t, /10\.0\.3\.5\/24 has host bits set\. Did you mean 10\.0\.3\.0\/24\?/);
  // two networks on one subnet and VLAN: shared, and their needs add up
  d = caseDesign("vdefend-atp");
  set(`${c2.id}:esx`, "20", "10.0.9.0/28", "10.0.9.1"); set(`${c2.id}:vmotion`, "20", "10.0.9.0/28", "10.0.9.1");
  assert.deepStrictEqual(ip.planIssues(d, r).issues.filter(i => i.t.includes("10.0.9.0/28")), [], "3 + 3 hosts: 6 of 13 usable, room to grow");
  set(`${c2.id}:esx`, "20", "10.0.9.0/29", "10.0.9.1"); set(`${c2.id}:vmotion`, "20", "10.0.9.0/29", "10.0.9.1");
  assert.ok(ip.planIssues(d, r).issues.some(i => i.lvl === "crit" && /^10\.0\.9\.0\/29 \(shared by .*\) is too small: 6 addresses needed, 5 usable/.test(i.t)));
  set(`${c2.id}:esx`, "20", "10.0.9.0/28", "10.0.9.1"); set(`${c2.id}:vmotion`, "20", "10.0.9.0/28", "10.0.9.1");
  set(`${c2.id}:vsan`, "21", "10.0.9.0/28", "10.0.9.1");
  assert.ok(ip.planIssues(d, r).issues.some(i => /10\.0\.9\.0\/28 is used by .* on different VLANs/.test(i.t)));
  set(`${c1.id}:tep`, "30", "10.0.20.0/27", "10.0.20.1");     // fits today (29 usable), not twice
  assert.ok(ip.planIssues(d, r).issues.some(i => i.lvl === "warn" && i.t.startsWith(`Host TEP (WLD-01 / ${c1.name}): 10.0.20.0/27 has little room to grow (${n1 * 2} of 29`)));
  assert.throws(() => ip.planOps(d, `${c2.id}:esx`, "vlan", "5000"), /1 to 4094/);
  // host management and the management VMs on one VLAN: flagged
  const vmKey = ip.planNets(d, r).find(n => n.key.endsWith(":vmmgmt"))!.key;
  set(vmKey, "20", "10.0.9.0/28", "10.0.9.1");
  assert.ok(ip.planIssues(d, r).issues.some(i => i.lvl === "warn" && new RegExp(`^ESX management \\(WLD-01 / ${c2.name}\\) shares VLAN 20 with VM management`).test(i.t)));
});

test("plan: rows for removed clusters are dropped on load; rows are kept through a save", () => {
  let d = caseDesign("vdefend-atp"); const c = dom(d, "WLD-01").clusters[1];
  d = must(d, ip.planOps(d, `${c.id}:esx`, "cidr", "10.0.0.0/27"));
  const again = engine.loadDesign(JSON.parse(engine.serializeDesign(d))); if (again.kind !== "design") throw new Error();
  assert.deepStrictEqual(again.design.plan.rows, { [`${c.id}:esx`]: { cidr: "10.0.0.0/27" } });
  d = must(d, edit.actionOps(d, { act: "delClu", id: c.id }).ops);
  assert.deepStrictEqual(d.plan.rows, {});
});

test("the IP plan knowledge file has a source, a link and a verified date for each table", () => {
  const k = JSON.parse(readText(new URL("../knowledge/ipplan.json", import.meta.url), "utf8"));
  for (const [name, t] of Object.entries(k.tables) as [string, { source: string; url: string; verified: string }][]) assert.ok(t.source && /^https:\/\/techdocs\.broadcom\.com\//.test(t.url) && /^\d{4}-\d\d-\d\d$/.test(t.verified), name);
});

test("plan: an additional instance has its own per-instance components and none of the fleet ones (VCF 9.1 additional-instance page)", () => {
  const d = caseDesign("multi-instance"), r = store.sizeDesign(d), [i1, i2] = d.topology.instances;
  assert.ok(d.fleet.automation);
  const labels = (inst: engine.Instance) => ip.dnsRecords(d, r).filter(x => x.inst === inst && !x.label.startsWith("ESX host")).map(x => x.label);
  const per = ["SDDC Manager", "Cloud Proxy", "VCF management services: instance components", "VCF services runtime", "VCF Automation (3 nodes + 2 spare IPs)"];
  const fleet = ["VCF Operations (primary, replica, data node)", "License Server", "VCF management services: fleet components", "VCF services runtime (listed under VCF Automation, first instance)"];
  for (const l of [...per, ...fleet]) assert.ok(labels(i1).includes(l), `first instance: ${l}`);
  for (const l of per) assert.ok(labels(i2).includes(l), `additional instance: ${l}`);
  for (const l of fleet) assert.ok(!labels(i2).includes(l), `not in the additional instance: ${l}`);
  assert.ok(labels(i2).some(l => l.startsWith("vCenter")) && labels(i2).includes("NSX Manager cluster VIP"));
});
