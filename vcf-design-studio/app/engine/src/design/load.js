// Built from TypeScript by studio/build.mjs. Edit the .ts source, then run npm run build.
// Loading: design documents (any formatVersion up to the current one), "Copy settings" text from the
// VCF Sizing page (v1, also what its autosave keeps in localStorage "vcfSizer.session"), and
// host-types files. Settings are normalised exactly as the page's applySettings/loadTopo do, except
// that ids from the file are kept (a new id is given only when one is missing or already used).
import { DEFAULTS, CLUSTER_DEFAULTS, PROFILES, IDENTITY, NETWORK, NSX } from "../knowledge.js";
import { fixHw } from "../hardware.js";
                                                                                       
import { FORMAT, FORMAT_VERSION, DEFAULT_SCOPE, sectionsFromSettings, settingsFromDesign } from "./document.js";
                                                                                   
import { STEP_CHOICES, newIdentity, newNetwork } from "./document.js";
                                                                                      
import { migrateDesign } from "./migrations.js";

                               
                        
                                                                                      
                                                 
                              
                                                                                                                                                             
                           
 

/** Ids from the file where possible; a fresh one when missing or taken. remap: old id → new id, last one wins (as the page's Map). */
function ids(prefix        ) {
  const used = new Set        (), remap = new Map                 ();
  let n = 0;
  const fresh = (p        ) => { let id; do id = `${p}${++n}`; while (used.has(id)); return id; };
  return {
    take(old         , p = prefix) { const id = typeof old === "string" && old !== "" && !used.has(old) ? old : fresh(p); used.add(id); remap.set(old, id); return id; },
    remap,
  };
}

const newOpts = () => ({ cpuPeak: 0, ramPeak: 0, place: "auto", drTo: "", drMode: "storage" });
const domainDefaults = (name        , kind        ) => ({ name, kind, vcSize: "medium", nsx: "shared", nsxSize: "large", nsxNodes: 3, clusters: [], edges: [] });

/** The page's settings, host types, topology, scope and groups → a design. Mirrors applySettings + loadTopo. */
function normalize(o     , opt                                       )                                      {
  // settings: known keys only, defaults for the rest, a known deployment model
  const keep = Object.fromEntries(Object.entries(o.settings || {}).filter(([k]) => k in DEFAULTS || ["customer", "site", "notes"].includes(k)));
  const S = { ...DEFAULTS, customer: "", site: "", notes: "", ...keep }                  ;
  if (!PROFILES[S.profile]) S.profile = DEFAULTS.profile;

  // host types
  const hid = ids("h");
  let hostTypes            ;
  const htMap = new Map                 ();
  if (Array.isArray(o.hostTypes) && o.hostTypes.length) hostTypes = o.hostTypes.map((h     ) => { const n = fixHw({ ...h, id: hid.take(h && h.id) }); htMap.set(h && h.id, n.id); return n; });
  else hostTypes = (opt.browserHostTypes || []).map(h => fixHw({ ...h, id: hid.take(h && h.id) }));
  if (!hostTypes.length && o.topo && JSON.stringify(o.topo).includes('"clusters":[{')) hostTypes = [fixHw({ id: hid.take(undefined), name: "Host type 1" })];

  // topology (same order of id assignment as the page: management domain and its clusters, the instance, then workload domains)
  const tid = ids(""), eid = ids("e");
  let osa = 0;
  const dom = (d     , kind        )         => {
    const out = { ...domainDefaults(d.name || "Domain", kind), ...d, kind, id: tid.take(d.id, "d"),
      clusters: (d.clusters || []).map((c     ) => {
        const x      = { ...CLUSTER_DEFAULTS, ...c, id: tid.take(c.id, "c"), hostType: htMap.get(c.hostType) || (hostTypes[0] || {}            ).id || "" };
        if (x.storage === "osa") { x.storage = "esa"; osa++; }
        delete x.hw;
        return x           ;
      }),
      edges: (d.edges || []).map((e     ) => ({ ...e, id: eid.take(e.id, "e") })        ) };
    return out          ;
  };
  const instances             = o.topo ? (o.topo.instances || []).map((i     , ii        ) => {
    const mg = dom(i.mgmt || { name: "Management", clusters: [] }, "mgmt");
    return { id: tid.take(i.id, "i"), name: i.name || `Instance ${ii + 1}`, profile: PROFILES[i.profile] ? i.profile : "", mgmt: mg, wlds: (i.wlds || []).map((d     ) => dom(d, "wld")) };
  }) : [];
  for (const i of instances) for (const d of [i.mgmt, ...i.wlds]) for (const e of d.edges) e.on = e.on === "bm" ? "bm" : (tid.remap.get(e.on) || (d.clusters[0] || {}           ).id);
  if (S.aviSeOn) S.aviSeOn = tid.remap.get(S.aviSeOn) || "";

  const rvtoolsScope = Object.fromEntries(Object.keys(DEFAULT_SCOPE).map(k => [k, { ...DEFAULT_SCOPE, ...(o.scope || {}) }[k]]))                           ;
  let gid = 1;
  const groups                = (o.groups || []).map((g     ) => ({ id: gid++, name: g.name, source: opt.keepSource && g.source ? g.source : "manual", include: g.include !== false, values: { ...g.values },
    parsed: opt.keepSource && g.source === "rvtools" && g.parsed && typeof g.parsed === "object" ? { ...g.parsed } : null,
    opts: { ...newOpts(), ...(g.opts || {}), place: (g.opts && g.opts.place && tid.remap.get(g.opts.place)) || "auto", drTo: (g.opts && g.opts.drTo && tid.remap.get(g.opts.drTo)) || "" }, meta: g.meta || null }));

  const clusterIds = new Set(instances.flatMap(i => [i.mgmt, ...i.wlds].flatMap(d => d.clusters.map(c => c.id))));
  const domainIds = new Set(instances.flatMap(i => [i.mgmt.id, ...i.wlds.map(w => w.id)]));
  const scopes = new Set(instances.flatMap(i => [i.id, i.mgmt.id, ...i.wlds.map(w => w.id)]));
  const notes           = [];
  if (osa) notes.push(`${osa} vSAN OSA cluster${osa > 1 ? "s were" : " was"} switched to vSAN ESA.`);
  if (!opt.keepSource && (o.groups || []).some((g     ) => g && g.source === "rvtools")) notes.push("RVTools groups load as manual totals.");
  const design         = { format: FORMAT, formatVersion: FORMAT_VERSION, ...sectionsFromSettings(S),
    workload: { groups, rvtoolsScope }, hostTypes, topology: { instances },
    identity: identityFrom(o.identity, (id         ) => { const n = tid.remap.get(id); return n && scopes.has(n) ? n : undefined; }),
    network: networkFrom(o.network, id => { const n = tid.remap.get(id); return n && clusterIds.has(n) ? n : undefined; }, id => { const n = hid.remap.get(id); return n && hostTypes.some(h => h.id === n) ? n : undefined; },
      id => { const n = tid.remap.get(id); return n && domainIds.has(n) ? n : undefined; }),
    // only known choices, keyed by step id (a design from a newer build may know more steps: keep those too)
    decisions: { steps: Object.fromEntries(Object.entries((o.decisions && o.decisions.steps) || {}).filter(([k, v]) => /^[a-z]+$/.test(k) && STEP_CHOICES.includes(v              )))                               } }          ;
  return { design, notes };
}

const str = (v         ) => (typeof v === "string" ? v : "");
/** Identity & access, keeping only known choices. A role whose instance / domain isn't in the design gets scope "" (to choose again), never a wider one. */
function identityFrom(x                 , remap                                     )           {
  const out = newIdentity(); if (!x || typeof x !== "object") return out;
  if (x.mode in IDENTITY.modes) out.mode = x.mode;
  if (x.idp in IDENTITY.providers) out.idp = x.idp;
  const p = IDENTITY.provisioning[x.provisioning];
  if (p && out.idp && p.for === IDENTITY.providers[out.idp].kind) out.provisioning = x.provisioning;
  out.roles = (Array.isArray(x.roles) ? x.roles : []).filter((r         ) => r && typeof r === "object").map((r     ) => ({
    group: str(r.group), scope: r.scope === "fleet" ? "fleet" : remap(r.scope) || "",
    access: (["admin", "operator", "readonly"].includes(r.access) ? r.access : "readonly")           }));
  const b = x.breakGlass || {};
  out.breakGlass = { holder: str(b.holder), vault: str(b.vault), rotationDays: Number.isFinite(b.rotationDays) && b.rotationDays > 0 ? Math.round(b.rotationDays) : 0, notes: str(b.notes) };
  return out;
}

const int = (v         , lo        , hi        ) => (typeof v === "number" && Number.isInteger(v) && v >= lo && v <= hi ? v : undefined);
/** Host networking, keeping only known choices and values in range, for clusters and host types that are in the design. */
function networkFrom(x                 , cluster                                     , ht                                     , domain                                     )          {
  const out = newNetwork(); if (!x || typeof x !== "object") return out;
  out.domain = str(x.domain); out.dns = str(x.dns); out.ntp = str(x.ntp);
  for (const [k, v] of Object.entries(x.hostNics || {})) { const id = ht(k), n = int(v, 2, 8); if (id && n) out.hostNics[id] = n; }
  for (const [k, v] of Object.entries(x.clusters || {})) {
    const id = cluster(k); if (!id || !v || typeof v !== "object") continue;
    const c = v       , n             = {};
    if (c.vds in NETWORK.vdsModels) n.vds = c.vds;
    if (NETWORK.defaults.nicSpeeds.includes(c.nicGbps)) n.nicGbps = c.nicGbps;
    const m = int(c.mtu, NETWORK.mtu.overlayMin, NETWORK.mtu.max); if (m) n.mtu = m;
    if (["pool", "list", "dhcp"].includes(c.tep)) n.tep = c.tep;
    if (Object.keys(n).length) out.clusters[id] = n;
  }
  for (const [k, v] of Object.entries(x.domains || {})) {
    const id = domain(k); if (!id || !v || typeof v !== "object") continue;
    const c = v       , n            = {};
    if (c.model in NSX.models) n.model = c.model;
    for (const h of ["t0Ha", "tgwHa"]         ) if (c[h] === "aa" || c[h] === "as") n[h] = c[h];
    if (typeof c.bfd === "boolean") n.bfd = c.bfd;
    if (c.edgeTep === "separate" || c.edgeTep === "shared") n.edgeTep = c.edgeTep;
    for (const p of ["extPrefix", "privPrefix"]         ) { const v = int(c[p], 8, 30); if (v) n[p] = v; }
    for (const a of ["localAsn", "peerAsn"]         ) { const v = int(c[a], 1, 4294967295); if (v) n[a] = v; }
    if (Object.keys(n).length) out.domains[id] = n;
  }
  return out;
}

/** Host types from a host-types file: { tool: "vcf-host-types", hostTypes }, a plain array, or the older { presets: [{ name, hw }] }. */
export function parseHostTypesFile(o         )             {
  const x = o       ;
  const list            = Array.isArray(x) ? x : (x && x.hostTypes) || ((x && x.presets) || []).map((p     ) => ({ ...p.hw, name: p.name }));
  const hid = ids("h");
  const out = list.filter(p => p && typeof p === "object").map(p => fixHw({ ...(p       ), id: hid.take((p       ).id) }));
  if (!out.length) throw new Error("That file isn't a host types file from this calculator.");
  return out;
}

/** Add imported host types to a list: same name replaces (keeping its id), others are added. Mirrors the page's import. */
export function mergeHostTypes(existing            , incoming            )             {
  const out = existing.map(h => ({ ...h })), hid = ids("h");
  for (const h of out) hid.take(h.id);
  for (const q of incoming) {
    const i = out.findIndex(x => x.name === q.name);
    if (i >= 0) out[i] = { ...out[i], ...q, id: out[i].id }; else out.push({ ...q, id: hid.take(q.id) });
  }
  return out;
}

/** Load anything the tool can open: a design document, VCF Sizing "Copy settings" text, or a host-types file. */
export function loadDesign(input         , opt              = {})             {
  let o          = input;
  if (typeof o === "string") { try { o = JSON.parse(o); } catch { throw new Error("That text isn't valid settings. Copy it again from the calculator."); } }
  if (!o || typeof o !== "object") throw new Error("That isn't a VCF design or settings file.");
  const x = o       ;
  if (Array.isArray(x) || x.tool === "vcf-host-types" || (Array.isArray(x.presets) && !x.settings && !x.topo)) return { kind: "hostTypes", hostTypes: parseHostTypesFile(x) };
  if (x.format === FORMAT) {
    const d = migrateDesign(x);
    const flat = { settings: settingsFromDesign(d          ), hostTypes: d.hostTypes, topo: d.topology, scope: d.workload && d.workload.rvtoolsScope, groups: d.workload && d.workload.groups, decisions: d.decisions, identity: d.identity, network: d.network };
    return { kind: "design", from: "design", ...normalize(flat, { ...opt, browserHostTypes: [], keepSource: true }) };
  }
  if (x.tool !== undefined && x.tool !== "vcf") throw new Error(`This is a ${String(x.tool).toUpperCase()} file, not a VCF design.`);
  return { kind: "design", from: "vcf-sizing", ...normalize(x, { ...opt, keepSource: false }) };
}

/** A design as text, ready to save or copy. */
export function serializeDesign(d        )         { return JSON.stringify(d, null, 1); }
