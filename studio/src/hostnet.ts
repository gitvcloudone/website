// Host networking (VCF 9.1+), design level: each cluster's switch model, NIC speed, MTU and host TEP
// addressing, and the VMkernel networks that follow from them with the addresses each needs.
// Only values that differ from the recommendation are stored (design.network.clusters). No DOM; tested.
import { NETWORK, isVsan } from "../../engine/src/index.ts";
import type { Design, Cluster, ClusterNet, SizingResult } from "../../engine/src/index.ts";

export type NetValues = Required<ClusterNet>;
export const NET_KEYS = ["vds", "nicGbps", "mtu", "tep"] as const;

/** Physical NICs per host for VCF traffic on a host type (2 unless set). */
export const nicsOf = (d: Design, htId: string) => d.network.hostNics[htId] || NETWORK.defaults.nicsPerHost;

/** The recommendation for a cluster: storage separation when its hosts have 4+ NICs and it runs vSAN, otherwise one switch. */
export function recommended(d: Design, c: Cluster): NetValues {
  const vds = isVsan(c) && nicsOf(d, c.hostType) >= NETWORK.vdsModels.storage.nics ? "storage" : "single";
  return { vds, nicGbps: NETWORK.defaults.nicGbps, mtu: NETWORK.mtu.recommended, tep: NETWORK.defaults.tep };
}
export const effective = (d: Design, c: Cluster): NetValues => ({ ...recommended(d, c), ...d.network.clusters[c.id] });

/** Every cluster in the design, with where it sits. */
export function allClusters(d: Design) {
  return d.topology.instances.flatMap(inst => [inst.mgmt, ...inst.wlds].flatMap(dm => dm.clusters.map(c => ({ inst, dm, c }))));
}

/** The VMkernel networks of a cluster, which switch carries each, MTU, addressing and the addresses needed for `hosts` hosts. */
export function networksOf(d: Design, c: Cluster, hosts: number) {
  const v = effective(d, c), m = NETWORK.vdsModels[v.vds], M = NETWORK.methods;
  const rows = [
    { net: "ESX management", vds: 1, mtu: NETWORK.mtu.management, addr: M.static, ips: hosts },
    { net: "vMotion", vds: 1, mtu: v.mtu, addr: M.pool, ips: hosts },
  ];
  if (isVsan(c)) rows.push({ net: "vSAN", vds: m.storageVds, mtu: v.mtu, addr: M.pool, ips: hosts });
  rows.push({ net: "Host TEP (NSX overlay)", vds: 1, mtu: v.mtu, addr: M[v.tep], ips: hosts * NETWORK.tepPerHost });
  return rows;
}

/** Hosts per design cluster from a sizing result, spill-over clusters counted with the cluster they come from. */
export function hostsByCluster(r: SizingResult) {
  const out = new Map<string, number>();
  for (const x of r.clusters) { const id = x.c.id.split("+")[0]; out.set(id, (out.get(id) || 0) + x.total); }
  return out;
}

/** Host networking choices still open, and settings that can't work as set. */
export function hostnetOpen(d: Design): string[] {
  const out: string[] = [], n = d.network;
  if (!n.domain.trim()) out.push("Enter the DNS domain.");
  if (!n.dns.trim()) out.push("Enter the DNS servers.");
  if (!n.ntp.trim()) out.push("Enter the NTP servers.");
  for (const { c } of allClusters(d)) {
    const v = effective(d, c), need = NETWORK.vdsModels[v.vds].nics, have = nicsOf(d, c.hostType);
    if (have < need) out.push(`${c.name}: the ${v.vds === "storage" ? "storage separation" : "switch"} model needs ${need} NICs per host; its host type has ${have}.`);
    if (v.vds === "storage" && !isVsan(c)) out.push(`${c.name}: storage separation puts vSAN on its own switch, but this cluster doesn't run vSAN.`);
  }
  return out;
}

/** Fill in a change to one cluster value: stored only when it differs from the recommendation. */
export function netOps(d: Design, cid: string, key: (typeof NET_KEYS)[number], value: unknown) {
  const c = allClusters(d).find(x => x.c.id === cid)?.c; if (!c) return [];
  if (key === "mtu") value = Math.min(NETWORK.mtu.max, Math.max(NETWORK.mtu.overlayMin, Math.round(Number(value))));
  const rec = recommended(d, c) as unknown as Record<string, unknown>;
  const cur: Record<string, unknown> = { ...d.network.clusters[cid], [key]: value };
  if (cur[key] === rec[key]) delete cur[key];
  const all = { ...d.network.clusters } as Record<string, unknown>;
  if (Object.keys(cur).length) all[cid] = cur; else delete all[cid];
  return [{ op: "set" as const, path: ["network", "clusters"], value: all }];
}
export function nicsOps(d: Design, htId: string, value: number) {
  const all = { ...d.network.hostNics }; if (value === NETWORK.defaults.nicsPerHost) delete all[htId]; else all[htId] = value;
  return [{ op: "set" as const, path: ["network", "hostNics"], value: all }];
}
