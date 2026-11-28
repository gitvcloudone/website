// The settings the AI may change: design choices only, each with its allowed values and the same op
// builder the forms use. Customer facts (workload, project, DNS and NTP, addresses, ASNs, identity
// provider, roles, break-glass, the IP plan) are not here, so the AI can't set them. No DOM; tested.
import { maxFor, tierMax, IDENTITY } from "../../../engine/src/index.ts";
import type { Design } from "../../../engine/src/index.ts";
import { policyFields, fleetFields, addonFields, clusterFields, hostTypeFields, clusterNetFields, nsxFields } from "../fields.ts";
import type { Field } from "../fields.ts";
import { fieldOps, hostTypeOps } from "../edit.ts";
import { allClusters, recommended, effective, netOps, nicsOps, nicsOf } from "../hostnet.ts";
import { allDomains, recommendedNsx, effectiveNsx, nsxOps } from "../nsx.ts";
import type { Op } from "../store.ts";

export interface Setting {
  id: string; label: string; where: string; type: Field["type"]; choices?: (string | number)[]; min?: number; max?: number;
  value: unknown; recommended?: unknown; ops: (v: unknown) => Op[];
}

const usable = (f: Field) => f.on !== false && f.type !== "text" && f.type !== "textarea";
const allowed = (f: Field) => f.choices?.filter(c => !c[2]).map(c => c[0]);

export function catalog(d: Design): Setting[] {
  const out: Setting[] = [];
  const add = (id: string, where: string, f: Field, value: unknown, ops: (v: unknown) => Op[]) =>
    out.push({ id, label: f.label, where, type: f.type, choices: allowed(f), min: f.min, max: f.max, value, recommended: f.def, ops });
  const sec = (name: "policy" | "fleet" | "addons", fs: Field[]) => { const o = d[name] as unknown as Record<string, unknown>;
    for (const f of fs.filter(usable)) add(`${name}.${f.key}`, name === "addons" ? "Add-ons" : name === "fleet" ? "Fleet management" : "Sizing policy", f, o[f.key], v => [{ op: "set", path: [name, f.key], value: v }]); };
  sec("policy", policyFields());
  sec("fleet", fleetFields(d.fleet));
  sec("addons", addonFields(d.addons, []).flatMap(g => g.fields).filter(f => f.key !== "aviSeOn"));
  for (const h of d.hostTypes) {
    for (const f of hostTypeFields(h).filter(usable)) add(`hostType.${h.id}.${f.key}`, `Host type ${h.name}`, f, (h as unknown as Record<string, unknown>)[f.key], v => hostTypeOps(d, h.id, f.key, v));
    add(`nics.${h.id}`, `Host type ${h.name}`, { key: "nics", label: "Physical NICs for VCF traffic", type: "select", choices: [[2, "2"], [4, "4"]] } as Field, nicsOf(d, h.id), v => nicsOps(d, h.id, Number(v)));
  }
  for (const { inst, dm, c } of allClusters(d)) {
    const hw = d.hostTypes.find(h => h.id === c.hostType) || d.hostTypes[0]; if (!hw) continue;
    const where = `${d.topology.instances.length > 1 ? `${inst.name} / ` : ""}${dm.name} / ${c.name}`;
    for (const f of clusterFields(c, hw, d, maxFor(c), tierMax(c, hw)).filter(usable)) add(`cluster.${c.id}.${f.key}`, where, f, (c as unknown as Record<string, unknown>)[f.key], v => fieldOps(d, c.id, f.key, v));
    const rec = recommended(d, c), cur = effective(d, c) as unknown as Record<string, unknown>;
    for (const f of clusterNetFields(rec).filter(usable)) add(`net.${c.id}.${f.key}`, where, { ...f, def: (rec as unknown as Record<string, unknown>)[f.key] }, cur[f.key], v => netOps(d, c.id, f.key as "vds", f.key === "nicGbps" ? Number(v) : v));
  }
  for (const { inst, dm } of allDomains(d)) {
    const rec = recommendedNsx(d, dm), v = effectiveNsx(d, dm) as unknown as Record<string, unknown>;
    const where = `${d.topology.instances.length > 1 ? `${inst.name} / ` : ""}${dm.name}`;
    for (const f of nsxFields(rec, String(v.model), dm.edges.length > 0).filter(usable)) add(`nsx.${dm.id}.${f.key}`, where, { ...f, def: (rec as unknown as Record<string, unknown>)[f.key] }, v[f.key], x => nsxOps(d, dm.id, f.key as "model", x));
  }
  add("identity.mode", "Identity & access", { key: "mode", label: "Identity Broker mode", type: "select", choices: Object.entries(IDENTITY.modes).map(([k, m]) => [k, m.label]), def: "instance" } as Field,
    d.identity.mode, v => [{ op: "set", path: ["identity", "mode"], value: v }]);
  return out;
}

/** A value from the AI, checked against the setting: right type, an allowed choice, inside its range. */
export function coerce(s: Setting, v: unknown): { ok: true; value: unknown } | { ok: false; error: string } {
  if (s.type === "bool") { const b = v === true || v === "true" ? true : v === false || v === "false" ? false : null;
    return b === null ? { ok: false, error: `${s.id} takes true or false` } : { ok: true, value: b }; }
  if (s.choices) { const c = s.choices.find(x => String(x) === String(v));
    return c === undefined ? { ok: false, error: `${s.id} takes one of: ${s.choices.join(", ")}` } : { ok: true, value: c }; }
  if (s.type === "number") { const n = Number(v);
    if (!Number.isFinite(n)) return { ok: false, error: `${s.id} takes a number` };
    if ((s.min !== undefined && n < s.min) || (s.max !== undefined && n > s.max)) return { ok: false, error: `${s.id} takes ${s.min ?? "–"} to ${s.max ?? "–"}` };
    return { ok: true, value: n }; }
  return { ok: false, error: `${s.id} can't be changed by the AI` };
}
