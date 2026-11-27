// VCF sizing engine: pure functions, no DOM. Design in → results, warnings out.
// Pipeline (size): workload demand after ratios → management and add-on load → hosts per cluster by
// CPU, RAM and storage (largest wins, recorded as the cluster's limiter) → minimums and spares → licensing.
export * from "./knowledge.ts";
export { ramOptions, defaultHw, fixHw, hwText } from "./hardware.ts";
export { isVsan, maxFor, tierMax, hostCfg, localPol, policy, policyMin, dedupeAllowed, profName, clusterFloor, sizeCluster } from "./cluster.ts";
export { zeroLoad, addLoad, workloadTotals, groupDemand, flatten, size, largeVms, checks } from "./fleet.ts";
export { COLS, HCOLS, parseRVTools, excludeRules, buildGroups } from "./rvtools.ts";
export type * from "./types.ts";
export type { HostCfg, Policy, Limiter, ClusterSize } from "./cluster.ts";
export type { SizingResult, ClusterResult, LargeVm, Placed } from "./fleet.ts";
export type { RvFile, RvVm, RvGroup, RvScope, RvEstate, ExcludeRule } from "./rvtools.ts";
