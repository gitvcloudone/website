// Built from TypeScript by studio/build.mjs. Edit the .ts source, then run npm run build.
// The AI's tools, in one list: read the design, list what it may change, size a what-if, check the rules,
// explain a cluster, and propose changes. Every number comes from the engine; a proposal is validated the
// same way as any edit and waits for the architect to apply it. No DOM; tested.
import { clusterReason, summaryLine, isVsan, workloadTotals, RULES } from "../../../engine/src/index.js";
                                                                         
import { propose, sizeDesign } from "../store.js";
                                      
import { evaluate, scorecard, scorable } from "../rules.js";
import { stepState } from "../steps.js";
import { STEPS } from "../flow.js";
import { STORAGE } from "../fields.js";
import { effective } from "../hostnet.js";
import { allDomains, effectiveNsx } from "../nsx.js";
import { planIssues } from "../ip.js";
import { catalog, coerce } from "./catalog.js";
                                            
import { backDeep } from "./redact.js";
                                               

/** A change the AI proposed, waiting for the architect. `after` is what the engine says it gives. */
                                                                                                                                                                                                                                                            
                                                                                                                                                                                                                                       
                                                                                                           
                                                                                                       

const nf = (n        ) => Math.round(n * 10) / 10;

export function impactOf(d        , r               = sizeDesign(d))         {
  const res = scorable(d, r) ? evaluate(d, r).filter(x => x.status === "open" && !x.rule.input) : [];
  return { hosts: r.hosts, licCores: r.licCores, addOnTiB: r.lic.addOnTiB,
    clusters: r.clusters.map(x => ({ id: x.c.id, name: x.c.name, hosts: x.total, why: clusterReason(x) })),
    mustFix: r.warnings.filter(w => w.lvl === "crit").map(w => w.t), checks: r.warnings.filter(w => w.lvl === "warn").map(w => w.t),
    openRequired: res.filter(x => x.rule.level === "required").reduce((a, x) => a + x.findings.filter(f => !f.reason).length, 0),
    openRecommended: res.filter(x => x.rule.level === "recommended").reduce((a, x) => a + x.findings.filter(f => !f.reason).length, 0) };
}

/** Clusters a change would fix at fewer hosts than the engine needs (that weren't already short): the AI may not propose these. */
export function newShortfalls(before        , after        )           {
  const was = new Set(sizeDesign(before).clusters.filter(x => x.short).map(x => x.c.id));
  return sizeDesign(after).clusters.filter(x => x.short && !x.c.clone && !was.has(x.c.id)).map(x => `${x.c.name} at ${x.fixed} hosts, but the engine needs ${x.need}`);
}

/** What the AI reads about the design: choices and engine results. Customer facts only as entered / not entered. */
export function designSummary(d        , r               = sizeDesign(d)) {
  const T = workloadTotals(d.workload.groups.map(g => ({ ...g }))         ), entered = (v         ) => (v ? "entered" : "not entered");
  const res = scorable(d, r) ? evaluate(d, r) : [];
  return {
    project: { customer: d.project.customer || "(not named)", site: d.project.site || "", vcfVersion: d.project.version },
    workload: { totals: T, groups: d.workload.groups.filter(g => g.include).map(g => ({ name: g.name, source: g.source, vms: g.values.vms, vcpu: g.values.vcpu, vramGiB: g.values.vramGiB, usedTiB: g.values.usedTiB, allocTiB: g.values.allocTiB, placement: g.opts?.place || "auto", protectedTo: g.opts?.drTo || "" })) },
    policy: d.policy, fleet: d.fleet, addons: d.addons,
    hostTypes: d.hostTypes.map(h => ({ id: h.id, name: h.name, vendor: h.vendor, sockets: h.sockets, coresPerSocket: h.cores, ramGB: h.ramGB, nvme: h.nvme, nvmeTB: h.nvmeTB })),
    topology: d.topology.instances.map(i => ({ id: i.id, name: i.name, model: i.profile || d.fleet.profile, domains: [i.mgmt, ...i.wlds].map(dm => ({ id: dm.id, name: dm.name, kind: dm.kind, nsx: dm.kind === "mgmt" ? "management" : dm.nsx,
      edges: dm.edges.map(e => ({ name: e.name, nodes: e.nodes, size: e.on === "bm" ? "bare metal" : e.size })),
      clusters: dm.clusters.map(c => ({ id: c.id, name: c.name, hostType: c.hostType, storage: STORAGE[c.storage] || c.storage, topo: c.topo, policy: c.policy, spares: c.nPlus, maxHosts: c.maxHosts, fixedHosts: c.fixedHosts,
        memoryTiering: c.tierOn ? `${c.tierPct}%` : "off", supervisor: c.supOn, network: effective(d, c) })) })) })),
    nsx: allDomains(d).map(({ dm }) => ({ domain: dm.name, ...effectiveNsx(d, dm) })),
    identity: { mode: d.identity.mode || "not chosen", identityProvider: entered(d.identity.idp), roles: d.identity.roles.length, breakGlass: entered(d.identity.breakGlass.holder && d.identity.breakGlass.vault) },
    services: { dnsDomain: entered(d.network.domain), dnsServers: entered(d.network.dns), ntpServers: entered(d.network.ntp), ipPlanNetworksMissing: planIssues(d, r).missing },
    sizing: { summary: summaryLine(r), hosts: r.hosts, physicalCores: r.cores, licensedCores: r.licCores, vsanAddOnTiB: r.lic.addOnTiB,
      clusters: r.clusters.map(x => ({ id: x.c.id, name: x.c.name, hosts: x.total, why: clusterReason(x), limiter: x.fixed ? "fixed" : x.limiter, storagePolicy: x.pol?.label || "", neededTiB: nf(x.stor), usableTiB: nf(isVsan(x.c) ? x.usable : x.extTiB) })),
      warnings: r.warnings.filter(w => w.lvl !== "info").map(w => `${w.lvl === "crit" ? "MUST FIX" : "check"}: ${w.t}`) },
    bestPractices: scorable(d, r) ? { open: res.filter(x => x.status === "open").flatMap(x => x.findings.filter(f => !f.reason).map(f => ({ rule: x.rule.id, level: x.rule.level, title: x.rule.title, where: f.where, customerFact: !!x.rule.input }))),
      deviations: res.flatMap(x => x.findings.filter(f => f.reason).map(f => ({ rule: x.rule.id, title: x.rule.title, where: f.where, reason: f.reason }))),
      scorecard: scorecard(d, res).map(p => ({ pillar: p.label, met: p.met, of: p.applicable, open: p.open, atRisk: p.atRisk })) } : "not scored yet: needs a workload and a topology",
    steps: STEPS.filter(s => s.kind === "skippable" || s.kind === "required").map(s => ({ step: s.title, state: stepState(d, s.id).state })),
    aiChangesApplied: d.decisions.ai.map(c => c.summary),
  };
}

/** Turn [{setting, value}] into validated ops on a copy of the design. */
export function changesToOps(d        , changes         , red          ) {
  if (!Array.isArray(changes) || !changes.length) return { ok: false         , error: "Give at least one change as {setting, value}." };
  const cat = new Map(catalog(d).map(s => [s.id, s]));
  let cur = d; const ops       = [], list                        = [];
  for (const raw of changes) {
    const c = backDeep(raw, red)                                         ;
    const s = c && typeof c.setting === "string" ? cat.get(c.setting) : undefined;
    if (!s) return { ok: false         , error: `Unknown or not changeable setting: ${JSON.stringify(c?.setting)}. Use list_settings for ids.` };
    const v = coerce(s, c.value); if (!v.ok) return { ok: false         , error: v.error };
    // build ops against the design as changed so far, so several changes to one place combine
    const fresh = new Map(catalog(cur).map(x => [x.id, x])).get(s.id) || s;
    const o = fresh.ops(v.value), next = propose(cur, { source: "ai", ops: o });
    if (!next.ok) return { ok: false         , error: `${s.id}: ${next.error}` };
    ops.push(...o); cur = next.design; list.push({ setting: s.id, label: s.label, where: s.where, from: s.value, to: v.value });
  }
  // the whole set, applied to the original design in one go, must give the same design
  const all = propose(d, { source: "ai", ops });
  if (!all.ok) return { ok: false         , error: all.error };
  return { ok: true         , ops, design: all.design, changes: list };
}

const CHANGES_SCHEMA = { type: "array", minItems: 1, items: { type: "object", properties: { setting: { type: "string", description: "A setting id from list_settings" }, value: { description: "The new value: a number, true/false, or one of the setting's choices" } }, required: ["setting", "value"] } };

export const TOOLS           = [
  { name: "get_design", description: "Read the whole design: workload, choices, topology, and the engine's sizing, licensing, warnings and best-practice findings. Call this first.",
    input_schema: { type: "object", properties: {} },
    run: (_i, x) => designSummary(x.design) },
  { name: "list_settings", description: "List the settings you may change, with their ids, current and recommended values, and allowed values or ranges. Optional filter by area or id prefix (policy, fleet, addons, hostType, nics, cluster, net, nsx, identity) or by a cluster or domain id.",
    input_schema: { type: "object", properties: { filter: { type: "string" } } },
    run: (i, x) => { const f = typeof i.filter === "string" ? i.filter.toLowerCase() : "";
      return catalog(x.design).filter(s => !f || s.id.toLowerCase().includes(f) || s.where.toLowerCase().includes(f))
        .map(s => ({ id: s.id, where: s.where, label: s.label, value: s.value, recommended: s.recommended, ...(s.choices ? { choices: s.choices } : {}), ...(s.min !== undefined ? { min: s.min, max: s.max } : {}) })); } },
  { name: "what_if", description: "Size the design with some changes, without changing it. Returns before and after: hosts, licensed cores, vSAN add-on, each cluster's hosts and why, warnings and open best practices.",
    input_schema: { type: "object", properties: { changes: CHANGES_SCHEMA }, required: ["changes"] },
    run: (i, x) => { const c = changesToOps(x.design, i.changes, x.red); if (!c.ok) throw new Error(c.error);
      return { changes: c.changes, before: impactOf(x.design), after: impactOf(c.design) }; } },
  { name: "check_rules", description: "The best-practice rules: each with its level (required, recommended, consider), pillar, why it matters, source, and where it is met, open or accepted as a deviation.",
    input_schema: { type: "object", properties: {} },
    run: (_i, x) => { const r = sizeDesign(x.design); if (!scorable(x.design, r)) return "Not scored yet: the design needs a workload and a topology.";
      return evaluate(x.design, r).map(e => ({ id: e.rule.id, level: e.rule.level, pillar: e.rule.pillar, title: e.rule.title, why: e.rule.why, source: e.rule.source, status: e.status, customerFact: !!e.rule.input,
        findings: e.findings.map(f => ({ where: f.where, accepted: f.reason || undefined })) })); } },
  { name: "explain_cluster", description: "Why a cluster has its host count: CPU, memory and storage each on its own, the minimum, spares, the appliances placed on it, and its load.",
    input_schema: { type: "object", properties: { cluster: { type: "string", description: "Cluster id or name" } }, required: ["cluster"] },
    run: (i, x) => { const r = sizeDesign(x.design), k = x.red.back(String(i.cluster || ""));
      const c = r.clusters.find(z => z.c.id === k || z.c.name === k); if (!c) throw new Error(`No cluster ${k}. Clusters: ${r.clusters.map(z => `${z.c.id} (${z.c.name})`).join(", ")}`);
      return { name: c.c.name, hosts: c.total, why: clusterReason(c), cpuHosts: nf(c.cpuH), ramHosts: nf(c.ramH), storageHosts: c.storH, minimum: c.floor, spares: c.c.nPlus, fixed: c.fixed || undefined, maxHosts: c.max,
        hostCores: c.h.cores, hostRamGB: c.h.dram, storage: STORAGE[c.c.storage], policy: c.pol?.label, neededTiB: nf(c.stor), usableTiB: nf(c.usable),
        load: { vms: c.load.vms, vcpu: nf(c.load.vcpu || 0), vramGiB: nf(c.load.vramGiB || 0) }, appliances: c.items.map(a => ({ name: a.name, vcpu: a.vcpu, ramGB: a.ram })) }; } },
  { name: "propose_changes", description: "Propose changes for the architect to review and apply. Nothing changes until they click Apply. Give a one-line summary and the reason. Returns the engine's before and after.",
    input_schema: { type: "object", properties: { summary: { type: "string", description: "One line, e.g. 'Use RAID-6 on wld01-cl01'" }, reason: { type: "string", description: "Why, in a sentence or two" }, changes: CHANGES_SCHEMA }, required: ["summary", "reason", "changes"] },
    run: (i, x) => { const c = changesToOps(x.design, i.changes, x.red); if (!c.ok) throw new Error(c.error);
      const short = newShortfalls(x.design, c.design);
      if (short.length) throw new Error(`Not proposed: it would fix ${x.red.out(short.join("; "))}. Host counts below the engine's figure can't be suggested; use what_if to explore them.`);
      const s             = { id: x.nextId(), summary: x.red.back(String(i.summary || "").trim()) || "AI suggestion", reason: x.red.back(String(i.reason || "").trim()), changes: c.changes, ops: c.ops,
        before: impactOf(x.design), after: impactOf(c.design), status: "pending" };
      x.suggestions.push(s);
      return { proposed: s.id, status: "waiting for the architect to apply it", before: s.before, after: s.after }; } },
];

export const toolSpecs = ()             => TOOLS.map(({ name, description, input_schema }) => ({ name, description, input_schema }));
export const RULE_COUNT = RULES.length;
