// Shapes the engine works with. They match what the current VCF Sizing page stores, so saved
// settings load unchanged; the versioned design document (build step 2) maps onto these.

export type Spec = [vcpu: number, ramGB: number, diskGB: number];

export interface Vendor { label: string; sockets: number[]; channels: number[]; dpc: number[]; cores: number[] }

export interface HostType {
  id: string; name: string; vendor: string; sockets: number; cores: number; ramGB: number; ht: boolean; nvme: number; nvmeTB: number;
}
/** A host type as stored or loaded, possibly with fields from older versions of the page. */
export type HostTypeInput = Partial<HostType> & Record<string, unknown>;

export interface Profile {
  ha: boolean; vc: string; nsx: [nodes: number, size: string]; first: Spec; add: Spec;
  auto: [label: string, vcpu: number, ramGB: number, diskGB: number];
  workers: [count: number, vcpu: number, ramGB: number]; logW: [vcpu: number, ramGB: number];
}

export interface Settings {
  version: string; profile: string; automation: boolean; logs: boolean; logReplicas: number;
  opsNet: string; opsNetNodes: number; opsNetCollectors: number;
  hcxOn: boolean; hcxNe: number; hcxNeHa: boolean;
  vdefend: string; ids: boolean; mps: boolean; ssp: string; gwfw: boolean;
  vlrOn: boolean; vlrVms: number; aviOn: boolean; aviCtl: string; aviSe: number; aviSeSize: number; aviSeOn: string;
  dsmOn: boolean;
  cpuRatio: number; mgmtRatio: number; ramRatio: number; memReserve: number; vsanMem: number; memFill: number;
  vmOverhead: number; growth: number; uplift: number; activePct: number; storageBasis: string;
  customer?: string; site?: string; notes?: string;
}

export interface ClusterDefaults {
  hostType: string; storage: string; topo: string; nPlus: number; policy: string; local: string; comp: number; dedupe: number;
  opsRes: number; rebuild: boolean; maxHosts: number; fixedHosts: number; auto: boolean; vdefend: boolean;
  tierOn: boolean; tierDrives: number; tierPct: number; supOn: boolean; supSize: string;
}
export interface Cluster extends ClusterDefaults { id: string; name: string; clone?: boolean }
/** A cluster with its host type resolved, as the engine sizes it. */
export interface SizedCluster extends Cluster { hw: HostType }

export interface Edge { id: string; name: string; nodes: number; size: string; on: string; bmCores: number; _cl?: string }
export interface Domain {
  id: string; name: string; kind: string; vcSize: string; nsx: string; nsxSize: string; nsxNodes: number; clusters: Cluster[]; edges: Edge[];
}
export interface Instance { id: string; name: string; profile: string; mgmt: Domain; wlds: Domain[]; _prof?: string }
export interface Topology { instances: Instance[] }

export interface BigVm { name: string; cpus: number; memGiB: number }
export interface GroupOpts { cpuPeak: number; ramPeak: number; place: string; drTo: string; drMode: string }
export interface Group {
  id: number; name: string; include: boolean; values: Record<string, number | string>;
  opts?: Partial<GroupOpts>; meta?: { big?: BigVm[]; [k: string]: unknown } | null; [k: string]: unknown;
}

/** Demand placed on a cluster. wvcpu is sized at the CPU ratio and wram at the RAM ratio; coresFixed and ramFixed are absolute. */
export interface Load {
  wvcpu: number; coresFixed: number; wram: number; ramFixed: number; stor: number; vms: number; vcpu: number; vramGiB: number; activeGiB: number;
}
export type ClusterLoad = Pick<Load, "wvcpu" | "coresFixed" | "wram" | "ramFixed" | "stor"> & Partial<Load>;

export interface Warning { lvl: "crit" | "warn" | "info"; t: string }

/** Whether a cluster is its instance's management default cluster: false, true, or that instance's deployment model. */
export type MgmtDefault = false | true | Profile;
