// The design document: one versioned JSON object holding every choice. Everything else reads or
// writes this. Sections follow the guided flow; inside them the engine's own field names are used,
// so the mapping to the engine (designToEngine) is direct.
import { DEFAULTS } from "../knowledge.ts";
import type { Settings, HostType, Topology, Group } from "../types.ts";

export const FORMAT = "vcf-design";
export const FORMAT_VERSION = 5;

// Which sizing setting lives in which section. Together they are exactly the page's settings (DEFAULTS + project text).
export const SECTION_KEYS = {
  project: ["customer", "site", "notes", "version"],
  fleet: ["profile", "automation", "logs", "logReplicas", "opsNet", "opsNetNodes", "opsNetCollectors"],
  policy: ["cpuRatio", "mgmtRatio", "ramRatio", "memReserve", "vsanMem", "memFill", "vmOverhead", "growth", "uplift", "activePct", "storageBasis"],
  addons: ["vdefend", "ids", "mps", "ssp", "gwfw", "vlrOn", "vlrVms", "aviOn", "aviCtl", "aviSe", "aviSeSize", "aviSeOn", "hcxOn", "hcxNe", "hcxNeHa", "dsmOn"],
} as const satisfies Record<string, readonly (keyof Settings)[]>;
export type SectionName = keyof typeof SECTION_KEYS;
type Section<N extends SectionName> = Pick<Settings, (typeof SECTION_KEYS)[N][number]>;

export interface RvtoolsScope { includeOff: boolean; templatesStorage: boolean; exVcls: boolean; patterns: string; groupBy: string }
export const DEFAULT_SCOPE: RvtoolsScope = { includeOff: true, templatesStorage: true, exVcls: true, patterns: "", groupBy: "file" };

/** parsed: an RVTools group's values as read from the files (format 2+), so hand edits show and can be reset; null for manual groups and when not known. */
export type DesignGroup = Pick<Group, "id" | "name" | "include" | "values" | "opts" | "meta"> & { source: string; parsed: Record<string, number> | null };

/** Explicit choices on the skippable guided steps (format 3+). Whether a step is "decided" is worked out from its values. */
export type StepChoice = "recommended" | "skipped";
export const STEP_CHOICES: readonly StepChoice[] = ["recommended", "skipped"];
export interface Decisions { steps: Record<string, StepChoice> }

/** Identity & access (format 4+). "" = not decided yet. A role's scope is "fleet" or an instance / domain id; "" when that was removed. */
export type Access = "admin" | "operator" | "readonly";
export interface Role { group: string; scope: string; access: Access }
export interface Identity {
  mode: "" | "instance" | "embedded"; idp: string; provisioning: string; roles: Role[];
  breakGlass: { holder: string; vault: string; rotationDays: number; notes: string };
}
export const newIdentity = (): Identity => ({ mode: "", idp: "", provisioning: "", roles: [], breakGlass: { holder: "", vault: "", rotationDays: 0, notes: "" } });

/** Host networking (format 5+). Per-cluster values are stored only where they differ from the recommendation. */
export interface ClusterNet { vds?: string; nicGbps?: number; mtu?: number; tep?: string }
export interface Network {
  domain: string; dns: string; ntp: string;
  /** physical NICs per host for VCF traffic, by host type id (2 when not set) */
  hostNics: Record<string, number>;
  clusters: Record<string, ClusterNet>;
}
export const newNetwork = (): Network => ({ domain: "", dns: "", ntp: "", hostNics: {}, clusters: {} });

export interface Design {
  format: typeof FORMAT;
  formatVersion: number;
  project: Section<"project"> & { customer: string; site: string; notes: string };
  workload: { groups: DesignGroup[]; rvtoolsScope: RvtoolsScope };
  policy: Section<"policy">;
  fleet: Section<"fleet">;
  hostTypes: HostType[];
  topology: Topology;
  addons: Section<"addons">;
  identity: Identity;
  network: Network;
  decisions: Decisions;
}

const pick = <N extends SectionName>(n: N, s: Record<string, unknown>) => Object.fromEntries(SECTION_KEYS[n].map(k => [k, s[k]])) as Section<N>;

/** Split flat page settings into design sections. */
export function sectionsFromSettings(s: Settings) {
  const r = s as unknown as Record<string, unknown>;
  return { project: pick("project", r) as Design["project"], fleet: pick("fleet", r), policy: pick("policy", r), addons: pick("addons", r) };
}

/** Flat page settings from a design (the engine's `s`). */
export function settingsFromDesign(d: Design): Settings {
  return { ...d.project, ...d.fleet, ...d.policy, ...d.addons } as Settings;
}

/** A new, empty design with today's defaults. */
export function newDesign(): Design {
  return {
    format: FORMAT, formatVersion: FORMAT_VERSION,
    ...sectionsFromSettings({ ...DEFAULTS, customer: "", site: "", notes: "" }),
    workload: { groups: [], rvtoolsScope: { ...DEFAULT_SCOPE } },
    hostTypes: [], topology: { instances: [] },
    identity: newIdentity(),
    network: newNetwork(),
    decisions: { steps: {} },
  } as Design;
}

/** Engine inputs for a design: exactly what the page passes to size(). A deep copy, so sizing never touches the design. */
export function designToEngine(d: Design) {
  const c = structuredClone(d);
  return {
    s: { ...settingsFromDesign(c) },
    hostTypes: c.hostTypes,
    topo: c.topology,
    groups: c.workload.groups.map(g => ({ ...g })) as Group[],
    scope: c.workload.rvtoolsScope,
  };
}
