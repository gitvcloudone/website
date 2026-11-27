// Built from TypeScript by studio/build.mjs. Edit the .ts source, then run npm run build.
// Easy button: from the workload, three complete designs to choose from (fewest hosts, lowest licensing, and
// the sweet spot between the two), each sized by the same engine. Host types are generated from the hardware
// catalogue (generic) or taken from the design (custom); topology is standard (management + one workload
// domain) or consolidated. Picking one fills steps 4-12 with recommended values and records every automatic
// choice with its reason. Customer facts (DNS, NTP, identity provider, roles, break-glass, ASNs, IP plan) are
// never filled. No DOM; tested.
import { VENDORS, CLUSTER_DEFAULTS, NVME_TB, HOST_LCPU_MAX, ramOptions, fixHw, hwText, clusterReason } from "../../engine/src/index.js";
                                                                                                               
import { sizeDesign, propose } from "./store.js";
                                     
import { newDomain } from "./edit.js";
import { recommendOps } from "./steps.js";
import { STEPS } from "./flow.js";
import { snapOf } from "./snap.js";
export { snapOf };

                                                                                                                        
                                                                                                                                              
                                                                                                                       

/** Steps the easy button sets to their recommended values. */
export const AUTO_STEPS = ["policy", "fleet", "identity", "storage", "hostnet", "nsx", "addons"]         ;
const DRIVES = [2, 4, 6, 8, 10, 12, 16, 20, 24];
const DRIVE_TB = 7.68;
const apply = (d        , ops      )         => {   // a plain copy with set ops applied (the base is already a valid design)
  const x = structuredClone(d);
  for (const o of ops) { if (o.op !== "set") continue; let t                                   = x         ; for (const k of o.path.slice(0, -1)) t = t[k]         ; t[o.path[o.path.length - 1]] = structuredClone(o.value); }
  return x;
};

/** The design with every auto step at its recommendation, before host types and topology are chosen. */
export function baseDesign(d        )         {
  let x = d;
  for (const s of AUTO_STEPS) if (s !== "storage" && s !== "hostnet" && s !== "nsx") x = apply(x, recommendOps(x, s));
  x = apply(x, [{ op: "set", path: ["network", "clusters"], value: {} }]);
  // placement follows the new topology: every group placed automatically, no DR target
  x.workload.groups = x.workload.groups.map(g => ({ ...g, opts: { ...g.opts, place: "auto", drTo: "" } }));
  return x;
}

/** One instance: a management domain and, for the standard layout, one workload domain; a 2-node large edge cluster where workloads run. */
export function topologyFor(layout                      , htId        , tier         )                     {
  const clu = (id        , name        , mgmt         , takes         )          =>
    ({ ...CLUSTER_DEFAULTS, id, name, hostType: htId, auto: takes, vdefend: !mgmt || takes, maxHosts: mgmt && !takes ? 16 : CLUSTER_DEFAULTS.maxHosts, tierOn: tier && takes })           ;
  const mgmt = newDomain("d1", "Management", "mgmt", { clusters: [clu("c1", "mgmt-cl01", true, layout === "consolidated")] });
  const wlds = layout === "standard" ? [newDomain("w1", "WLD-01", "wld", { clusters: [clu("c2", "wld01-cl01", false, true)] })] : [];
  const where = (layout === "standard" ? wlds[0] : mgmt);
  where.edges = [{ id: "e1", name: "edge-01", nodes: 2, size: "large", on: where.clusters[0].id, bmCores: 32 }];
  return { instances: [{ id: "i1", name: "Instance 1", profile: "", mgmt, wlds }                       ] };
}

const designWith = (base        , hw          , layout                      , tier         )         =>
  ({ ...base, hostTypes: [{ ...hw, id: "h1" }], topology: topologyFor(layout, "h1", tier) });
const measure = (design        , hw          , tier         )            => {
  const r = sizeDesign(design);
  return { hw, tier, design, r, hosts: r.hosts, licCores: r.licCores, addOnTiB: r.lic.addOnTiB };
};

/** Host types to try: every catalogue CPU and balanced memory configuration (2 sockets), or the design's own. */
export function hostCandidates(d        , inp            )             {
  if (inp.source === "custom") return d.hostTypes.map(h => ({ ...h }));
  const out             = [];
  for (const v of inp.vendor === "either" ? Object.keys(VENDORS) : [inp.vendor]) for (const cores of VENDORS[v].cores) {
    if (2 * cores * 2 > HOST_LCPU_MAX) continue;
    for (const ro of ramOptions(v, 2)) out.push(fixHw({ id: "h1", name: "", vendor: v, sockets: 2, cores, ramGB: ro.gb, ht: true, nvme: 24, nvmeTB: NVME_TB.includes(DRIVE_TB) ? DRIVE_TB : NVME_TB[0] }));
  }
  return out;
}

/** Every candidate sized. Generic host types get the fewest drives that keep their lowest host count. */
export function candidates(d        , inp            , withTier = false)              {
  // (a tiered candidate is kept only when tiering lowers the host count; otherwise it's the same design with an extra drive)
  const base = baseDesign(d), out              = [];
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
  const key = (c           ) => JSON.stringify([c.hw.vendor, c.hw.cores, c.hw.ramGB]);
  const plainHosts = new Map(out.filter(c => !c.tier).map(c => [key(c), c.hosts]));
  return out.filter(c => c.hosts > 0 && (!c.tier || c.hosts < (plainHosts.get(key(c)) ?? Infinity)));
}

const by = (...ks                              ) => (a           , b           ) => { for (const k of ks) { const x = k(a) - k(b); if (x) return x; } return 0; };
const phys = (c           ) => c.hw.sockets * c.hw.cores;

/** The three options from one pool (memory tiering allowed, kept only where it lowers the count): fewest hosts, lowest licensing,
 *  and the sweet spot: on the trade-off curve (no other candidate has both fewer hosts and fewer licensed cores), the point
 *  nearest the ideal of both, each scaled over the curve. Ties go to the smaller hardware (less RAM, fewer drives, no tiering). */
export function easyOptions(d        , inp            )               {
  const pool = candidates(d, inp, true);
  if (!pool.length) return [];
  const small = [c => c.addOnTiB, (c           ) => (c.tier ? 1 : 0), (c           ) => c.hw.ramGB, (c           ) => c.hw.nvme, phys]                                ;
  const fewest = [...pool].sort(by(c => c.hosts, c => c.licCores, ...small))[0];
  const lic = [...pool].sort(by(c => c.licCores, c => c.hosts, ...small))[0];
  const front = pool.filter(c => !pool.some(o => o.hosts <= c.hosts && o.licCores <= c.licCores && (o.hosts < c.hosts || o.licCores < c.licCores)));
  const span = (f                          ) => { const v = front.map(f), lo = Math.min(...v), hi = Math.max(...v); return (c           ) => (hi > lo ? (f(c) - lo) / (hi - lo) : 0); };
  const nh = span(c => c.hosts), nl = span(c => c.licCores);
  const bal = [...front].sort(by(c => Math.hypot(nh(c), nl(c)), c => c.hosts, c => c.licCores, ...small))[0];
  const opts               = [
    { ...fewest, key: "fewest", label: "Fewest hosts", why: "The fewest hosts of every configuration tried", same: [] },
    { ...lic, key: "licensing", label: "Lowest licensing", why: "The fewest licensed VCF cores of every configuration tried", same: [] },
    { ...bal, key: "balanced", label: "Balanced", why: "The sweet spot: closest to both the fewest hosts and the fewest licensed cores", same: [] },
  ];
  const sig = (o            ) => JSON.stringify([o.hw.vendor, o.hw.cores, o.hw.ramGB, o.hw.nvme, o.tier]);
  for (const o of opts) o.same = opts.filter(p => p !== o && sig(p) === sig(o)).map(p => p.label);
  return opts;
}


/** The changes that apply an option: recommended values on the auto steps, its host type and topology, and the record of why. */
export function applyOptionOps(d        , inp            , o            )       {
  const hw = { ...o.hw, id: "h1", name: inp.source === "custom" ? o.hw.name : `${o.hw.sockets} × ${o.hw.cores}-core ${VENDORS[o.hw.vendor].label}, ${o.hw.ramGB.toLocaleString("en-US")} GB` };
  const x = o.design, topo = topologyFor(inp.layout, "h1", o.tier);
  const decided = clusterReason(o.r.clusters[o.r.clusters.length - 1]);
  const title = (id        ) => STEPS.find(s => s.id === id)?.title || id;
  const reasons                         = {
    hosts: `${o.label}: ${hwText(hw)}. ${o.why}; ${o.hosts} hosts, ${o.licCores.toLocaleString("en-US")} licensed cores.`,
    topology: inp.layout === "standard"
      ? `Management domain for the VCF management components, one workload domain for the workloads, and a 2-node large edge cluster there. Last cluster: ${decided}.`
      : `Consolidated: workloads run in the management domain's cluster, with a 2-node large edge cluster. ${decided}.`,
  };
  for (const s of AUTO_STEPS) reasons[s] = `${title(s)}: recommended values, set by the easy button.`;
  const steps = { ...d.decisions.steps }; for (const s of AUTO_STEPS) steps[s] = "recommended";
  const ops       = [
    { op: "set", path: ["policy"], value: x.policy }, { op: "set", path: ["fleet"], value: x.fleet }, { op: "set", path: ["addons"], value: x.addons },
    { op: "set", path: ["identity"], value: x.identity }, { op: "set", path: ["network", "clusters"], value: {} }, { op: "set", path: ["network", "domains"], value: Object.fromEntries(Object.entries(x.network.domains).filter(([, v]) => v.localAsn || v.peerAsn).map(([k, v]) => [k, { ...(v.localAsn ? { localAsn: v.localAsn } : {}), ...(v.peerAsn ? { peerAsn: v.peerAsn } : {}) }])) },
    { op: "set", path: ["workload", "groups"], value: x.workload.groups },
    { op: "set", path: ["hostTypes"], value: [hw] }, { op: "set", path: ["topology"], value: topo },
    { op: "set", path: ["decisions", "steps"], value: steps },
  ];
  // fingerprints of the sections as the design will hold them (after the loader has normalised them)
  const n = propose(d, { source: "easy-button", ops }); if (!n.ok) throw new Error(n.error);
  const auto             = { option: o.key, ...inp, reasons, snap: { hostTypes: snapOf(n.design.hostTypes), topology: snapOf(n.design.topology) } };
  return [...ops, { op: "set", path: ["decisions", "auto"], value: auto }];
}

