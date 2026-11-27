// Edits the Expert view makes, as proposals: one field, or a structural change (add, duplicate, remove).
// The rules are the VCF Sizing page's own (its topology change and click handlers), so the same input
// gives the same design. No DOM here; tested in engine/test/studio.test.ts.
import { CLUSTER_DEFAULTS, POL, IDENTITY, fixHw, maxFor, isVsan } from "../../engine/src/index.ts";
import type { Design, Cluster, Domain, Instance, Edge } from "../../engine/src/index.ts";
import type { Op, Path } from "./store.ts";

type Obj = Record<string, unknown>;

/** A fresh id with this prefix, unused anywhere in the design. */
export function newId(d: Design, prefix: string): string {
  const used = new Set<string>();
  for (const h of d.hostTypes) used.add(h.id);
  for (const i of d.topology.instances) { used.add(i.id); for (const dm of [i.mgmt, ...i.wlds]) { used.add(dm.id); dm.clusters.forEach(c => used.add(c.id)); dm.edges.forEach(e => used.add(e.id)); } }
  let n = 1; while (used.has(prefix + n)) n++;
  return prefix + n;
}

export interface Located { kind: "inst" | "dom" | "clu" | "edge"; path: Path; inst: Instance; dom?: Domain; obj: Obj }
/** Where an instance, domain, cluster or edge lives in the design, by id. */
export function locate(d: Design, id: string): Located | null {
  for (const [ii, inst] of d.topology.instances.entries()) {
    const ip: Path = ["topology", "instances", ii];
    if (inst.id === id) return { kind: "inst", path: ip, inst, obj: inst as unknown as Obj };
    const doms: [Domain, Path][] = [[inst.mgmt, [...ip, "mgmt"]], ...inst.wlds.map((w, k) => [w, [...ip, "wlds", k]] as [Domain, Path])];
    for (const [dom, dp] of doms) {
      if (dom.id === id) return { kind: "dom", path: dp, inst, dom, obj: dom as unknown as Obj };
      for (const [k, c] of dom.clusters.entries()) if (c.id === id) return { kind: "clu", path: [...dp, "clusters", k], inst, dom, obj: c as unknown as Obj };
      for (const [k, e] of dom.edges.entries()) if (e.id === id) return { kind: "edge", path: [...dp, "edges", k], inst, dom, obj: e as unknown as Obj };
    }
  }
  return null;
}

/** Ops for one field of an instance, domain, cluster or edge, with the page's follow-on rules. */
export function fieldOps(d: Design, id: string, key: string, value: unknown): Op[] {
  const at = locate(d, id); if (!at) throw new Error(`nothing with id ${id}`);
  const o = { ...at.obj, [key]: value } as Obj;
  if (at.kind === "clu") {
    const c = o as unknown as Cluster;
    if (key === "name") c.name = String(value).trim() || (at.obj as unknown as Cluster).name;
    if (key === "maxHosts") c.maxHosts = Math.min(maxFor(c), Math.max(2, Math.round(value as number)));
    if (key === "fixedHosts") c.fixedHosts = Math.min(maxFor(c), Math.max(0, Math.round(value as number)));
    if (key === "storage") c.maxHosts = Math.min(c.maxHosts, maxFor(c));
    if (c.fixedHosts > 0 && isVsan(c)) {   // a policy the fixed host count can't meet goes back to Auto
      if (c.topo !== "stretched" && c.policy !== "auto" && POL[c.storage][c.policy][2] > c.fixedHosts) c.policy = "auto";
      if (c.topo === "stretched" && !["auto", "none"].includes(c.local) && POL[c.storage][c.local][2] > c.fixedHosts / 2) c.local = "auto";
    }
    if (c.comp < 1) c.comp = 1; if (c.dedupe < 1) c.dedupe = 1;
  }
  if (at.kind === "edge" && key === "nodes") o.nodes = Math.max(1, Math.round(value as number));
  if ((at.kind === "inst" || at.kind === "dom") && key === "name") o.name = String(value).trim() || at.obj.name;
  return Object.keys(o).filter(k => o[k] !== at.obj[k]).map(k => ({ op: "set", path: [...at.path, k], value: o[k] }));
}

/** A host type field: the host type is re-checked (fixHw), as on the page, so only real configurations are kept. */
export function hostTypeOps(d: Design, id: string, key: string, value: unknown): Op[] {
  const k = d.hostTypes.findIndex(h => h.id === id); if (k < 0) throw new Error(`no host type ${id}`);
  const h = d.hostTypes[k], v = key === "name" ? String(value).trim() || h.name : value;
  return [{ op: "set", path: ["hostTypes", k], value: fixHw({ ...h, [key]: v }) }];
}

/** An identity field. Changing the provider clears a provisioning method that doesn't fit it (a directory only syncs). */
export function identityOps(d: Design, key: string, value: unknown): Op[] {
  const ops: Op[] = [{ op: "set", path: ["identity", key], value }];
  if (key === "idp") {
    const kind = value ? IDENTITY.providers[value as string]?.kind : "", p = IDENTITY.provisioning[d.identity.provisioning];
    if (d.identity.provisioning && (!p || p.for !== kind)) ops.push({ op: "set", path: ["identity", "provisioning"], value: "" });
  }
  return ops;
}

/** Moving a design brought in at VCF 9.0 to 9.1: the op, and every number that changes (vSAN dedupe and mirrored tier drives only apply on 9.1). */
export function moveTo91(d: Design, size: (d: Design) => { hosts: number; licCores: number; clusters: { c: { id: string; name: string }; total: number }[] }) {
  const ops: Op[] = [{ op: "set", path: ["project", "version"], value: "9.1" }];
  const next = structuredClone(d); next.project.version = "9.1";
  const a = size(d), b = size(next), by = (r: typeof a) => new Map(r.clusters.map(x => [x.c.name, x.total]));
  const ba = by(a), bb = by(b), names = [...new Set([...ba.keys(), ...bb.keys()])];
  const clusters = names.filter(n => ba.get(n) !== bb.get(n)).map(n => ({ name: n, before: ba.get(n) ?? 0, after: bb.get(n) ?? 0 }));
  return { ops, clusters, hosts: [a.hosts, b.hosts], licCores: [a.licCores, b.licCores] };
}

// ---------- structural changes: computed on a copy, sent as whole sections ----------
const newDomain = (id: string, name: string, kind: string, o: Partial<Domain> = {}): Domain =>
  ({ id, name, kind, vcSize: "medium", nsx: "shared", nsxSize: "large", nsxNodes: 3, clusters: [], edges: [], ...o });

export type Action =
  | { act: "addInst" } | { act: "dupInst"; id: string } | { act: "delInst"; id: string }
  | { act: "addWld"; id: string } | { act: "delDom"; id: string }
  | { act: "addClu"; id: string } | { act: "dupClu"; id: string } | { act: "delClu"; id: string }
  | { act: "addEdge"; id: string } | { act: "delEdge"; id: string }
  | { act: "addHt" } | { act: "dupHt"; id: string } | { act: "delHt"; id: string }
  | { act: "addGroup" } | { act: "delGroup"; index: number } | { act: "resetGroup"; index: number }
  | { act: "addRole" } | { act: "delRole"; index: number } | { act: "suggestRoles" } | { act: "moveTo91" };

/** Starting role matrix: fleet-wide groups at three access levels. Placeholder names, to rename to the customer's groups. */
export const SUGGESTED_ROLES = [
  { group: "vcf-admins", scope: "fleet", access: "admin" }, { group: "vcf-operators", scope: "fleet", access: "operator" }, { group: "vcf-readonly", scope: "fleet", access: "readonly" },
] as const;

/** Ops for a structural change, and the id of anything new (to select it). */
export function actionOps(d0: Design, a: Action): { ops: Op[]; select?: string } {
  const d = structuredClone(d0), T = d.topology;
  let select: string | undefined;
  const at = "id" in a && typeof a.id === "string" ? locate(d, a.id) : null;
  switch (a.act) {
    case "addInst": {
      const id = newId(d, "i"), inst: Instance = { id, name: `Instance ${T.instances.length + 1}`, mgmt: newDomain("", "Management", "mgmt"), wlds: [] } as unknown as Instance;
      T.instances.push(inst); inst.mgmt.id = newId(d, "d"); select = id; break;
    }
    case "dupInst": {
      const src = at!.inst, cp = structuredClone(src), map = new Map<string, string>();
      T.instances.splice(T.instances.indexOf(src) + 1, 0, cp);
      cp.id = "~"; cp.name = `${src.name} copy`; delete cp._prof;
      for (const dm of [cp.mgmt, ...cp.wlds]) { dm.id = "~"; dm.clusters.forEach(c => { c.id = "~"; }); dm.edges.forEach(e => { e.id = "~"; }); }
      cp.id = newId(d, "i");
      for (const [dm, sd] of [cp.mgmt, ...cp.wlds].map((x, k) => [x, [src.mgmt, ...src.wlds][k]] as const)) {
        dm.id = newId(d, "d");
        dm.clusters.forEach((c, k) => { c.id = newId(d, "c"); map.set(sd.clusters[k].id, c.id); c.auto = false; });
        dm.edges.forEach(e => { e.id = newId(d, "e"); });
      }
      for (const dm of [cp.mgmt, ...cp.wlds]) for (const e of dm.edges) if (e.on !== "bm") e.on = map.get(e.on) || (dm.clusters[0] || {} as Cluster).id || "bm";
      select = cp.id; break;
    }
    case "delInst": T.instances = T.instances.filter(i => i.id !== a.id); break;
    case "addWld": {
      const inst = at!.inst, k = inst.wlds.length + 1;
      const w = newDomain(newId(d, "d"), `WLD-${String(k).padStart(2, "0")}`, "wld", { nsx: inst.wlds.some(x => x.nsx === "dedicated") ? "shared" : "dedicated" });
      inst.wlds.push(w); select = w.id; break;
    }
    case "delDom": at!.inst.wlds = at!.inst.wlds.filter(x => x.id !== a.id); break;
    case "addClu": {
      if (!d.hostTypes.length) throw new Error("add a host type first");
      const dm = at!.dom!, ii = T.instances.indexOf(at!.inst);
      const tag = dm.kind === "mgmt" ? `mgmt${ii > 0 ? ii + 1 : ""}` : dm.name.toLowerCase().replace(/[^a-z0-9]+/g, "");
      const prev = dm.clusters[dm.clusters.length - 1];
      const c: Cluster = { id: newId(d, "c"), name: `${tag}-cl${String(dm.clusters.length + 1).padStart(2, "0")}`, ...CLUSTER_DEFAULTS,
        hostType: prev ? prev.hostType : d.hostTypes[0].id, auto: dm.kind !== "mgmt", vdefend: dm.kind !== "mgmt", maxHosts: dm.kind === "mgmt" ? 16 : CLUSTER_DEFAULTS.maxHosts };
      dm.clusters.push(c); select = c.id; break;
    }
    case "dupClu": {
      const dm = at!.dom!, src = at!.obj as unknown as Cluster, c = { ...structuredClone(src), id: newId(d, "c"), name: src.name + "-copy" };
      dm.clusters.splice(dm.clusters.indexOf(src) + 1, 0, c); select = c.id; break;
    }
    case "delClu": {
      const dm = at!.dom!; dm.clusters = dm.clusters.filter(c => c.id !== a.id);
      dm.edges.forEach(x => { if (x.on === a.id) x.on = dm.clusters[0] ? dm.clusters[0].id : "bm"; });
      break;
    }
    case "addEdge": {
      const dm = at!.dom!, e: Edge = { id: newId(d, "e"), name: `edge-${dm.edges.length + 1}`, nodes: 2, size: "large", on: dm.clusters[0] ? dm.clusters[0].id : "bm", bmCores: 32 };
      dm.edges.push(e); break;
    }
    case "delEdge": at!.dom!.edges = at!.dom!.edges.filter(x => x.id !== a.id); break;
    case "addHt": { const h = fixHw({ ...(d.hostTypes[d.hostTypes.length - 1] || {}), id: newId(d, "h"), name: `Host type ${d.hostTypes.length + 1}` }); d.hostTypes.push(h); select = h.id; break; }
    case "dupHt": { const k = d.hostTypes.findIndex(h => h.id === a.id), h = fixHw({ ...d.hostTypes[k], id: newId(d, "h"), name: d.hostTypes[k].name + " copy" }); d.hostTypes.splice(k + 1, 0, h); select = h.id; break; }
    case "delHt": {
      const used = T.instances.some(i => [i.mgmt, ...i.wlds].some(dm => dm.clusters.some(c => c.hostType === a.id)));
      if (used) throw new Error("that host type is used by a cluster");
      d.hostTypes = d.hostTypes.filter(h => h.id !== a.id); break;
    }
    case "addGroup": {
      const gs = d.workload.groups, id = gs.reduce((m, g) => Math.max(m, g.id), 0) + 1;
      gs.push({ id, name: `Manual group ${gs.filter(g => g.source === "manual").length + 1}`, source: "manual", include: true,
        values: { vms: 0, vcpu: 0, vramGiB: 0, usedTiB: 0, allocTiB: 0, templTiB: 0 }, parsed: null, opts: { cpuPeak: 0, ramPeak: 0, place: "auto", drTo: "", drMode: "storage" }, meta: null });
      break;
    }
    case "delGroup": d.workload.groups.splice(a.index, 1); break;
    case "moveTo91": d.project.version = "9.1"; break;
    case "addRole": d.identity.roles.push({ group: "", scope: "fleet", access: "readonly" }); break;
    case "delRole": d.identity.roles.splice(a.index, 1); break;
    case "suggestRoles": d.identity.roles.push(...SUGGESTED_ROLES.map(r => ({ ...r }))); break;
    case "resetGroup": { const g = d.workload.groups[a.index]; if (g && g.parsed) g.values = { ...g.parsed }; break; }
  }
  // groups never point at a cluster that's gone (as on the page)
  const has = (id: string) => !!locate(d, id);
  for (const g of d.workload.groups) if (g.opts) { if (g.opts.place && g.opts.place !== "auto" && !has(g.opts.place)) g.opts.place = "auto"; if (g.opts.drTo && !has(g.opts.drTo)) g.opts.drTo = ""; }
  // a role scoped to a removed instance or domain loses its scope (chosen again), never widens to the fleet
  for (const r of d.identity.roles) if (r.scope && r.scope !== "fleet") { const at = locate(d, r.scope); if (!at || (at.kind !== "inst" && at.kind !== "dom")) r.scope = ""; }
  const ops: Op[] = [];
  for (const k of ["project", "topology", "hostTypes", "workload", "identity"] as const) if (JSON.stringify(d[k]) !== JSON.stringify(d0[k])) ops.push({ op: "set", path: [k], value: d[k] });
  return { ops, select };
}
