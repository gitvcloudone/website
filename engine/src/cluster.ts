// One cluster: usable capacity per host, vSAN policy, minimum hosts, and the host count for a load.
import { TIB, GIB, TB, TIER_MAX_GIB, PROFILES, POL, ADDON } from "./knowledge.ts";
import type { Cluster, SizedCluster, HostType, Settings, ClusterLoad, Instance, MgmtDefault } from "./types.ts";

export const isVsan = (c: Pick<Cluster, "storage">) => c.storage === "esa";
/** vSAN cluster 64 hosts; vSphere cluster 96 hosts */
export const maxFor = (c: Pick<Cluster, "storage">) => isVsan(c) ? 64 : 96;

/** Memory-tier drives a cluster can take from its host type: ESA keeps at least one NVMe drive in vSAN; up to 2 (mirrored) */
export function tierMax(c: Pick<Cluster, "storage">, hw: Pick<HostType, "nvme">) { return Math.max(0, Math.min(2, c.storage === "esa" ? hw.nvme - 1 : hw.nvme)); }

export function hostCfg(c: SizedCluster, s: Settings) {
  const hw = c.hw;
  const cores = hw.sockets * hw.cores, threads = hw.ht ? cores * 2 : cores;
  const vs = isVsan(c);
  const tMax = tierMax(c, hw), tDrives = c.tierOn ? Math.min(Math.max(1, c.tierDrives || 1), tMax) : 0;
  const tiering = tDrives > 0 && c.tierPct > 0;
  const vsanNvme = c.storage === "esa" ? hw.nvme - tDrives : 0;
  const rawTiB = vs ? vsanNvme * hw.nvmeTB * TB / TIB : 0;
  const devGiB = tiering ? hw.nvmeTB * TB / GIB : 0;    // two drives are mirrored: capacity of one
  const wantGiB = tiering ? hw.ramGB * c.tierPct / 100 : 0;
  const tierGiB = tiering ? Math.min(wantGiB, devGiB, TIER_MAX_GIB) : 0;
  const sec = s.vdefend !== "off" && c.vdefend;
  const svm = sec && s.vdefend === "atp" && s.mps;
  const ramDeduct = (sec && s.vdefend === "atp" && s.ids ? ADDON.idsRamGiB : 0) + (svm ? ADDON.mpsSvm[1] : 0) + (vs ? s.vsanMem : 0);
  const coreDeduct = svm ? ADDON.mpsSvm[0] / s.mgmtRatio : 0;
  const effCores = cores * (1 + s.uplift / 100) - coreDeduct;
  const ramUsable = (Math.max(0, hw.ramGB - ramDeduct) * (1 - s.memReserve / 100) + tierGiB) * (s.memFill / 100);
  return { cores, threads, sockets: hw.sockets, coresPerSocket: hw.cores, dram: hw.ramGB, rawTiB, vsanNvme, tiering, tierDrives: tDrives, tierMax: tMax, tierGiB, wantGiB,
    tierShort: tiering && tierGiB < wantGiB - 0.5, effCores, ramUsable, ramRatio: tiering ? 1 : Math.max(1, s.ramRatio), licCores: hw.sockets * Math.max(16, hw.cores),
    svmStorTiB: svm ? ADDON.mpsSvm[2] * 1e9 / TIB : 0, ht: hw.ht };
}
export type HostCfg = ReturnType<typeof hostCfg>;

export interface Policy { f: number; label: string; min: number; key?: string }

/** Local vSAN protection for n hosts (per site when stretched). */
export function localPol(arch: string, mode: string, n: number): Policy {
  if (mode === "none") return { f: 1, label: "no local protection", min: 1 };
  let k = mode;
  if (mode === "auto") k = n >= 6 ? "r6" : n >= 3 ? "r5" : "none";
  if (k === "none") return { f: 1, label: "no local protection", min: 1 };
  const p = POL[arch][k]; let f = p[0], label = p[1];
  if (arch === "esa" && k === "r5" && n >= 6) { f = 1.25; label = "RAID-5 4+1 (FTT=1)"; }
  return { f, label, min: p[2], key: k };
}
/** vSAN storage policy for n hosts (stretched: n is the total, n/2 per site): capacity factor, label, minimum hosts. */
export function policy(c: Cluster, n: number): Policy {
  const arch = c.storage;
  if (c.topo === "stretched") {
    const m = Math.floor(n / 2), lp = localPol(arch, c.local, m);
    return { f: 2 * lp.f, label: `Site mirroring + ${lp.label}`, min: 2 * Math.max(3, lp.min) };
  }
  const lp = localPol(arch, c.policy === "auto" ? "auto" : c.policy, n);
  return { f: lp.f, label: lp.label + (c.policy === "auto" ? " (auto)" : ""), min: Math.max(3, lp.min) };
}
/** Host minimum the chosen policy needs (Auto adapts, so it needs only the vSAN minimum). */
export function policyMin(c: Cluster): number {
  if (!isVsan(c)) return 0;
  if (c.topo === "stretched") return c.local === "auto" || c.local === "none" ? 6 : 2 * Math.max(3, POL[c.storage][c.local][2]);
  return c.policy === "auto" ? 3 : POL[c.storage][c.policy][2];
}
export function dedupeAllowed(c: Cluster, s: Pick<Settings, "version">, n: number) { return s.version === "9.1" && c.storage === "esa" && c.topo !== "stretched" && n >= 3 && n <= 64; }

/** Deployment model of an instance: the first instance uses the fleet model; others can set their own. */
export function profName(s: Settings, inst: Pick<Instance, "profile">, ii: number): string {
  return ii === 0 || !inst.profile || !PROFILES[inst.profile] ? (PROFILES[s.profile] ? s.profile : "HA Medium") : inst.profile;
}

/** Minimum hosts for a cluster: storage type, topology, management default cluster, chosen policy. */
export function clusterFloor(c: Cluster, s: Settings, isMgmtDefault: MgmtDefault): number {
  const st = c.topo === "stretched", ha = (isMgmtDefault && typeof isMgmtDefault === "object" && isMgmtDefault.ha !== undefined) ? isMgmtDefault.ha : PROFILES[s.profile].ha;
  let f = isVsan(c) ? (st ? 6 : 3) : 2;
  if (isMgmtDefault) f = Math.max(f, ha ? (st ? 8 : 4) : (isVsan(c) ? (st ? 6 : 3) : (st ? 4 : 2)));
  return Math.max(f, policyMin(c));
}

export type Limiter = "Minimum" | "Storage" | "CPU" | "RAM";

/** Size one cluster for a load. wvcpu is counted at the CPU ratio, wram at the RAM ratio; coresFixed and ramFixed as given; stor in TiB. */
export function sizeCluster(c: SizedCluster, L: ClusterLoad, s: Settings, isMgmtDefault: MgmtDefault) {
  const h = hostCfg(c, s), st = c.topo === "stretched", vs = isVsan(c);
  const cores = L.wvcpu / s.cpuRatio + L.coresFixed;
  const ram = L.wram / h.ramRatio + L.ramFixed;
  const cpuH = h.effCores > 0 ? cores / h.effCores : Infinity, ramH = h.ramUsable > 0 ? ram / h.ramUsable : Infinity;
  const base = Math.max(0, Math.ceil(Math.max(cpuH, ramH) - 1e-9));
  const floor = clusterFloor(c, s, isMgmtDefault);
  // compute hosts incl. N+# (stretched: each site carries the full load, N+# per site)
  const compute = st ? 2 * (base + c.nPlus) : base + c.nPlus;
  let n = Math.max(floor, compute);
  if (st && n % 2) n++;
  let pol: Policy | null = vs ? policy(c, n) : null, ded = 1, storH = 0;
  const usableAt = (k: number) => {
    const p = policy(c, k), d = dedupeAllowed(c, s, k) ? Math.max(1, c.dedupe) : 1;
    const rr = c.rebuild ? (st ? 2 : 1) : 0;
    return { p, d, u: Math.max(0, h.rawTiB * (k - rr) * (1 - c.opsRes / 100) * Math.max(1, c.comp) * d / p.f) };
  };
  if (vs) {
    const need = (k: number) => L.stor + h.svmStorTiB * k;
    let k = n, r = usableAt(k);
    if (h.rawTiB > 0) while (r.u < need(k) - 1e-9 && k < 5000) { k += st ? 2 : 1; r = usableAt(k); }
    storH = k; if (k > n) n = k;
    r = usableAt(n); pol = r.p; ded = r.d;
  }
  let limiter: Limiter = "Minimum";
  if (vs && storH > Math.max(floor, compute)) limiter = "Storage";
  else if (compute >= floor && base > 0) limiter = cpuH >= ramH ? "CPU" : "RAM";
  const fixed = c.fixedHosts > 0 ? Math.max(c.fixedHosts, 0) : 0;
  const total = fixed || n;
  return { total, need: n, short: fixed > 0 && fixed < n, fixed, cpuH, ramH, base, compute, floor, storH, limiter, pol, usable: vs ? usableAt(total).u : 0,
    rawTiB: h.rawTiB * total, ded, h, cores, ram, stor: L.stor, noStorage: vs && h.rawTiB <= 0 && L.stor > 0, extTiB: vs ? 0 : L.stor / (1 - c.opsRes / 100) };
}
export type ClusterSize = ReturnType<typeof sizeCluster>;
