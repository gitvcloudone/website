// The knowledge layer: VCF limits, appliance sizes, hardware catalogue and defaults live in
// engine/knowledge/*.json (each table with its source and last-verified date). This module is the
// only place that reads them; it turns them into the compact shapes the engine works with.
import hardware from "../knowledge/hardware.json" with { type: "json" };
import management from "../knowledge/management.json" with { type: "json" };
import addons from "../knowledge/addons.json" with { type: "json" };
import vsan from "../knowledge/vsan.json" with { type: "json" };
import defaults from "../knowledge/defaults.json" with { type: "json" };
import identity from "../knowledge/identity.json" with { type: "json" };
import network from "../knowledge/network.json" with { type: "json" };
import nsx from "../knowledge/nsx.json" with { type: "json" };
import type { Spec, Vendor, Profile, Settings, ClusterDefaults } from "./types.ts";

interface S3 { vcpu: number; ramGB: number; diskGB: number }
const spec = (s: S3): Spec => [s.vcpu, s.ramGB, s.diskGB];
const map = <A, B>(o: Record<string, A>, f: (v: A) => B): Record<string, B> => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, f(v)]));

export const TIB = 1024 ** 4, GIB = 1024 ** 3, TB = 1e12;

const hw = hardware.tables;
export const VENDORS: Record<string, Vendor> = map(hw.vendors.data as Record<string, { label: string; sockets: number[]; memoryChannels: number[]; dimmsPerChannel: number[]; coresPerSocket: number[] }>,
  v => ({ label: v.label, sockets: v.sockets, channels: v.memoryChannels, dpc: v.dimmsPerChannel, cores: v.coresPerSocket }));
export const DIMMS: number[] = hw.dimmsGB.data;
export const NVME_TB: number[] = hw.nvmeTB.data;
export const TIER_MAX_GIB = hw.limits.data.memoryTierMaxBytes / GIB;
export const HOST_RAM_MAX_GB: number = hw.limits.data.hostRamMaxGB;
export const HOST_LCPU_MAX: number = hw.limits.data.hostLogicalCpuMax;

const mg = management.tables;
export const PROFILES: Record<string, Profile> = map(mg.profiles.data, p => ({
  ha: p.ha, vc: p.mgmtVcenterSize, nsx: [p.mgmtNsx.nodes, p.mgmtNsx.size], first: spec(p.firstInstance), add: spec(p.additionalInstance),
  auto: [p.automation.label, p.automation.vcpu, p.automation.ramGB, p.automation.diskGB],
  workers: [p.mgmtServicesWorkers.count, p.mgmtServicesWorkers.vcpu, p.mgmtServicesWorkers.ramGB], logW: [p.logManagementWorker.vcpu, p.logManagementWorker.ramGB],
}));
// vCPU, GB, disk GB, max hosts, max VMs
export const VCENTER: Record<string, number[]> = map(mg.vcenter.data, v => [...spec(v), v.maxHosts, v.maxVms]);
// per node + host and cluster limits
export const NSXMGR: Record<string, number[]> = map(mg.nsxManager.data, v => [...spec(v), v.maxHosts, v.maxClusters]);
export const EDGE: Record<string, Spec> = map(mg.edge.data, spec);
export const WITNESS: Record<string, Spec> = map(mg.witness.data, v => [v.vcpu, v.ramGB, v.maxVms]);
export const OPSNET: Record<string, Record<string, Spec>> = map(mg.opsNetworks.data as Record<string, Record<string, S3>>, t => map(t, spec));
export const SUPERVISOR: Record<string, Spec> = map(mg.supervisor.data, spec);

const ad = addons.tables;
export const ADDON = {
  hcxMgr: spec(ad.hcx.data.manager), hcxIx: spec(ad.hcx.data.interconnect), hcxNe: spec(ad.hcx.data.networkExtension),
  srmLight: spec(ad.liveRecovery.data.siteRecoveryLight), srmStd: spec(ad.liveRecovery.data.siteRecoveryStandard),
  vr: spec(ad.liveRecovery.data.vsphereReplication), vrServer: spec(ad.liveRecovery.data.replicationServer),
  sspCtl: spec(ad.vdefend.data.sspController), sspWorker: spec(ad.vdefend.data.sspWorker), sspInstaller: spec(ad.vdefend.data.sspInstaller),
  ssp: ad.vdefend.data.sspWorkersBySize as Record<string, number>,
  mpsSvm: spec(ad.vdefend.data.malwarePreventionSvm), idsRamGiB: ad.vdefend.data.idsRamGiBPerHost,
  aviCtl: map(ad.avi.data.controller, spec), aviSe: map(ad.avi.data.serviceEngineByVcpu as Record<string, S3>, spec),
  dsm: spec(ad.dataServicesManager.data.provider),
};

// vSAN policy: [capacity factor, label, minimum hosts]
export const POL: Record<string, Record<string, [number, string, number]>> = map(vsan.tables.policies.data as Record<string, Record<string, { capacityFactor: number; label: string; minHosts: number }>>,
  a => map(a, p => [p.capacityFactor, p.label, p.minHosts] as [number, string, number]));

export const DEFAULTS: Settings = defaults.tables.settings.data as Settings;
export const CLUSTER_DEFAULTS: ClusterDefaults = defaults.tables.cluster.data as ClusterDefaults;

// VCF Single Sign-On (VCF 9.1+): Identity Broker modes, identity providers, provisioning methods
export const IDENTITY = {
  modes: identity.tables.modes.data as Record<string, { label: string; use: string }>,
  providers: identity.tables.providers.data as Record<string, { label: string; kind: "federated" | "directory" }>,
  provisioning: identity.tables.provisioning.data as Record<string, { label: string; for: "federated" | "directory" }>,
};

// ESX host networking (VCF 9.1+): switch models, MTU, addressing, and the studio's own defaults
export const NETWORK = {
  vdsModels: network.tables.vdsModels.data as Record<string, { label: string; vds: number; nics: number; storageVds: number }>,
  mtu: network.tables.mtu.data,
  methods: network.tables.addressing.data.methods as Record<string, string>,
  tepPerHost: network.tables.addressing.data.tepPerHost,
  defaults: network.tables.studioDefaults.data,
};

// NSX workload connectivity (VCF 9.1+): models, Tier-0 / transit gateway, peering, edge TEPs, VPC IP blocks
export const NSX = {
  models: nsx.tables.models.data as Record<string, { label: string; edges: "required" | "optional"; use: string }>,
  centralized: nsx.tables.centralized.data,
  distributed: nsx.tables.distributed.data,
  edge: nsx.tables.edgeNodes.data,
};
