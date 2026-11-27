// Loading: design documents (any formatVersion up to the current one), "Copy settings" text from the
// VCF Sizing page (v1, also what its autosave keeps in localStorage "vcfSizer.session"), and
// host-types files. Settings are normalised exactly as the page's applySettings/loadTopo do, except
// that ids from the file are kept (a new id is given only when one is missing or already used).
import { DEFAULTS, CLUSTER_DEFAULTS, PROFILES, IDENTITY, NETWORK, NSX } from "../knowledge.ts";
import { fixHw } from "../hardware.ts";
import type { HostType, Settings, Domain, Instance, Cluster, Edge } from "../types.ts";
import { FORMAT, FORMAT_VERSION, DEFAULT_SCOPE, sectionsFromSettings, settingsFromDesign } from "./document.ts";
import type { Design, DesignGroup, RvtoolsScope, StepChoice } from "./document.ts";
import { STEP_CHOICES, newIdentity, newNetwork, newPlan } from "./document.ts";
import type { Identity, Access, Network, ClusterNet, DomainNsx, Plan, PlanRow } from "./document.ts";
import { migrateDesign } from "./migrations.ts";

type Obj = Record<string, any>;
export type LoadResult =
  | { kind: "design"; from: "design" | "vcf-sizing"; design: Design; notes: string[] }
  | { kind: "hostTypes"; hostTypes: HostType[] };
export interface LoadOptions {
  /** Host types this browser already has (the page's localStorage "vcfSizer.hostTypes"). A settings file without host types uses these, as the page does. */
  browserHostTypes?: Obj[];
}

/** Ids from the file where possible; a fresh one when missing or taken. remap: old id → new id, last one wins (as the page's Map). */
function ids(prefix: string) {
  const used = new Set<string>(), remap = new Map<unknown, string>();
  let n = 0;
  const fresh = (p: string) => { let id; do id = `${p}${++n}`; while (used.has(id)); return id; };
  return {
    take(old: unknown, p = prefix) { const id = typeof old === "string" && old !== "" && !used.has(old) ? old : fresh(p); used.add(id); remap.set(old, id); return id; },
    remap,
  };
}

const newOpts = () => ({ cpuPeak: 0, ramPeak: 0, place: "auto", drTo: "", drMode: "storage" });
const domainDefaults = (name: string, kind: string) => ({ name, kind, vcSize: "medium", nsx: "shared", nsxSize: "large", nsxNodes: 3, clusters: [], edges: [] });

/** The page's settings, host types, topology, scope and groups → a design. Mirrors applySettings + loadTopo. */
function normalize(o: Obj, opt: LoadOptions & { keepSource: boolean }): { design: Design; notes: string[] } {
  // settings: known keys only, defaults for the rest, a known deployment model
  const keep = Object.fromEntries(Object.entries(o.settings || {}).filter(([k]) => k in DEFAULTS || ["customer", "site", "notes"].includes(k)));
  const S = { ...DEFAULTS, customer: "", site: "", notes: "", ...keep } as Settings & Obj;
  if (!PROFILES[S.profile]) S.profile = DEFAULTS.profile;

  // host types
  const hid = ids("h");
  let hostTypes: HostType[];
  const htMap = new Map<unknown, string>();
  if (Array.isArray(o.hostTypes) && o.hostTypes.length) hostTypes = o.hostTypes.map((h: Obj) => { const n = fixHw({ ...h, id: hid.take(h && h.id) }); htMap.set(h && h.id, n.id); return n; });
  else hostTypes = (opt.browserHostTypes || []).map(h => fixHw({ ...h, id: hid.take(h && h.id) }));
  if (!hostTypes.length && o.topo && JSON.stringify(o.topo).includes('"clusters":[{')) hostTypes = [fixHw({ id: hid.take(undefined), name: "Host type 1" })];

  // topology (same order of id assignment as the page: management domain and its clusters, the instance, then workload domains)
  const tid = ids(""), eid = ids("e");
  let osa = 0;
  const dom = (d: Obj, kind: string): Domain => {
    const out = { ...domainDefaults(d.name || "Domain", kind), ...d, kind, id: tid.take(d.id, "d"),
      clusters: (d.clusters || []).map((c: Obj) => {
        const x: Obj = { ...CLUSTER_DEFAULTS, ...c, id: tid.take(c.id, "c"), hostType: htMap.get(c.hostType) || (hostTypes[0] || {} as HostType).id || "" };
        if (x.storage === "osa") { x.storage = "esa"; osa++; }
        delete x.hw;
        return x as Cluster;
      }),
      edges: (d.edges || []).map((e: Obj) => ({ ...e, id: eid.take(e.id, "e") }) as Edge) };
    return out as Domain;
  };
  const instances: Instance[] = o.topo ? (o.topo.instances || []).map((i: Obj, ii: number) => {
    const mg = dom(i.mgmt || { name: "Management", clusters: [] }, "mgmt");
    return { id: tid.take(i.id, "i"), name: i.name || `Instance ${ii + 1}`, profile: PROFILES[i.profile] ? i.profile : "", mgmt: mg, wlds: (i.wlds || []).map((d: Obj) => dom(d, "wld")) };
  }) : [];
  for (const i of instances) for (const d of [i.mgmt, ...i.wlds]) for (const e of d.edges) e.on = e.on === "bm" ? "bm" : (tid.remap.get(e.on) || (d.clusters[0] || {} as Cluster).id);
  if (S.aviSeOn) S.aviSeOn = tid.remap.get(S.aviSeOn) || "";

  const rvtoolsScope = Object.fromEntries(Object.keys(DEFAULT_SCOPE).map(k => [k, { ...DEFAULT_SCOPE, ...(o.scope || {}) }[k]])) as unknown as RvtoolsScope;
  let gid = 1;
  const groups: DesignGroup[] = (o.groups || []).map((g: Obj) => ({ id: gid++, name: g.name, source: opt.keepSource && g.source ? g.source : "manual", include: g.include !== false, values: { ...g.values },
    parsed: opt.keepSource && g.source === "rvtools" && g.parsed && typeof g.parsed === "object" ? { ...g.parsed } : null,
    opts: { ...newOpts(), ...(g.opts || {}), place: (g.opts && g.opts.place && tid.remap.get(g.opts.place)) || "auto", drTo: (g.opts && g.opts.drTo && tid.remap.get(g.opts.drTo)) || "" }, meta: g.meta || null }));

  const clusterIds = new Set(instances.flatMap(i => [i.mgmt, ...i.wlds].flatMap(d => d.clusters.map(c => c.id))));
  const domainIds = new Set(instances.flatMap(i => [i.mgmt.id, ...i.wlds.map(w => w.id)]));
  const scopes = new Set(instances.flatMap(i => [i.id, i.mgmt.id, ...i.wlds.map(w => w.id)]));
  const notes: string[] = [];
  if (osa) notes.push(`${osa} vSAN OSA cluster${osa > 1 ? "s were" : " was"} switched to vSAN ESA.`);
  if (!opt.keepSource && (o.groups || []).some((g: Obj) => g && g.source === "rvtools")) notes.push("RVTools groups load as manual totals.");
  const design: Design = { format: FORMAT, formatVersion: FORMAT_VERSION, ...sectionsFromSettings(S),
    workload: { groups, rvtoolsScope }, hostTypes, topology: { instances },
    identity: identityFrom(o.identity, (id: unknown) => { const n = tid.remap.get(id); return n && scopes.has(n) ? n : undefined; }),
    network: networkFrom(o.network, id => { const n = tid.remap.get(id); return n && clusterIds.has(n) ? n : undefined; }, id => { const n = hid.remap.get(id); return n && hostTypes.some(h => h.id === n) ? n : undefined; },
      id => { const n = tid.remap.get(id); return n && domainIds.has(n) ? n : undefined; }),
    plan: planFrom(o.plan, id => { const n = tid.remap.get(id); return n && (scopes.has(n) || clusterIds.has(n)) ? n : undefined; }),
    // only known choices, keyed by step id (a design from a newer build may know more steps: keep those too)
    decisions: { steps: Object.fromEntries(Object.entries((o.decisions && o.decisions.steps) || {}).filter(([k, v]) => /^[a-z]+$/.test(k) && STEP_CHOICES.includes(v as StepChoice))) as Record<string, StepChoice>,
      // accepted deviations: a reason is required; kept as saved (a deviation whose finding has gone simply no longer shows)
      deviations: Object.fromEntries(Object.entries((o.decisions && o.decisions.deviations) || {}).filter(([k, v]) => /^[A-Z][A-Z0-9-]*@.+$/.test(k) && v && typeof (v as Obj).reason === "string" && (v as Obj).reason.trim())
        .map(([k, v]) => [k, { reason: ((v as Obj).reason as string).trim() }])) } } as Design;
  return { design, notes };
}

const str = (v: unknown) => (typeof v === "string" ? v : "");
/** Identity & access, keeping only known choices. A role whose instance / domain isn't in the design gets scope "" (to choose again), never a wider one. */
function identityFrom(x: Obj | undefined, remap: (id: unknown) => string | undefined): Identity {
  const out = newIdentity(); if (!x || typeof x !== "object") return out;
  if (x.mode in IDENTITY.modes) out.mode = x.mode;
  if (x.idp in IDENTITY.providers) out.idp = x.idp;
  const p = IDENTITY.provisioning[x.provisioning];
  if (p && out.idp && p.for === IDENTITY.providers[out.idp].kind) out.provisioning = x.provisioning;
  out.roles = (Array.isArray(x.roles) ? x.roles : []).filter((r: unknown) => r && typeof r === "object").map((r: Obj) => ({
    group: str(r.group), scope: r.scope === "fleet" ? "fleet" : remap(r.scope) || "",
    access: (["admin", "operator", "readonly"].includes(r.access) ? r.access : "readonly") as Access }));
  const b = x.breakGlass || {};
  out.breakGlass = { holder: str(b.holder), vault: str(b.vault), rotationDays: Number.isFinite(b.rotationDays) && b.rotationDays > 0 ? Math.round(b.rotationDays) : 0, notes: str(b.notes) };
  return out;
}

const int = (v: unknown, lo: number, hi: number) => (typeof v === "number" && Number.isInteger(v) && v >= lo && v <= hi ? v : undefined);
/** Host networking, keeping only known choices and values in range, for clusters and host types that are in the design. */
function networkFrom(x: Obj | undefined, cluster: (id: unknown) => string | undefined, ht: (id: unknown) => string | undefined, domain: (id: unknown) => string | undefined): Network {
  const out = newNetwork(); if (!x || typeof x !== "object") return out;
  out.domain = str(x.domain); out.dns = str(x.dns); out.ntp = str(x.ntp);
  for (const [k, v] of Object.entries(x.hostNics || {})) { const id = ht(k), n = int(v, 2, 8); if (id && n) out.hostNics[id] = n; }
  for (const [k, v] of Object.entries(x.clusters || {})) {
    const id = cluster(k); if (!id || !v || typeof v !== "object") continue;
    const c = v as Obj, n: ClusterNet = {};
    if (c.vds in NETWORK.vdsModels) n.vds = c.vds;
    if (NETWORK.defaults.nicSpeeds.includes(c.nicGbps)) n.nicGbps = c.nicGbps;
    const m = int(c.mtu, NETWORK.mtu.overlayMin, NETWORK.mtu.max); if (m) n.mtu = m;
    if (["pool", "list", "dhcp"].includes(c.tep)) n.tep = c.tep;
    if (Object.keys(n).length) out.clusters[id] = n;
  }
  for (const [k, v] of Object.entries(x.domains || {})) {
    const id = domain(k); if (!id || !v || typeof v !== "object") continue;
    const c = v as Obj, n: DomainNsx = {};
    if (c.model in NSX.models) n.model = c.model;
    for (const h of ["t0Ha", "tgwHa"] as const) if (c[h] === "aa" || c[h] === "as") n[h] = c[h];
    if (typeof c.bfd === "boolean") n.bfd = c.bfd;
    if (c.edgeTep === "separate" || c.edgeTep === "shared") n.edgeTep = c.edgeTep;
    for (const p of ["extPrefix", "privPrefix"] as const) { const v = int(c[p], 8, 30); if (v) n[p] = v; }
    for (const a of ["localAsn", "peerAsn"] as const) { const v = int(c[a], 1, 4294967295); if (v) n[a] = v; }
    if (Object.keys(n).length) out.domains[id] = n;
  }
  return out;
}

/** The IP / VLAN plan: rows for instances, domains and clusters in the design; VLAN 1-4094; addresses kept as typed (checked by the plan, not here). */
function planFrom(x: Obj | undefined, id: (id: unknown) => string | undefined): Plan {
  const out = newPlan(); if (!x || typeof x !== "object") return out;
  out.base = str(x.base).trim(); out.vlanStart = int(x.vlanStart, 1, 4094) || 0;
  for (const [k, v] of Object.entries(x.rows || {})) {
    const m = /^(.+):([a-zA-Z]+)$/.exec(k), n = m && id(m[1]); if (!n || !v || typeof v !== "object") continue;
    const r = v as Obj, row: PlanRow = {};
    const vlan = int(r.vlan, 1, 4094); if (vlan) row.vlan = vlan;
    for (const f of ["cidr", "gw"] as const) { const t = str(r[f]).trim(); if (t) row[f] = t; }
    if (Object.keys(row).length) out.rows[`${n}:${m![2]}`] = row;
  }
  return out;
}

/** Host types from a host-types file: { tool: "vcf-host-types", hostTypes }, a plain array, or the older { presets: [{ name, hw }] }. */
export function parseHostTypesFile(o: unknown): HostType[] {
  const x = o as Obj;
  const list: unknown[] = Array.isArray(x) ? x : (x && x.hostTypes) || ((x && x.presets) || []).map((p: Obj) => ({ ...p.hw, name: p.name }));
  const hid = ids("h");
  const out = list.filter(p => p && typeof p === "object").map(p => fixHw({ ...(p as Obj), id: hid.take((p as Obj).id) }));
  if (!out.length) throw new Error("That file isn't a host types file from this calculator.");
  return out;
}

/** Add imported host types to a list: same name replaces (keeping its id), others are added. Mirrors the page's import. */
export function mergeHostTypes(existing: HostType[], incoming: HostType[]): HostType[] {
  const out = existing.map(h => ({ ...h })), hid = ids("h");
  for (const h of out) hid.take(h.id);
  for (const q of incoming) {
    const i = out.findIndex(x => x.name === q.name);
    if (i >= 0) out[i] = { ...out[i], ...q, id: out[i].id }; else out.push({ ...q, id: hid.take(q.id) });
  }
  return out;
}

/** Load anything the tool can open: a design document, VCF Sizing "Copy settings" text, or a host-types file. */
export function loadDesign(input: unknown, opt: LoadOptions = {}): LoadResult {
  let o: unknown = input;
  if (typeof o === "string") { try { o = JSON.parse(o); } catch { throw new Error("That text isn't valid settings. Copy it again from the calculator."); } }
  if (!o || typeof o !== "object") throw new Error("That isn't a VCF design or settings file.");
  const x = o as Obj;
  if (Array.isArray(x) || x.tool === "vcf-host-types" || (Array.isArray(x.presets) && !x.settings && !x.topo)) return { kind: "hostTypes", hostTypes: parseHostTypesFile(x) };
  if (x.format === FORMAT) {
    const d = migrateDesign(x);
    const flat = { settings: settingsFromDesign(d as Design), hostTypes: d.hostTypes, topo: d.topology, scope: d.workload && d.workload.rvtoolsScope, groups: d.workload && d.workload.groups, decisions: d.decisions, identity: d.identity, network: d.network, plan: d.plan };
    return { kind: "design", from: "design", ...normalize(flat, { ...opt, browserHostTypes: [], keepSource: true }) };
  }
  if (x.tool !== undefined && x.tool !== "vcf") throw new Error(`This is a ${String(x.tool).toUpperCase()} file, not a VCF design.`);
  return { kind: "design", from: "vcf-sizing", ...normalize(x, { ...opt, keepSource: false }) };
}

/** A design as text, ready to save or copy. */
export function serializeDesign(d: Design): string { return JSON.stringify(d, null, 1); }
