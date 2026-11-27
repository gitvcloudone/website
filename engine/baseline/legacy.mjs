// Loads the sizing engine exactly as the live page runs it: the engine <script> block of
// vcf-sizing/index.html, evaluated unchanged in its own context. This is the reference the
// TypeScript engine must match until the old code is removed.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const PAGE = fileURLToPath(new URL("../../vcf-sizing/index.html", import.meta.url));
const START = "// ===== VCF on-premises sizing engine";

export const NAMES = [
  "TIB", "GIB", "TB", "VENDORS", "DIMMS", "NVME_TB", "TIER_MAX_GIB", "HOST_RAM_MAX_GB", "HOST_LCPU_MAX",
  "PROFILES", "VCENTER", "NSXMGR", "EDGE", "WITNESS", "OPSNET", "SUPERVISOR", "ADDON", "DEFAULTS", "CLUSTER_DEFAULTS", "POL",
  "ramOptions", "defaultHw", "fixHw", "hwText", "tierMax", "isVsan", "maxFor", "workloadTotals", "hostCfg", "localPol", "policy",
  "policyMin", "dedupeAllowed", "profName", "clusterFloor", "sizeCluster", "groupDemand", "flatten", "size", "largeVms", "checks",
  "COLS", "HCOLS", "parseRVTools", "excludeRules", "buildGroups",
];

export function engineSource(html = readFileSync(PAGE, "utf8")) {
  const a = html.indexOf(START);
  if (a < 0) throw new Error("Engine block not found in vcf-sizing/index.html");
  const b = html.indexOf("</script>", a);
  return html.slice(a, b);
}

export function loadLegacy() {
  const ctx = vm.createContext({});
  vm.runInContext(engineSource() + `\n;globalThis.__api = { ${NAMES.join(", ")} };`, ctx, { filename: "vcf-sizing/index.html#engine" });
  return ctx.__api;
}
