// Easy button: from the workload, three complete designs to choose from (fewest hosts, lowest licensing, and
// the sweet spot between the two), each sized by the same engine. Host types are generated from the hardware
// catalogue (generic) or taken from the design (custom); topology is standard (management + one workload
// domain) or consolidated. Picking one fills steps 4-12 with recommended values and records every automatic
// choice with its reason. Customer facts (DNS, NTP, identity provider, roles, break-glass, ASNs, IP plan) are
// never filled. No DOM; tested.
import { VENDORS, CLUSTER_DEFAULTS, NVME_TB, HOST_LCPU_MAX, ramOptions, fixHw, hwText, clusterReason, isVsan } from "../../engine/src/index.ts";
import type { Design, HostType, Cluster, Instance, SizingResult, AutoChoice } from "../../engine/src/index.ts";
import { sizeDesign, propose } from "./store.ts";
import type { Op } from "./store.ts";
import { newDomain } from "./edit.ts";
import { recommendOps } from "./steps.ts";
import { STEPS } from "./flow.ts";
import { snapOf } from "./snap.ts";
import { designIssues } from "./rules.ts";
import type { DesignIssue } from "./rules.ts";
export { snapOf };

/** The easy button's floor for a vSAN cluster that isn't stretched: four hosts (RC-VSAN-4), and one more than its
 *  storage policy needs, so a host can be in maintenance or failed while vSAN rebuilds to full protection. */
export const VSAN_MIN_HOSTS = 4;

export interface EasyInputs { source: AutoChoice["source"]; vendor: AutoChoice["vendor"]; layout: AutoChoice["layout"] }
/** raised: clusters set above their sized count so the design meets the vSAN rules (why, for the record).
 *  issues: what's still below best practice in the design itself (customer details left out); filled for the pool, not every trial. */
export interface Candidate { hw: HostType; tier: boolean; design: Design; r: SizingResult; hosts: number; licCores: number; addOnTiB: number; raised: string[]; issues: DesignIssue[] }
export interface EasyOption extends Candidate { key: AutoChoice["option"]; label: string; why: string; same: string[] }

/** Steps the easy button sets to their recommended values. */
export const AUTO_STEPS = ["policy", "fleet", "identity", "storage", "hostnet", "nsx", "addons"] as const;
const DRIVES = [2, 4, 6, 8, 10, 12, 16, 20, 24];
const DRIVE_TB = 7.68;
const apply = (d: Design, ops: Op[]): Design => {   // a plain copy with set ops applied (the base is already a valid design)
  const x = structuredClone(d);
  for (const o of ops) { if (o.op !== "set") continue; let t: Record<string | number, unknown> = x as never; for (const k of o.path.slice(0, -1)) t = t[k] as never; t[o.path[o.path.length - 1]] = structuredClone(o.value); }
  return x;
};

/** The design with every auto step at its recommendation, before host types and topology are chosen. */
export function baseDesign(d: Design): Design {
  let x = d;
  for (const s of AUTO_STEPS) if (s !== "storage" && s !== "hostnet" && s !== "nsx") x = apply(x, recommendOps(x, s));
  x = apply(x, [{ op: "set", path: ["network", "clusters"], value: {} }]);
  // placement follows the new topology: every group placed automatically, no DR target
  x.workload.groups = x.workload.groups.map(g => ({ ...g, opts: { ...g.opts, place: "auto", drTo: "" } }));
  return x;
}

/** One instance: a management domain and, for the standard layout, one workload domain; a 2-node large edge cluster where workloads run. */
export function topologyFor(layout: EasyInputs["layout"], htId: string, tier: boolean): Design["topology"] {
  const clu = (id: string, name: string, mgmt: boolean, takes: boolean): Cluster =>
    ({ ...CLUSTER_DEFAULTS, id, name, hostType: htId, auto: takes, vdefend: !mgmt || takes, maxHosts: mgmt && !takes ? 16 : CLUSTER_DEFAULTS.maxHosts, tierOn: tier && takes }) as Cluster;
  const mgmt = newDomain("d1", "Management", "mgmt", { clusters: [clu("c1", "mgmt-cl01", true, layout === "consolidated")] });
  const wlds = layout === "standard" ? [newDomain("w1", "WLD-01", "wld", { clusters: [clu("c2", "wld01-cl01", false, true)] })] : [];
  const where = (layout === "standard" ? wlds[0] : mgmt);
  where.edges = [{ id: "e1", name: "edge-01", nodes: 2, size: "large", on: where.clusters[0].id, bmCores: 32 }];
  return { instances: [{ id: "i1", name: "Instance 1", profile: "", mgmt, wlds } as unknown as Instance] };
}

const designWith = (base: Design, hw: HostType, layout: EasyInputs["layout"], tier: boolean): Design =>
  ({ ...base, hostTypes: [{ ...hw, id: "h1" }], topology: topologyFor(layout, "h1", tier) });
/** Size a design; any vSAN cluster below the floor is set to it (fixed hosts) and the design sized again. */
const measure = (design0: Design, hw: HostType, tier: boolean): Candidate => {
  let design = design0, r = sizeDesign(design);
  const raise = new Map<string, { n: number; why: string }>();
  for (const x of r.clusters) {
    if (x.c.clone || !isVsan(x.c) || x.c.topo === "stretched" || !x.pol) continue;
    const n = Math.max(VSAN_MIN_HOSTS, x.pol.min + 1);
    if (x.total < n) raise.set(x.c.id, { n, why: `${x.c.name} set to ${n} hosts (sized at ${x.total}): vSAN clusters start at ${VSAN_MIN_HOSTS} hosts, so one can be in maintenance or fail while vSAN rebuilds to full protection` });
  }
  if (raise.size) {
    design = structuredClone(design);
    for (const i of design.topology.instances) for (const dm of [i.mgmt, ...i.wlds]) for (const c of dm.clusters) { const x = raise.get(c.id); if (x) c.fixedHosts = x.n; }
    r = sizeDesign(design);
  }
  return { hw, tier, design, r, hosts: r.hosts, licCores: r.licCores, addOnTiB: r.lic.addOnTiB, raised: [...raise.values()].map(x => x.why), issues: [] };
};

/** Host types to try: every catalogue CPU and balanced memory configuration (2 sockets), or the design's own. */
export function hostCandidates(d: Design, inp: EasyInputs): HostType[] {
  if (inp.source === "custom") return d.hostTypes.map(h => ({ ...h }));
  const out: HostType[] = [];
  for (const v of inp.vendor === "either" ? Object.keys(VENDORS) : [inp.vendor]) for (const cores of VENDORS[v].cores) {
    if (2 * cores * 2 > HOST_LCPU_MAX) continue;
    for (const ro of ramOptions(v, 2)) out.push(fixHw({ id: "h1", name: "", vendor: v, sockets: 2, cores, ramGB: ro.gb, ht: true, nvme: 24, nvmeTB: NVME_TB.includes(DRIVE_TB) ? DRIVE_TB : NVME_TB[0] }));
  }
  return out;
}

/** Every candidate sized. Generic host types get the fewest drives that keep their lowest host count. */
export function candidates(d: Design, inp: EasyInputs, withTier = false): Candidate[] {
  // (a tiered candidate is kept only when tiering lowers the host count; otherwise it's the same design with an extra drive)
  const base = baseDesign(d), out: Candidate[] = [];
  for (const h0 of hostCandidates(d, inp)) for (const tier of withTier ? [false, true] : [false]) {
    if (inp.source === "custom") { out.push(measure(designWith(base, h0, inp.layout, tier), h0, tier)); continue; }
    const full = measure(designWith(base, h0, inp.layout, tier), h0, tier);
    let best = full;
    for (const n of DRIVES) {
      if (n >= h0.nvme) break;
      const hw = { ...h0, nvme: n }, c = measure(designWith(base, hw, inp.layout, tier), hw, tier);
      if (c.hosts === full.hosts) { best = c; break; }
    }
    out.push(best);
  }
  const key = (c: Candidate) => JSON.stringify([c.hw.vendor, c.hw.cores, c.hw.ramGB]);
  const plainHosts = new Map(out.filter(c => !c.tier).map(c => [key(c), c.hosts]));
  const pool = out.filter(c => c.hosts > 0 && (!c.tier || c.hosts < (plainHosts.get(key(c)) ?? Infinity)));
  // Required rules are a floor: a candidate that breaks one is never offered. Recommended ones are kept and listed.
  for (const c of pool) c.issues = designIssues(c.design, c.r);
  return pool.filter(c => !c.issues.some(i => i.level === "required"));
}

const by = (...ks: ((c: Candidate) => number)[]) => (a: Candidate, b: Candidate) => { for (const k of ks) { const x = k(a) - k(b); if (x) return x; } return 0; };
const phys = (c: Candidate) => c.hw.sockets * c.hw.cores;

/** The three options from one pool (memory tiering allowed, kept only where it lowers the count): fewest hosts, lowest licensing,
 *  and the sweet spot: on the trade-off curve (no other candidate has both fewer hosts and fewer licensed cores), the point
 *  nearest the ideal of both, each scaled over the curve. Ties go to the smaller hardware (less RAM, fewer drives, no tiering). */
export function easyOptions(d: Design, inp: EasyInputs): EasyOption[] {
  const all = candidates(d, inp, true);
  if (!all.length) return [];
  // Options come from the candidates that meet every best practice; only when none does are the others used, each with its exceptions listed.
  const clean = all.filter(c => !c.issues.length), pool = clean.length ? clean : all;
  const small = [c => c.addOnTiB, (c: Candidate) => (c.tier ? 1 : 0), (c: Candidate) => c.hw.ramGB, (c: Candidate) => c.hw.nvme, phys] as ((c: Candidate) => number)[];
  const fewest = [...pool].sort(by(c => c.hosts, c => c.licCores, ...small))[0];
  const lic = [...pool].sort(by(c => c.licCores, c => c.hosts, ...small))[0];
  const front = pool.filter(c => !pool.some(o => o.hosts <= c.hosts && o.licCores <= c.licCores && (o.hosts < c.hosts || o.licCores < c.licCores)));
  const span = (f: (c: Candidate) => number) => { const v = front.map(f), lo = Math.min(...v), hi = Math.max(...v); return (c: Candidate) => (hi > lo ? (f(c) - lo) / (hi - lo) : 0); };
  const nh = span(c => c.hosts), nl = span(c => c.licCores);
  const bal = [...front].sort(by(c => Math.hypot(nh(c), nl(c)), c => c.hosts, c => c.licCores, ...small))[0];
  const opts: EasyOption[] = [
    { ...fewest, key: "fewest", label: "Fewest hosts", why: "The fewest hosts of every configuration tried", same: [] },
    { ...lic, key: "licensing", label: "Lowest licensing", why: "The fewest licensed VCF cores of every configuration tried", same: [] },
    { ...bal, key: "balanced", label: "Balanced", why: "The sweet spot: closest to both the fewest hosts and the fewest licensed cores", same: [] },
  ];
  const sig = (o: EasyOption) => JSON.stringify([o.hw.vendor, o.hw.cores, o.hw.ramGB, o.hw.nvme, o.tier]);
  for (const o of opts) o.same = opts.filter(p => p !== o && sig(p) === sig(o)).map(p => p.label);
  return opts;
}


/** The changes that apply an option: recommended values on the auto steps, its host type and topology, and the record of why. */
export function applyOptionOps(d: Design, inp: EasyInputs, o: EasyOption): Op[] {
  const hw = { ...o.hw, id: "h1", name: inp.source === "custom" ? o.hw.name : `${o.hw.sockets} × ${o.hw.cores}-core ${VENDORS[o.hw.vendor].label}, ${o.hw.ramGB.toLocaleString("en-US")} GB` };
  const x = o.design, topo = structuredClone(o.design.topology);   // as sized, with any cluster raised to the vSAN floor
  const decided = clusterReason(o.r.clusters[o.r.clusters.length - 1]);
  const title = (id: string) => STEPS.find(s => s.id === id)?.title || id;
  const reasons: Record<string, string> = {
    hosts: `${o.label}: ${hwText(hw)}. ${o.why}; ${o.hosts} hosts, ${o.licCores.toLocaleString("en-US")} licensed cores.`,
    topology: inp.layout === "standard"
      ? `Management domain for the VCF management components, one workload domain for the workloads, and a 2-node large edge cluster there. Last cluster: ${decided}.`
      : `Consolidated: workloads run in the management domain's cluster, with a 2-node large edge cluster. ${decided}.`,
  };
  if (o.raised.length) reasons.topology += ` ${o.raised.join(". ")}.`;
  if (o.issues.length) reasons.topology += ` Below best practice, accepted with this option: ${o.issues.map(i => i.text).join("; ")}.`;
  for (const s of AUTO_STEPS) reasons[s] = `${title(s)}: recommended values, set by the easy button.`;
  const steps = { ...d.decisions.steps }; for (const s of AUTO_STEPS) steps[s] = "recommended";
  const ops: Op[] = [
    { op: "set", path: ["policy"], value: x.policy }, { op: "set", path: ["fleet"], value: x.fleet }, { op: "set", path: ["addons"], value: x.addons },
    { op: "set", path: ["identity"], value: x.identity }, { op: "set", path: ["network", "clusters"], value: {} }, { op: "set", path: ["network", "domains"], value: Object.fromEntries(Object.entries(x.network.domains).filter(([, v]) => v.localAsn || v.peerAsn).map(([k, v]) => [k, { ...(v.localAsn ? { localAsn: v.localAsn } : {}), ...(v.peerAsn ? { peerAsn: v.peerAsn } : {}) }])) },
    { op: "set", path: ["workload", "groups"], value: x.workload.groups },
    { op: "set", path: ["hostTypes"], value: [hw] }, { op: "set", path: ["topology"], value: topo },
    { op: "set", path: ["decisions", "steps"], value: steps },
  ];
  // fingerprints of the sections as the design will hold them (after the loader has normalised them)
  const n = propose(d, { source: "easy-button", ops }); if (!n.ok) throw new Error(n.error);
  const auto: AutoChoice = { option: o.key, ...inp, reasons, snap: { hostTypes: snapOf(n.design.hostTypes), topology: snapOf(n.design.topology) } };
  return [...ops, { op: "set", path: ["decisions", "auto"], value: auto }];
}

