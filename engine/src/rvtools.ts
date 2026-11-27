// RVTools parsing (pure: takes sheet rows as arrays of objects, as SheetJS sheet_to_json gives them).
import type { BigVm } from "./types.ts";

type Row = Record<string, unknown>;
type Rows = Row[] | null | undefined;

export const COLS: Record<string, string[]> = {
  name: ["VM"], power: ["Powerstate", "Power state"], template: ["Template"], cpus: ["CPUs", "# CPU"], mem: ["Memory", "Memory MiB", "Memory MB"],
  prov: ["Provisioned MiB", "Provisioned MB"], inuse: ["In Use MiB", "In Use MB"], uuid: ["VM UUID", "SMBIOS UUID"],
  server: ["VI SDK Server", "VI SDK Server type"], cluster: ["Cluster"], os: ["OS according to the configuration file", "OS according to the VMware Tools", "OS"],
};
export const HCOLS: Record<string, string[]> = { host: ["Host"], cores: ["# Cores"], mem: ["# Memory"], model: ["CPU Model"], cluster: ["Cluster"] };

function findCol(headers: string[], names: string[]): string | null { for (const n of names) if (headers.includes(n)) return n; return null; }
function truthy(v: unknown) { return v === true || String(v).toLowerCase() === "true"; }

export interface RvVm {
  name: string; server: string; cluster: string; key: string; on: boolean; template: boolean; cpus: number; memMiB: number; provMiB: number; inuseMiB: number; os: string;
  capMiB: number | null; guestMiB: number | null; cpuMHz: number | null; actMiB: number | null; conMiB: number | null; mhz: number | null;
}
export interface RvEstate { hosts: number; cores: number; ramGiB: number; models: Record<string, number>; speedMHz?: number | null; cpuPct?: number | null; memPct?: number | null }
export interface RvFile { fileName: string; vcenter?: string; vms: RvVm[]; est?: RvEstate | null; issues?: string[]; error?: string }

export function parseRVTools(vInfo: Rows, vHost: Rows, vDisk: Rows, vPartition: Rows, fileName: string, vCPU?: Rows, vMemory?: Rows): RvFile {
  const issues: string[] = [];
  if (!vInfo || !vInfo.length) return { fileName, error: "No vInfo sheet found. Export from RVTools with 'Export all to Excel'.", vms: [] };
  const headers = Object.keys(vInfo[0]);
  const col: Record<string, string | null> = {};
  for (const [k, names] of Object.entries(COLS)) {
    col[k] = findCol(headers, names);
    if (!col[k] && ["name", "cpus", "mem"].includes(k)) return { fileName, error: `Column '${names[0]}' not found in vInfo.`, vms: [] };
    if (col[k] && col[k] !== names[0]) issues.push(`Used '${col[k]}' for '${names[0]}'.`);
  }
  if (!col.prov && !col.inuse) issues.push("No provisioned or in-use storage columns: storage will be 0.");
  const mbFactor = (c: string | null) => (c && /MB$/.test(c) ? 1e6 / 1048576 : 1); // MB → MiB
  // Per-VM disk capacity (vDisk) and guest-consumed space (vPartition), joined on vCenter + VM name
  const sumBy = (rows: Rows, valNames: string[]) => {
    const m = new Map<string, number>(); if (!rows || !rows.length) return null;
    const hh = Object.keys(rows[0]); const vc = findCol(hh, valNames); const sc = findCol(hh, COLS.server);
    if (!vc) return null;
    const f = /MB$/.test(vc) ? 1e6 / 1048576 : 1;
    for (const r of rows) { if (!r.VM) continue; const k = (sc ? String(r[sc] ?? "") : fileName) + "|" + r.VM; m.set(k, (m.get(k) || 0) + (Number(r[vc]) || 0) * f); }
    return m;
  };
  const capMap = sumBy(vDisk, ["Capacity MiB", "Capacity MB"]);
  const useMap = sumBy(vPartition, ["Consumed MiB", "Consumed MB"]);
  // Point-in-time utilization (reference only): VM CPU usage (MHz) from vCPU, active/consumed memory (MiB) from vMemory
  const cpuMap = sumBy(vCPU, ["Overall"]);
  const actMap = sumBy(vMemory, ["Active"]);
  const conMap = sumBy(vMemory, ["Consumed"]);
  if (!capMap) issues.push("No vDisk sheet: allocated storage falls back to vInfo 'Provisioned'.");
  if (!useMap) issues.push("No vPartition sheet: guest-used storage falls back to vInfo 'In Use'.");
  const vms: RvVm[] = [];
  for (const r of vInfo) {
    const name = r[col.name!];
    if (name === null || name === undefined || name === "") continue;
    const server = col.server ? String(r[col.server] ?? "") : fileName;
    const v = {
      name: String(name), server, cluster: col.cluster ? String(r[col.cluster] ?? "") : "",
      key: (col.uuid && r[col.uuid]) ? "u:" + String(r[col.uuid]).toLowerCase() : "n:" + server + "|" + name,
      on: col.power ? String(r[col.power]).toLowerCase() === "poweredon" : true,
      template: col.template ? truthy(r[col.template]) : false,
      cpus: Number(r[col.cpus!]) || 0,
      memMiB: (Number(r[col.mem!]) || 0) * mbFactor(col.mem),
      provMiB: col.prov ? (Number(r[col.prov]) || 0) * mbFactor(col.prov) : 0,
      inuseMiB: col.inuse ? (Number(r[col.inuse]) || 0) * mbFactor(col.inuse) : 0,
      os: col.os ? String(r[col.os] ?? "") : "",
    } as RvVm;
    vms.push(v);
    const jk = server + "|" + name;
    v.capMiB = capMap ? (capMap.get(jk) ?? null) : null;
    v.guestMiB = useMap ? (useMap.get(jk) ?? null) : null;
    v.cpuMHz = cpuMap ? (cpuMap.get(jk) ?? null) : null;
    v.actMiB = actMap ? (actMap.get(jk) ?? null) : null;
    v.conMiB = conMap ? (conMap.get(jk) ?? null) : null;
  }
  let est: RvEstate | null = null;
  if (vHost && vHost.length) {
    const hh = Object.keys(vHost[0]); const hc: Record<string, string> = {};
    for (const [k, names] of Object.entries(HCOLS)) hc[k] = findCol(hh, names) as string;
    const rows = vHost.filter(r => r[hc.host]);
    const models: Record<string, number> = {};
    for (const r of rows) { const m = hc.model ? String(r[hc.model]) : "?"; models[m] = (models[m] || 0) + 1; }
    est = { hosts: rows.length, cores: rows.reduce((a, r) => a + (Number(r[hc.cores]) || 0), 0),
            ramGiB: rows.reduce((a, r) => a + (Number(r[hc.mem]) || 0), 0) / 1024, models };
    const sp = findCol(hh, ["Speed"]), cu = findCol(hh, ["CPU usage %"]), mu = findCol(hh, ["Memory usage %"]);
    const wsum = (col: string) => { let a = 0, c = 0; for (const r of rows) { const x = Number(r[col]), k = Number(r[hc.cores]) || 1; if (isFinite(x) && r[col] !== null) { a += x * k; c += k; } } return c ? a / c : null; };
    if (sp) est.speedMHz = wsum(sp);
    if (cu) est.cpuPct = wsum(cu);
    if (mu) est.memPct = wsum(mu);
  } else issues.push("No vHost sheet: current-estate summary unavailable for this file.");
  const speed = est && est.speedMHz ? est.speedMHz : null;
  for (const v of vms) v.mhz = speed;
  const vcenters = [...new Set(vms.map(v => v.server))];
  return { fileName, vcenter: vcenters.join(", "), vms, est, issues };
}

export interface ExcludeRule { label: string; re: RegExp; count: number; samples: string[] }

/** Exclusion rules: the vCLS checkbox plus comma-separated name patterns (* = any characters, case-insensitive) */
export function excludeRules(scope: { exVcls?: boolean; patterns?: string }): ExcludeRule[] {
  const rules: ExcludeRule[] = [];
  if (scope.exVcls) rules.push({ label: "vCLS", re: /^vCLS/i, count: 0, samples: [] });
  const esc = (t: string) => t.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
  for (const raw of String(scope.patterns || "").split(",")) {
    const t = raw.trim(); if (!t) continue;
    if (rules.some(r => r.label.toLowerCase() === t.toLowerCase())) continue;
    rules.push({ label: t, re: new RegExp("^" + t.split("*").map(esc).join(".*") + "$", "i"), count: 0, samples: [] });
  }
  return rules;
}

export interface RvScope { includeOff: boolean; templatesStorage: boolean; exVcls: boolean; patterns: string; groupBy?: string }
export interface RvGroup {
  key: string; vms: number; vcpu: number; vramGiB: number; usedTiB: number; allocTiB: number; dsTiB: number; templTiB: number; templates: number; off: number;
  noGuest: number; maxVcpu: number; maxRamGiB: number; big: BigVm[]; snap: { cpuPct: number | null; actPct: number | null; conPct: number | null };
}

/** Build workload groups from parsed files. groupBy: "file" | "cluster" */
export function buildGroups(files: (RvFile & { include?: boolean; label?: string })[], scope: RvScope, groupBy: string) {
  const rules = excludeRules(scope), reErr = null;
  const seen = new Set<string>(); let dups = 0, excluded = 0, offExcluded = 0, templates = 0, considered = 0;
  const groups = new Map<string, Record<string, any>>();
  for (const f of files) {
    if (!f.include || f.error) continue;
    for (const v of f.vms) {
      if (seen.has(v.key)) { dups++; continue; }
      seen.add(v.key);
      considered++;
      const rule = rules.find(r => r.re.test(v.name));
      if (rule) { excluded++; rule.count++; if (rule.samples.length < 5) rule.samples.push(v.name); continue; }
      const gk = groupBy === "cluster" ? `${v.server} / ${v.cluster || "(no cluster)"}` : (f.label || f.vcenter || f.fileName);
      if (!groups.has(gk)) groups.set(gk, { key: gk, vms: 0, vcpu: 0, vramGiB: 0, usedTiB: 0, allocTiB: 0, dsTiB: 0, templTiB: 0, templates: 0, off: 0,
        _gUsed: 0, _gCap: 0, _noGuestCap: 0, _noGuestDs: 0, noGuest: 0,
        _cpuMHz: 0, _cpuCapMHz: 0, _act: 0, _con: 0, _memSnap: 0, maxVcpu: 0, maxRamGiB: 0, big: [] });
      const g = groups.get(gk)!;
      if (v.template) {
        templates++;
        if (scope.templatesStorage) { g.templTiB += v.inuseMiB / 1048576; g.templates++; }
        continue;
      }
      if (!v.on && !scope.includeOff) { offExcluded++; continue; }
      if (!v.on) g.off++;
      g.vms++; g.vcpu += v.cpus; g.vramGiB += v.memMiB / 1024;
      g.maxVcpu = Math.max(g.maxVcpu, v.cpus); g.maxRamGiB = Math.max(g.maxRamGiB, v.memMiB / 1024);
      if (v.cpus >= 24 || v.memMiB >= 256 * 1024) g.big.push({ name: v.name, cpus: v.cpus, memGiB: v.memMiB / 1024 });
      if (v.on && v.cpuMHz !== null && v.cpuMHz !== undefined && v.mhz) { g._cpuMHz += v.cpuMHz; g._cpuCapMHz += v.cpus * v.mhz; }
      if (v.on && v.actMiB !== null && v.actMiB !== undefined) { g._act += v.actMiB; g._con += v.conMiB || 0; g._memSnap += v.memMiB; }
      const cap = v.capMiB ?? v.provMiB;
      g.allocTiB += cap / 1048576; g.dsTiB += v.inuseMiB / 1048576;
      if (v.guestMiB !== null && v.guestMiB !== undefined && v.capMiB) { g._gUsed += v.guestMiB; g._gCap += v.capMiB; }
      else { g.noGuest++; g._noGuestCap += cap; g._noGuestDs += v.inuseMiB; }
    }
  }
  for (const g of groups.values()) {
    // Guest used; VMs without partition data are estimated at the group's used/allocated ratio (capped by datastore in-use)
    const ratio = g._gCap > 0 ? g._gUsed / g._gCap : null;
    const est = ratio === null ? g._noGuestDs : Math.min(g._noGuestCap * ratio, g._noGuestDs || Infinity);
    g.usedTiB = (g._gUsed + est) / 1048576;
    g.snap = { cpuPct: g._cpuCapMHz > 0 ? g._cpuMHz / g._cpuCapMHz : null, actPct: g._memSnap > 0 ? g._act / g._memSnap : null, conPct: g._memSnap > 0 ? g._con / g._memSnap : null };
    g.big.sort((a: BigVm, b: BigVm) => b.memGiB - a.memGiB || b.cpus - a.cpus); if (g.big.length > 300) g.big.length = 300;
    for (const k of Object.keys(g)) if (k.startsWith("_")) delete g[k];
  }
  return { groups: [...groups.values()] as RvGroup[], dups, excluded, offExcluded, templates, reErr, considered,
    rules: rules.map(r => ({ label: r.label, count: r.count, samples: r.samples })) };
}
