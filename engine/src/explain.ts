// Plain-language reasons for sizing results: what decided each cluster's host count.
// Reads what sizeCluster already records (limiter, CPU / RAM / storage hosts, floor); changes nothing.
import type { ClusterResult, SizingResult } from "./fleet.ts";

const plural = (n: number, w: string) => `${n.toLocaleString("en-US")} ${w}${n === 1 ? "" : "s"}`;
const LIMITER = { CPU: "CPU-bound", RAM: "memory-bound", Storage: "storage-bound", Minimum: "at the minimum", Fixed: "set by hand" } as const;

/** Hosts each resource needs on its own, before spares (stretched: both sites). */
export function hostsFor(c: Pick<ClusterResult, "cpuH" | "ramH" | "c">) {
  const st = c.c.topo === "stretched", k = (x: number) => (Number.isFinite(x) ? Math.max(0, Math.ceil(x - 1e-9)) : Infinity) * (st ? 2 : 1);
  return { cpu: k(c.cpuH), ram: k(c.ramH), spares: c.c.nPlus * (st ? 2 : 1) };
}

/** "8 hosts: memory-bound (RAM needs 7, CPU 5, + 1 spare)" */
export function clusterReason(c: ClusterResult): string {
  const n = hostsFor(c), spare = n.spares ? `, + ${plural(n.spares, "spare")}` : "";
  const head = `${plural(c.total, "host")}: `;
  if (c.fixed) return head + `set by hand${c.short ? `, needs ${c.need} (${LIMITER[c.limiter]})` : ` (needs ${c.need})`}`;
  if (c.limiter === "CPU") return head + `${LIMITER.CPU} (CPU needs ${n.cpu}, RAM ${n.ram}${spare})`;
  if (c.limiter === "RAM") return head + `${LIMITER.RAM} (RAM needs ${n.ram}, CPU ${n.cpu}${spare})`;
  if (c.limiter === "Storage") return head + `${LIMITER.Storage} (vSAN capacity needs ${c.storH}; CPU and RAM need ${Math.max(n.cpu, n.ram) + n.spares} with spares)`;
  return head + `${LIMITER.Minimum} for this cluster (${c.floor}); CPU and RAM need ${Math.max(n.cpu, n.ram) + n.spares} with spares`;
}

/** One line for the whole design: hosts, what decided most of them, licences. */
export function summaryLine(r: SizingResult): string {
  if (!r.clusters.length) return "No clusters yet.";
  const by: Record<string, number> = {};
  for (const c of r.clusters) { const k = c.fixed ? "Fixed" : c.limiter; by[k] = (by[k] || 0) + c.total; }
  const top = Object.entries(by).sort((a, b) => b[1] - a[1])[0];
  const share = top[1] === r.hosts ? "all" : `${top[1].toLocaleString("en-US")} of them`;
  return `${plural(r.hosts, "host")}, ${share} ${LIMITER[top[0] as keyof typeof LIMITER]} · ${r.licCores.toLocaleString("en-US")} VCF cores`;
}
