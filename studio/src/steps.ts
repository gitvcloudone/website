// Guided-step status: what's done, decided, accepted as recommended, skipped or still open.
// Only explicit choices are stored (design.decisions.steps: "recommended" | "skipped"); everything else is
// worked out from the design, so the guided steps and the Expert view always agree. No DOM; tested.
import { CLUSTER_DEFAULTS, IDENTITY } from "../../engine/src/index.ts";
import type { Design, StepChoice } from "../../engine/src/index.ts";
import { policyFields, fleetFields, addonFields, clusterNetFields, nsxFields } from "./fields.ts";
import { allDomains, recommendedNsx, effectiveNsx, nsxOpen, NSX_KEYS } from "./nsx.ts";
import { allClusters, recommended, effective, hostnetOpen, NET_KEYS } from "./hostnet.ts";
import type { Field } from "./fields.ts";
import type { Op, Path } from "./store.ts";
import { STEPS } from "./flow.ts";

/** Cluster settings that belong to the Cluster storage step (the rest of a cluster is Topology). */
export const STORAGE_KEYS = ["policy", "local", "comp", "dedupe", "opsRes", "rebuild", "tierOn", "tierDrives", "tierPct"] as const;
const STORAGE_LABELS: Record<string, string> = { policy: "vSAN policy", local: "Local protection per site", comp: "Compression / data reduction", dedupe: "Dedupe ratio",
  opsRes: "Operations / free-space reserve (%)", rebuild: "Host rebuild reserve", tierOn: "Memory tiering", tierDrives: "Tier drives", tierPct: "Tier ratio (% of DRAM)" };

export interface Change { path: Path; where: string; label: string; value: unknown; def: unknown }

const show = (f: Pick<Field, "choices">, v: unknown) => {
  const c = (f.choices || []).find(x => String(x[0]) === String(v));
  return c ? c[1] : typeof v === "boolean" ? (v ? "on" : "off") : v === "" ? "none" : String(v);
};

/** Values on a skippable step that differ from the recommended (default) ones. */
export function changes(d: Design, step: string): Change[] {
  const sec = (name: "policy" | "fleet" | "addons", fs: Field[]): Change[] => {
    const o = d[name] as unknown as Record<string, unknown>;
    return fs.filter(f => f.def !== undefined && o[f.key] !== f.def).map(f => ({ path: [name, f.key], where: "", label: f.label, value: show(f, o[f.key]), def: show(f, f.def) }));
  };
  if (step === "policy") return sec("policy", policyFields());
  if (step === "fleet") return sec("fleet", fleetFields(d.fleet));
  if (step === "addons") return sec("addons", addonFields(d.addons, []).flatMap(g => g.fields));
  if (step === "identity") {
    const m = d.identity.mode;
    return m && m !== "instance" ? [{ path: ["identity", "mode"], where: "", label: "Identity Broker mode", value: IDENTITY.modes[m].label, def: IDENTITY.modes.instance.label }] : [];
  }
  if (step === "hostnet") {
    const out: Change[] = [];
    allClusters(d).forEach(({ c }) => {
      const rec = recommended(d, c), v = effective(d, c), fs = clusterNetFields(rec);
      for (const key of NET_KEYS) if (v[key] !== rec[key]) { const f = fs.find(x => x.key === key)!;
        out.push({ path: ["network", "clusters", c.id, key], where: c.name, label: f.label, value: show(f, v[key]), def: show(f, rec[key]) }); }
    });
    return out;
  }
  if (step === "nsx") {
    const out: Change[] = [];
    allDomains(d).forEach(({ inst, dm }) => {
      const rec = recommendedNsx(d, dm), v = effectiveNsx(d, dm), fs = nsxFields(rec, v.model, dm.edges.length > 0);
      const where = d.topology.instances.length > 1 ? `${inst.name} / ${dm.name}` : dm.name;
      for (const key of NSX_KEYS) if (v[key] !== rec[key]) { const f = fs.find(x => x.key === key)!;
        out.push({ path: ["network", "domains", dm.id, key], where, label: f.label, value: show(f, v[key]), def: show(f, rec[key]) }); }
    });
    return out;
  }
  if (step === "storage") {
    const out: Change[] = [];
    d.topology.instances.forEach((inst, ii) => [inst.mgmt, ...inst.wlds].forEach((dm, k) => dm.clusters.forEach((c, ci) => {
      const base: Path = ["topology", "instances", ii, ...(k === 0 ? ["mgmt"] : ["wlds", k - 1]), "clusters", ci];
      const o = c as unknown as Record<string, unknown>, D = CLUSTER_DEFAULTS as unknown as Record<string, unknown>;
      for (const key of STORAGE_KEYS) if (o[key] !== D[key]) out.push({ path: [...base, key], where: c.name, label: STORAGE_LABELS[key], value: show({}, o[key]), def: show({}, D[key]) });
    })));
    return out;
  }
  return [];
}

export type StepState = "done" | "todo" | "decided" | StepChoice | "open" | "coming" | "";

/** Identity entries that can't work as they are (roles that lost their scope or have no group). What's not chosen yet is in the best-practice rules. */
export function identityOpen(d: Design): string[] {
  // provider, provisioning and role matrix: the SC-IDENTITY rule; break-glass holder and rotation: RC-BREAKGLASS
  const x = d.identity, out: string[] = [];
  const lost = x.roles.filter(r => !r.scope).length;
  if (lost) out.push(`${lost} role${lost > 1 ? "s" : ""} lost ${lost > 1 ? "their" : "its"} scope when an instance or domain was removed: choose again.`);
  if (x.roles.some(r => !r.group.trim())) out.push("A role has no identity provider group.");
  return out;
}

/** A step's state, a short note (what's missing, or what was decided) and, for Identity, the choices still open. */
export function stepState(d: Design, id: string): { state: StepState; note: string; open?: string[] } {
  const s = STEPS.find(x => x.id === id);
  if (!s) return { state: "", note: "" };
  if (s.kind === "coming") return { state: "coming", note: "Comes in a later build step." };
  if (s.kind === "required") {
    const miss = id === "project" ? (d.project.customer.trim() ? "" : "Add the customer name.")
      : id === "workload" ? (d.workload.groups.some(g => g.include && ((Number(g.values.vcpu) || 0) > 0 || (Number(g.values.vramGiB) || 0) > 0)) ? "" : "Add the workload: RVTools exports or a manual group with vCPU or vRAM.")
      : id === "hosts" ? (d.hostTypes.length ? "" : "Add at least one host type.")
      : id === "topology" ? (d.topology.instances.some(i => i.mgmt.clusters.length) ? "" : "Add an instance with a cluster in its management domain.")
      : "";
    return miss ? { state: "todo", note: miss } : { state: "done", note: "" };
  }
  if (id === "identity") {
    const x = d.identity, open = identityOpen(d), chosen = d.decisions.steps[id];
    const any = !!(x.mode || x.idp || x.roles.length || x.breakGlass.holder || x.breakGlass.vault || x.breakGlass.notes || x.breakGlass.rotationDays);
    const rest = open.length ? ` ${open.length} choice${open.length > 1 ? "s" : ""} still open.` : "";
    if (changes(d, id).length) return { state: "decided", note: "Embedded mode chosen (Broadcom intends it for labs and proofs of concept)." + rest, open };
    if (chosen === "recommended" && x.mode === "instance") return { state: "recommended", note: "Recommended mode accepted." + rest, open };
    if (chosen === "skipped" && !any) return { state: "skipped", note: "Skipped for now: an open item in the design.", open: [] };
    if (any) return { state: "decided", note: (x.mode ? "Mode chosen." : "Mode not chosen yet.") + rest, open: x.mode ? open : ["Choose the Identity Broker mode.", ...open] };
    return { state: "open", note: "Not decided yet.", open: [] };
  }
  if (s.kind === "skippable") {
    const n = changes(d, id).length, chosen = d.decisions.steps[id];
    const open = chosen === "skipped" ? undefined : id === "hostnet" ? hostnetOpen(d) : id === "nsx" ? nsxOpen(d) : undefined;
    const rest = open && open.length ? ` ${open.length} item${open.length > 1 ? "s" : ""} still open.` : "";
    if (n) return { state: "decided", note: `${n} value${n > 1 ? "s" : ""} changed from the recommendation.` + rest, open };
    if (chosen === "recommended") return { state: "recommended", note: "Recommended values accepted." + rest, open };
    if (chosen === "skipped") return { state: "skipped", note: "Skipped for now: an open item in the design." };
    return { state: "open", note: "Recommended values in place, not reviewed yet.", open: open && open.length ? open : undefined };
  }
  return { state: "", note: "" };
}

const withChoice = (d: Design, id: string, c: StepChoice | null): Op => {
  const steps = { ...d.decisions.steps }; if (c) steps[id] = c; else delete steps[id];
  return { op: "set", path: ["decisions", "steps"], value: steps };
};
/** Use recommended: every changed value back to its default, and the choice recorded. */
export function recommendOps(d: Design, id: string): Op[] {
  if (id === "identity") return [{ op: "set", path: ["identity", "mode"], value: "instance" }, withChoice(d, id, "recommended")];
  if (id === "hostnet") return [{ op: "set", path: ["network", "clusters"], value: {} }, withChoice(d, id, "recommended")];
  if (id === "nsx") {   // back to the recommendation, keeping the ASNs entered
    const keep = Object.fromEntries(Object.entries(d.network.domains).map(([k, v]) => [k, { ...(v.localAsn ? { localAsn: v.localAsn } : {}), ...(v.peerAsn ? { peerAsn: v.peerAsn } : {}) }]).filter(([, v]) => Object.keys(v).length));
    return [{ op: "set", path: ["network", "domains"], value: keep }, withChoice(d, id, "recommended")];
  }
  const D: Record<string, unknown> = id === "storage" ? CLUSTER_DEFAULTS as unknown as Record<string, unknown> : {};
  const ops: Op[] = changes(d, id).map(c => {
    if (id === "storage") return { op: "set", path: c.path, value: D[c.path[c.path.length - 1] as string] };
    const f = (id === "policy" ? policyFields() : id === "fleet" ? fleetFields(d.fleet) : addonFields(d.addons, []).flatMap(g => g.fields)).find(x => x.key === c.path[1])!;
    return { op: "set", path: c.path, value: f.def };
  });
  return [...ops, withChoice(d, id, "recommended")];
}
/** Skip for now: values untouched, the step stays open in the design. */
export const skipOps = (d: Design, id: string): Op[] => [withChoice(d, id, "skipped")];
/** Undo either choice. */
export const reopenOps = (d: Design, id: string): Op[] => [withChoice(d, id, null)];
