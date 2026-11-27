// Design document migrations. MIGRATIONS[n] upgrades a formatVersion n document to n + 1.
// To change the format: bump FORMAT_VERSION in document.ts, add MIGRATIONS[old] here, and add a
// saved document of the old version to engine/fixtures/designs/ so the upgrade stays tested.
import { FORMAT_VERSION } from "./document.ts";

type Doc = Record<string, any>;
export type Migration = (d: Doc) => Doc;

export const MIGRATIONS: Record<number, Migration> = {
  // 1 → 2: groups gain `parsed` (an RVTools group's values as read). Not known for older files, so null:
  // their values stay exactly as saved, nothing shows as hand-edited.
  // 3 → 4: identity & access, nothing decided yet.
  3: d => ({ ...d, identity: { mode: "", idp: "", provisioning: "", roles: [], breakGlass: { holder: "", vault: "", rotationDays: 0, notes: "" } } }),
  // 2 → 3: skip / use-recommended choices on the guided steps; none for older files.
  2: d => ({ ...d, decisions: { steps: {} } }),
  1: d => ({ ...d, workload: { ...d.workload, groups: (d.workload?.groups || []).map((g: Doc) => ({ ...g, parsed: null })) } }),
};

export function migrateDesign(input: Doc, migrations: Record<number, Migration> = MIGRATIONS, current = FORMAT_VERSION): Doc {
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
