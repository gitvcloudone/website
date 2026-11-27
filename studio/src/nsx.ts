// NSX workload connectivity (VCF 9.1+), per domain: centralized (edges + Tier-0) or distributed VLAN,
// gateway HA, BGP peering, edge TEPs and VPC IP blocks. Recommended values are stored only when changed
// (design.network.domains); ASNs are the customer's, stored when entered. No DOM; tested.
import { NSX, NETWORK } from "../../engine/src/index.ts";
import type { Design, Domain, Instance, DomainNsx } from "../../engine/src/index.ts";
import { effective } from "./hostnet.ts";

export const NSX_KEYS = ["model", "t0Ha", "tgwHa", "bfd", "edgeTep", "extPrefix", "privPrefix"] as const;
export type NsxValues = Required<Pick<DomainNsx, (typeof NSX_KEYS)[number]>>;

export const allDomains = (d: Design) => d.topology.instances.flatMap(inst => [inst.mgmt, ...inst.wlds].map(dm => ({ inst, dm })));

/** VCF Automation (All Apps orgs) or a vSphere Supervisor in the domain need an active/standby transit gateway. */
export const tgwNeedsStandby = (d: Design, dm: Domain) => d.fleet.automation || dm.clusters.some(c => c.supOn);

export function recommendedNsx(d: Design, dm: Domain): NsxValues {
  return { model: "centralized", t0Ha: "aa", tgwHa: tgwNeedsStandby(d, dm) ? "as" : "aa", bfd: true, edgeTep: "separate",
    extPrefix: NSX.centralized.externalPrefix, privPrefix: NSX.distributed.privatePrefix };
}
export function effectiveNsx(d: Design, dm: Domain): NsxValues {
  const { localAsn, peerAsn, ...o } = d.network.domains[dm.id] || {};
  return { ...recommendedNsx(d, dm), ...o };
}
export const asns = (d: Design, dm: Domain) => ({ localAsn: d.network.domains[dm.id]?.localAsn || 0, peerAsn: d.network.domains[dm.id]?.peerAsn || 0 });
export const isPrivateAsn = (n: number) => (n >= 64512 && n <= 65534) || (n >= 4200000000 && n <= 4294967294);

/** Does this domain carry workloads, so that its connectivity model needs edges? Workload domains, and a management domain with no workload domains beside it. */
const carriesWorkloads = (inst: Instance, dm: Domain) => dm.kind === "wld" || inst.wlds.length === 0;

/** Connectivity choices still open, and settings that can't work as set. */
export function nsxOpen(d: Design): string[] {
  const out: string[] = [], used = new Map<number, string[]>();
  for (const { inst, dm } of allDomains(d)) {
    const v = effectiveNsx(d, dm), a = asns(d, dm), nm = d.topology.instances.length > 1 ? `${inst.name} / ${dm.name}` : dm.name;
    const nodes = dm.edges.reduce((s, e) => s + (e.nodes || 0), 0);
    if (v.model === "distributed") {
      if (nodes) out.push(`${nm}: distributed connectivity doesn't need its ${nodes} edge nodes unless you need NAT or other stateful north/south services. Remove them in Topology if not.`);
      continue;
    }
    if (!dm.edges.length) { if (carriesWorkloads(inst, dm)) out.push(`${nm}: centralized connectivity needs an NSX Edge cluster. Add one in Topology, or choose distributed connectivity.`); continue; }
    if (!a.localAsn) out.push(`${nm}: enter the Tier-0 BGP ASN.`);
    else { if (!isPrivateAsn(a.localAsn)) out.push(`${nm}: Tier-0 ASN ${a.localAsn} isn't a private ASN (64512-65534 or 4200000000-4294967294).`); used.set(a.localAsn, [...(used.get(a.localAsn) || []), nm]); }
    if (!a.peerAsn) out.push(`${nm}: enter the physical network's BGP ASN.`);
    for (const e of dm.edges) {
      if (e.nodes < NSX.edge.minNodes) out.push(`${nm} / ${e.name}: an edge cluster needs ${NSX.edge.minNodes} or more nodes.`);
      if (v.t0Ha === "as" && e.nodes > NSX.centralized.asMaxNodes) out.push(`${nm} / ${e.name}: an active/standby Tier-0 runs on ${NSX.centralized.asMaxNodes} edge nodes; this edge cluster has ${e.nodes}.`);
      if (v.t0Ha === "aa" && e.nodes > NSX.centralized.aaMaxNodes) out.push(`${nm} / ${e.name}: an active/active Tier-0 scales to ${NSX.centralized.aaMaxNodes} edge nodes; this edge cluster has ${e.nodes}.`);
    }
    if (v.tgwHa === "aa" && tgwNeedsStandby(d, dm)) out.push(`${nm}: the transit gateway must be active/standby for VCF Automation All Apps orgs and vSphere Supervisor.`);
  }
  for (const [asn, where] of used) if (where.length > 1) out.push(`Tier-0 ASN ${asn} is used by ${where.join(", ")}: each Tier-0 needs its own ASN.`);
  return out;
}

/** The connectivity networks and IP blocks a domain needs (design level; VLAN IDs and subnets come with the IP plan). */
export function nsxNetworks(d: Design, dm: Domain) {
  const v = effectiveNsx(d, dm), nodes = dm.edges.reduce((s, e) => s + (e.nodes || 0), 0), rows: { net: string; size: string; ips: string }[] = [];
  if (v.model === "centralized" || nodes) {
    const cl = dm.clusters.find(c => dm.edges.some(e => e.on === c.id)) || dm.clusters[0];
    const mtu = cl ? effective(d, cl).mtu : NETWORK.mtu.recommended;
    if (nodes) rows.push({ net: `Edge TEP (${v.edgeTep === "separate" ? "own VLAN" : "shared with host TEPs"}), MTU ${mtu}`, size: "IP pool", ips: String(nodes * NSX.edge.tepPerNode) });
  }
  if (v.model === "centralized" && nodes) for (const side of ["A", "B"]) rows.push({ net: `Tier-0 peering VLAN ${side}`, size: `/${NSX.centralized.peeringPrefix} or larger`, ips: "" });
  rows.push({ net: v.model === "centralized" ? "VPC external IP block (enterprise routable)" : "VPC external IP block (from the external VLAN CIDR)", size: `/${v.extPrefix}`, ips: "" });
  if (v.model === "distributed") rows.push({ net: "Private transit gateway IP block (not routed)", size: `/${v.privPrefix}`, ips: "" });
  return rows;
}

/** A change to one domain value: recommended values aren't stored; ASNs are parsed and checked. */
export function nsxOps(d: Design, did: string, key: (typeof NSX_KEYS)[number] | "localAsn" | "peerAsn", value: unknown) {
  const at = allDomains(d).find(x => x.dm.id === did); if (!at) return [];
  const cur: Record<string, unknown> = { ...d.network.domains[did] };
  if (key === "localAsn" || key === "peerAsn") {
    const t = String(value ?? "").trim(), n = t === "" ? 0 : Number(t);
    if (!Number.isInteger(n) || n < 0 || n > 4294967295) throw new Error("A BGP ASN is a whole number from 1 to 4294967295.");
    if (n) cur[key] = n; else delete cur[key];
  } else {
    cur[key] = value;
    if ((recommendedNsx(d, at.dm) as Record<string, unknown>)[key] === value) delete cur[key];
  }
  const all = { ...d.network.domains } as Record<string, unknown>;
  if (Object.keys(cur).length) all[did] = cur; else delete all[did];
  return [{ op: "set" as const, path: ["network", "domains"], value: all }];
}
