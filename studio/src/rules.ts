// Best-practice rules: the checks behind engine/knowledge/rules.json (one function per rule id), the
// scorecard per pillar, accepted deviations (a reason each; never required to fix), and the decision and
// risk registers that Review shows and the HLD will use. Reads the design and sizing only. No DOM; tested.
import { RULES, PILLARS, isVsan } from "../../engine/src/index.ts";
import type { Design, SizingResult, Rule, Pillar } from "../../engine/src/index.ts";
import { allClusters, effective } from "./hostnet.ts";
import { allDomains, effectiveNsx, asns, isPrivateAsn, tgwNeedsStandby } from "./nsx.ts";
import { planIssues } from "./ip.ts";
import { STEPS } from "./flow.ts";
import { changes } from "./steps.ts";
import type { Op } from "./store.ts";
import { snapOf } from "./snap.ts";

/** Where a rule isn't met. `target` names the object (with the rule id it keys an accepted deviation). */
export interface Finding { target: string; where: string; reason?: string }
type Check = (d: Design, r: SizingResult) => { applies: boolean; findings: Finding[] };

const domName = (d: Design, inst: { name: string }, dm: { name: string }) => (d.topology.instances.length > 1 ? `${inst.name} / ` : "") + dm.name;
/** Domains whose connectivity is centralized and that have edges (where Tier-0 rules apply). */
const tier0 = (d: Design) => allDomains(d).filter(({ dm }) => effectiveNsx(d, dm).model === "centralized" && dm.edges.length);
/** Sized clusters, without the spill-over copies the engine adds. */
const sized = (r: SizingResult) => r.clusters.filter(x => !x.c.clone);
const cluName = (x: SizingResult["clusters"][number]) => `${x.d.name} / ${x.c.name}`;
const fromPlan = (codes: string[]): Check => (d, r) => {
  const { issues } = planIssues(d, r);
  return { applies: Object.keys(d.plan.rows).length > 0, findings: issues.filter(i => codes.includes(i.code)).map(i => ({ target: `${i.code}:${i.key}`, where: i.t })) };
};

export const CHECKS: Record<string, Check> = {
  "AV-EDGE-NODES": d => { const ds = allDomains(d).filter(x => x.dm.edges.length);
    return { applies: ds.length > 0, findings: ds.flatMap(({ inst, dm }) => dm.edges.filter(e => e.nodes < 2).map(e => ({ target: e.id, where: `${domName(d, inst, dm)} / ${e.name}: ${e.nodes} node` }))) }; },
  "AV-T0-AA": d => { const ds = tier0(d);
    return { applies: ds.length > 0, findings: ds.filter(({ dm }) => effectiveNsx(d, dm).t0Ha === "as").map(({ inst, dm }) => ({ target: dm.id, where: `${domName(d, inst, dm)}: active/standby` })) }; },
  "AV-TGW-AS": d => { const ds = allDomains(d).filter(({ dm }) => effectiveNsx(d, dm).model === "centralized" && tgwNeedsStandby(d, dm));
    return { applies: ds.length > 0, findings: ds.filter(({ dm }) => effectiveNsx(d, dm).tgwHa === "aa").map(({ inst, dm }) => ({ target: dm.id, where: `${domName(d, inst, dm)}: active/active` })) }; },
  "AV-BFD": d => { const ds = tier0(d);
    return { applies: ds.length > 0, findings: ds.filter(({ dm }) => !effectiveNsx(d, dm).bfd).map(({ inst, dm }) => ({ target: dm.id, where: `${domName(d, inst, dm)}: BFD off` })) }; },
  "AV-IDB-INSTANCE": d => ({ applies: !!d.identity.mode, findings: d.identity.mode === "embedded" ? [{ target: "identity", where: "Embedded mode chosen" }] : [] }),
  "AV-HA-N1": (d, r) => ({ applies: sized(r).length > 0, findings: sized(r).filter(x => x.c.nPlus < 1).map(x => ({ target: x.c.id, where: `${cluName(x)}: no host failure capacity` })) }),
  "RC-VSAN-4": (d, r) => { const cs = sized(r).filter(x => isVsan(x.c) && x.c.topo !== "stretched");
    return { applies: cs.length > 0, findings: cs.filter(x => x.total < 4).map(x => ({ target: x.c.id, where: `${cluName(x)}: ${x.total} hosts` })) }; },
  "RC-VSAN-RESERVE": (d, r) => { const cs = sized(r).filter(x => isVsan(x.c) && x.c.topo !== "stretched" && x.total >= 4);
    return { applies: cs.length > 0, findings: cs.filter(x => !x.c.rebuild).map(x => ({ target: x.c.id, where: `${cluName(x)}: host rebuild reserve off` })) }; },
  "RC-BREAKGLASS": d => ({ applies: true, findings: [
    ...(d.identity.breakGlass.holder.trim() ? [] : [{ target: "holder", where: "No holder named" }]),
    ...(d.identity.breakGlass.rotationDays > 0 ? [] : [{ target: "rotation", where: "No password rotation set" }])] }),
  "PF-MTU-9000": d => { const cs = allClusters(d);
    return { applies: cs.length > 0, findings: cs.filter(({ c }) => effective(d, c).mtu < 9000).map(({ dm, c }) => ({ target: c.id, where: `${dm.name} / ${c.name}: MTU ${effective(d, c).mtu}` })) }; },
  "PF-EDGE-SIZE": d => { const es = allDomains(d).flatMap(({ inst, dm }) => dm.edges.filter(e => e.on !== "bm").map(e => ({ inst, dm, e })));
    return { applies: es.length > 0, findings: es.filter(x => !["large", "xlarge"].includes(x.e.size)).map(x => ({ target: x.e.id, where: `${domName(d, x.inst, x.dm)} / ${x.e.name}: ${x.e.size}` })) }; },
  "MG-DNS-NTP": d => ({ applies: true, findings: ([["domain", "DNS domain"], ["dns", "DNS servers"], ["ntp", "NTP servers"]] as const).filter(([k]) => !d.network[k].trim()).map(([k, l]) => ({ target: k, where: `${l} not set` })) }),
  "MG-PLAN-CONSISTENT": fromPlan(["invalid", "hostbits", "gw-missing", "gw-invalid", "gw-outside", "vlan-diff", "block-shared", "too-small", "overlap", "reserved", "vlan-dup"]),
  "MG-SUBNET-GROWTH": fromPlan(["growth", "fixed-small", "block-small"]),
  "MG-EDGE-TEP-VLAN": d => { const ds = allDomains(d).filter(x => x.dm.edges.length);
    return { applies: ds.length > 0, findings: ds.filter(({ dm }) => effectiveNsx(d, dm).edgeTep === "shared").map(({ inst, dm }) => ({ target: dm.id, where: `${domName(d, inst, dm)}: shared with host TEPs` })) }; },
  "MG-MGMT-VLANS": fromPlan(["mgmt-vlan"]),
  "SC-IDENTITY": d => ({ applies: true, findings: [
    ...(d.identity.idp ? [] : [{ target: "idp", where: "No identity provider" }]),
    ...(d.identity.idp && !d.identity.provisioning ? [{ target: "provisioning", where: "No provisioning method" }] : []),
    ...(d.identity.roles.length ? [] : [{ target: "roles", where: "No role matrix" }])] }),
  "SC-ASN": d => { const ds = tier0(d), used = new Map<number, number>();
    for (const { dm } of ds) { const a = asns(d, dm).localAsn; if (a) used.set(a, (used.get(a) || 0) + 1); }
    return { applies: ds.some(({ dm }) => asns(d, dm).localAsn > 0), findings: ds.flatMap(({ inst, dm }) => { const a = asns(d, dm).localAsn;
      return !a ? [] : !isPrivateAsn(a) ? [{ target: dm.id, where: `${domName(d, inst, dm)}: ASN ${a} isn't private` }] : used.get(a)! > 1 ? [{ target: dm.id, where: `${domName(d, inst, dm)}: ASN ${a} is used by another Tier-0` }] : []; }) }; },
  "CO-OVERSIZED": (d, r) => ({ applies: sized(r).length > 0, findings: sized(r).filter(x => x.fixed > 0 && x.total >= x.need + 2 && x.total >= 1.5 * x.need).map(x => ({ target: x.c.id, where: `${cluName(x)}: ${x.total} hosts set, ${x.need} needed` })) }),
  "CO-TIERING": (d, r) => { const cs = sized(r).filter(x => x.limiter === "RAM");
    return { applies: cs.length > 0, findings: cs.filter(x => !x.c.tierOn).map(x => ({ target: x.c.id, where: `${cluName(x)}: memory-bound, tiering off` })) }; },
};

export type RuleStatus = "met" | "accepted" | "open" | "na";
export interface RuleResult { rule: Rule; status: RuleStatus; findings: Finding[] }
export const devKey = (rule: Rule, f: Pick<Finding, "target">) => `${rule.id}@${f.target}`;

/** Every rule against the design: met, not applicable, open, or accepted (every finding has a reason). */
export function evaluate(d: Design, r: SizingResult): RuleResult[] {
  return RULES.map(rule => {
    const c = CHECKS[rule.id]; if (!c) throw new Error(`No check for rule ${rule.id}`);
    const { applies, findings } = c(d, r);
    const fs = findings.map(f => ({ ...f, reason: d.decisions.deviations[devKey(rule, f)]?.reason }));
    return { rule, findings: fs, status: !applies ? "na" : !fs.length ? "met" : fs.every(f => f.reason) ? "accepted" : "open" };
  });
}

/** Scores mean something only once there's a workload and a sized cluster; before that, show none. */
export function scorable(d: Design, r: SizingResult): boolean {
  const work = d.workload.groups.some(g => g.include !== false && ((Number(g.values?.vcpu) || 0) > 0 || (Number(g.values?.vramGiB) || 0) > 0));
  return work && r.clusters.length > 0;
}

export interface DesignIssue { level: "required" | "recommended" | "check"; text: string }
/** What's wrong with the design itself, leaving out what only the customer can supply (rules with input "customer")
 *  and "consider" tips: open required and recommended rules, plus the sizing checks to fix or check. */
export function designIssues(d: Design, r: SizingResult): DesignIssue[] {
  const out: DesignIssue[] = [];
  for (const x of evaluate(d, r)) if (x.status === "open" && !x.rule.input && x.rule.level !== "consider")
    for (const f of x.findings) if (!f.reason) out.push({ level: x.rule.level as DesignIssue["level"], text: `${x.rule.title}: ${f.where}` });
  for (const w of r.warnings) if (w.lvl === "crit") out.push({ level: "required", text: w.t }); else if (w.lvl === "warn") out.push({ level: "check", text: w.t });
  return out;
}

export interface PillarScore { pillar: Pillar; label: string; met: number; accepted: number; open: number; applicable: number; atRisk: boolean; incomplete: string[] }
/** Per pillar: rules met, deviations accepted, open; at risk with an open required rule; incomplete when a step feeding it was skipped. */
export function scorecard(d: Design, res: RuleResult[]): PillarScore[] {
  return (Object.keys(PILLARS) as Pillar[]).map(p => {
    const rs = res.filter(x => x.rule.pillar === p && x.status !== "na");
    const steps = [...new Set(RULES.filter(x => x.pillar === p).map(x => x.step))];
    return { pillar: p, label: PILLARS[p], met: rs.filter(x => x.status === "met").length, accepted: rs.filter(x => x.status === "accepted").length,
      open: rs.filter(x => x.status === "open").length, applicable: rs.length, atRisk: rs.some(x => x.status === "open" && x.rule.level === "required"),
      incomplete: steps.filter(s => d.decisions.steps[s] === "skipped").map(s => STEPS.find(x => x.id === s)?.title || s) };
  });
}

/** Accept a deviation with a reason, or (empty reason) withdraw it. */
export function deviationOps(d: Design, key: string, reason: unknown): Op[] {
  const all = { ...d.decisions.deviations } as Record<string, unknown>, t = String(reason ?? "").trim();
  if (t) all[key] = { reason: t }; else delete all[key];
  return [{ op: "set", path: ["decisions", "deviations"], value: all }];
}

export interface DecisionEntry { step: string; kind: "changed" | "recommended" | "auto" | "deviation"; text: string; reason?: string }
/** The design decisions: values changed from the recommendation, recommendations accepted, deviations accepted with their reasons. */
export function decisionRegister(d: Design, res: RuleResult[]): DecisionEntry[] {
  const out: DecisionEntry[] = [], a = d.decisions.auto;
  if (a) {   // the easy button's host type and topology, until they're changed
    const still = { hostTypes: snapOf(d.hostTypes) === a.snap.hostTypes, topology: snapOf(d.topology) === a.snap.topology };
    for (const [k, step] of [["hostTypes", "Host types"], ["topology", "Topology"]] as const) out.push(still[k]
      ? { step, kind: "auto", text: "Auto-selected by the easy button", reason: a.reasons[k === "hostTypes" ? "hosts" : "topology"] }
      : { step, kind: "changed", text: "Changed after the easy button set it" });
  }
  for (const s of STEPS) {
    for (const c of changes(d, s.id)) out.push({ step: s.title, kind: "changed", text: `${c.where ? c.where + ": " : ""}${c.label}: ${c.value} (recommended ${c.def})` });
    if (d.decisions.steps[s.id] === "recommended") out.push(a && a.reasons[s.id]
      ? { step: s.title, kind: "auto", text: "Recommended values, auto-selected by the easy button" } : { step: s.title, kind: "recommended", text: "Recommended values accepted" });
  }
  for (const x of res) for (const f of x.findings) if (f.reason) out.push({ step: STEPS.find(s => s.id === x.rule.step)?.title || "IP / VLAN / DNS plan", kind: "deviation", text: `${x.rule.title}: ${f.where}`, reason: f.reason });
  return out;
}

export interface RiskEntry { rule: Rule; where: string; risk: string; reason: string; high: boolean }
/** One risk per accepted deviation; a deviation from a required rule is a high risk. */
export function riskRegister(res: RuleResult[]): RiskEntry[] {
  return res.flatMap(x => x.findings.filter(f => f.reason).map(f => ({ rule: x.rule, where: f.where, risk: x.rule.risk, reason: f.reason!, high: x.rule.level === "required" })));
}
