// The design document: one versioned JSON object holding every choice. Everything else reads or
// writes this. Sections follow the guided flow; inside them the engine's own field names are used,
// so the mapping to the engine (designToEngine) is direct.
import { DEFAULTS } from "../knowledge.ts";
import type { Settings, HostType, Topology, Group } from "../types.ts";

export const FORMAT = "vcf-design";
export const FORMAT_VERSION = 1;

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

export type DesignGroup = Pick<Group, "id" | "name" | "include" | "values" | "opts" | "meta"> & { source: string };

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
