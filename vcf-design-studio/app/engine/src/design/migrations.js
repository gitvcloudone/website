// Built from TypeScript by studio/build.mjs. Edit the .ts source, then run npm run build.
// Design document migrations. MIGRATIONS[n] upgrades a formatVersion n document to n + 1.
// To change the format: bump FORMAT_VERSION in document.ts, add MIGRATIONS[old] here, and add a
// saved document of the old version to engine/fixtures/designs/ so the upgrade stays tested.
import { FORMAT_VERSION } from "./document.js";

                               
                                        

export const MIGRATIONS                            = {
  // 7 → 8: accepted best-practice deviations, none yet.
  7: d => ({ ...d, decisions: { ...d.decisions, deviations: {} } }),
  // 6 → 7: the IP / VLAN plan, nothing entered yet.
  6: d => ({ ...d, plan: { base: "", vlanStart: 0, rows: {} } }),
  // 5 → 6: NSX connectivity per domain, all recommended.
  5: d => ({ ...d, network: { ...d.network, domains: {} } }),
  // 4 → 5: host networking, all recommended values, fleet services not entered yet.
  4: d => ({ ...d, network: { domain: "", dns: "", ntp: "", hostNics: {}, clusters: {} } }),
  // 3 → 4: identity & access, nothing decided yet.
  3: d => ({ ...d, identity: { mode: "", idp: "", provisioning: "", roles: [], breakGlass: { holder: "", vault: "", rotationDays: 0, notes: "" } } }),
  // 2 → 3: skip / use-recommended choices on the guided steps; none for older files.
  2: d => ({ ...d, decisions: { steps: {} } }),
  // 1 → 2: groups gain `parsed` (an RVTools group's values as read). Not known for older files, so null:
  // their values stay exactly as saved, nothing shows as hand-edited.
  1: d => ({ ...d, workload: { ...d.workload, groups: (d.workload?.groups || []).map((g     ) => ({ ...g, parsed: null })) } }),
};

export function migrateDesign(input     , migrations                            = MIGRATIONS, current = FORMAT_VERSION)      {
  const v = input.formatVersion;
  if (!Number.isInteger(v) || v < 1) throw new Error("This design file has no valid format version.");
  if (v > current) throw new Error(`This design was saved by a newer version of VCF Design Studio (format ${v}; this version reads up to ${current}). Reload the page to get the latest version.`);
  let d = structuredClone(input);
  for (let n = v; n < current; n++) {
    const m = migrations[n];
    if (!m) throw new Error(`No upgrade from design format ${n} to ${n + 1}.`);
    d = { ...m(d), formatVersion: n + 1 };
  }
  return d;
}
