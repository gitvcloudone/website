// Built from TypeScript by studio/build.mjs. Edit the .ts source, then run npm run build.
// Field definitions: label, input type, choices, and a one-line "why" for each setting. The Expert view
// renders from these, and the guided steps (3c) will reuse them. No DOM here.
// The "why" texts are the VCF Sizing page's own tips (POLICY_TIPS and the cluster tips), shortened where they were long.
import { DEFAULTS, CLUSTER_DEFAULTS, IDENTITY, PROFILES, VCENTER, NSXMGR, EDGE, SUPERVISOR, POL, VENDORS, NVME_TB, ramOptions } from "../../engine/src/index.js";
                                                                                     

                                                                                 
                        
                                                                                       
                                                                                                    
                                                          
                                                                     
 

const cap = (k        ) => (k === "xlarge" ? "Extra Large" : k[0].toUpperCase() + k.slice(1));
const nf = (n        ) => n.toLocaleString("en-US");
export const STORAGE                         = { esa: "vSAN ESA", nfs: "NFS", fc: "VMFS on Fibre Channel" };

export const POLICY_WHY                         = {
  cpuRatio: "Default 4:1, a common middle ground for general server workloads. VCF design guidance keeps workload domains at or below 8:1; use 2–3:1 for busy or latency-sensitive apps. A group's Peak CPU % overrides it for that group.",
  mgmtRatio: "Default 2:1. VCF design guidance keeps the management domain at or below 2:1 because its appliances are busy. NSX Edges and Avi Service Engines are always 1:1.",
  ramRatio: "Default 1.0 (no overcommit), the safe starting point for production. 1.1–1.25 can suit lightly used dev/test. Tiered clusters always use 1.0.",
  memReserve: "Default 8%: RAM kept for ESX itself. Broadcom estimates ESX overhead at about 6% of installed memory (KB 420935); 8% adds a margin.",
  vsanMem: "Default 32 GB, vSAN ESA's per-host memory use from a VCF 9.1 deployment guide. It grows with devices: use Broadcom's vSAN ReadyNode Sizer for an exact figure.",
  memFill: "Default 90%. A planning assumption: hosts aren't planned to 100% RAM, leaving room for DRS, growth and maintenance. 80–85% gives more headroom.",
  vmOverhead: "Default 3%. ESX's per-VM overhead is typically 1–2% of vRAM; 3% keeps a margin.",
  growth: "Default 0% (today's workload). Growth expected over the term, e.g. 10–20% for 3 years; applied to workload, not management appliances.",
  uplift: "Default 0%. Counts each new core as faster than today's, so fewer are needed. Leave at 0 without benchmark data.",
  activePct: "Default 20%. Used only to check memory tiering: active memory should stay below half of DRAM. Use monitoring data if you have it.",
  storageBasis: "Default Guest used: space used inside the VMs, the usual basis with thin provisioning. Allocated is safer for thick disks or fast-growing data.",
};

const def = (k                ) => (DEFAULTS                                      )[k];

export function projectFields()          {
  return [
    { key: "customer", label: "Customer", type: "text", placeholder: "Customer name" },
    { key: "site", label: "Site / data centre", type: "text", placeholder: "e.g. DC1 and DC2" },
    { key: "version", label: "VCF version", type: "select", choices: [["9.1", "VCF 9.1"], ["9.0", "VCF 9.0"]], def: DEFAULTS.version, why: "Sets which features are available, e.g. vSAN global dedupe and mirrored memory-tier drives need 9.1." },
    { key: "notes", label: "Notes", type: "textarea", placeholder: "Assumptions specific to this design (carried into the export)" },
  ];
}

export function policyFields()          {
  const n = (key                , label        , step        , min         , max         )        => ({ key, label, type: "number", step, min, max, def: def(key), why: POLICY_WHY[key] });
  return [
    n("cpuRatio", "Workload CPU ratio (vCPU : core)", 0.5, 0.5), n("mgmtRatio", "Management CPU ratio (vCPU : core)", 0.5, 1),
    n("ramRatio", "RAM ratio (vRAM : host RAM)", 0.05, 1, 2), n("memReserve", "Host memory reserve (%)", 1, 0, 50),
    n("vsanMem", "vSAN memory per host (GB)", 1, 0, 256), n("memFill", "Memory fill target (%)", 1, 10, 100),
    n("vmOverhead", "VM memory overhead (%)", 1, 0, 30), n("growth", "Growth over the term (%)", 1, 0),
    n("uplift", "New-core speed-up (%)", 5, 0, 200), n("activePct", "Active memory (% of vRAM)", 1, 0, 100),
    { key: "storageBasis", label: "Size storage on", type: "select", choices: [["used", "Guest used"], ["allocated", "Allocated"]], def: DEFAULTS.storageBasis, why: POLICY_WHY.storageBasis },
  ];
}

export function fleetFields(f                 )          {
  return [
    { key: "profile", label: "Deployment model", type: "select", choices: Object.keys(PROFILES).map(k => [k, k]), def: DEFAULTS.profile, why: "Default HA Medium. Sets the size of the fleet management appliances and whether they run highly available (HA models need 4 hosts in the management cluster)." },
    { key: "automation", label: "VCF Automation", type: "bool", def: DEFAULTS.automation, why: "On by default, as in the Fleet Sizing Models. Turn off if the customer won't use self-service; its nodes come off the management footprint." },
    { key: "logs", label: "Log Management (Day 2)", type: "bool", def: DEFAULTS.logs, why: "Off by default. Adds log collection to the management services (an estimate: one extra worker and 500 GB per replica)." },
    { key: "logReplicas", label: "Log replicas", type: "number", min: 1, max: 19, step: 1, on: f.logs, def: DEFAULTS.logReplicas },
    { key: "opsNet", label: "Operations for Networks", type: "select", choices: [["off", "Off"], ["medium", "Medium"], ["large", "Large"], ["xlarge", "Extra Large"]], def: DEFAULTS.opsNet, why: "Off by default. Network visibility and flow analysis; adds platform and collector appliances." },
    { key: "opsNetNodes", label: "Platform nodes", type: "select", choices: [[1, "1"], [3, "3"], [5, "5"]], on: f.opsNet !== "off", def: DEFAULTS.opsNetNodes },
    { key: "opsNetCollectors", label: "Collectors", type: "number", min: 1, max: 20, step: 1, on: f.opsNet !== "off", def: DEFAULTS.opsNetCollectors },
  ];
}

export function addonFields(a                  , seOn          )                                                     {
  const fw = a.vdefend !== "off", atp = a.vdefend === "atp";
  return [
    { title: "vDefend", note: "Separately licensed. Applies to clusters with vDefend ticked. Distributed Firewall adds no appliances; IDS/IPS keeps 2 GB RAM per host; Malware Prevention runs one service VM per host.", fields: [
      { key: "vdefend", label: "vDefend", type: "select", choices: [["off", "Off"], ["fw", "vDefend Firewall"], ["atp", "vDefend Firewall with ATP"]], def: DEFAULTS.vdefend },
      { key: "ids", label: "Distributed IDS/IPS", type: "bool", on: atp, def: DEFAULTS.ids },
      { key: "mps", label: "Malware Prevention", type: "bool", on: atp, def: DEFAULTS.mps },
      { key: "ssp", label: "Security Services Platform", type: "select", on: fw, choices: [["off", "None"], ["medium", "Medium (2 workers)"], ["large", "Large (4 workers)"], ["xlarge", "Extra Large (8 workers)"]], def: DEFAULTS.ssp, why: "One per NSX Manager instance. Large is needed for all ATP features." },
      { key: "gwfw", label: "Gateway Firewall on edges", type: "bool", on: fw, def: DEFAULTS.gwfw },
    ] },
    { title: "VMware Live Recovery", note: "Per instance: Site Recovery, vSphere Replication and a replication server per extra 400 VMs. Licensed per protected VM. Replicas at the recovery site are workload: add them as a group there.", fields: [
      { key: "vlrOn", label: "VMware Live Recovery", type: "bool", def: DEFAULTS.vlrOn },
      { key: "vlrVms", label: "Protected VMs", type: "number", min: 0, max: 5000, step: 50, on: a.vlrOn, def: DEFAULTS.vlrVms },
    ] },
    { title: "Avi Load Balancer", note: "3-node controller cluster per instance. Service Engines are reserved 1:1 and licensed in Service Units (1 per SE vCPU).", fields: [
      { key: "aviOn", label: "Avi Load Balancer", type: "bool", def: DEFAULTS.aviOn },
      { key: "aviCtl", label: "Controller size", type: "select", on: a.aviOn, choices: [["small", "Small (6 vCPU, 32 GB)"], ["medium", "Medium (10 vCPU, 32 GB)"], ["large", "Large (16 vCPU, 48 GB)"]], def: DEFAULTS.aviCtl },
      { key: "aviSe", label: "Service Engines", type: "number", min: 0, max: 200, step: 1, on: a.aviOn, def: DEFAULTS.aviSe },
      { key: "aviSeSize", label: "Service Engine size", type: "select", on: a.aviOn, choices: [[1, "1 vCPU, 2 GB"], [2, "2 vCPU, 4 GB"], [4, "4 vCPU, 8 GB"], [8, "8 vCPU, 16 GB"]], def: DEFAULTS.aviSeSize },
      { key: "aviSeOn", label: "Service Engines run in", type: "select", on: a.aviOn, choices: [["", "First workload cluster"], ...seOn], def: DEFAULTS.aviSeOn },
    ] },
    { title: "HCX", note: "Included in VCF. Per instance: HCX Manager, Interconnect and Network Extension appliances (HA doubles them).", fields: [
      { key: "hcxOn", label: "HCX", type: "bool", def: DEFAULTS.hcxOn },
      { key: "hcxNe", label: "Network Extension appliances", type: "number", min: 0, max: 20, step: 1, on: a.hcxOn, def: DEFAULTS.hcxNe },
      { key: "hcxNeHa", label: "Network Extension HA", type: "bool", on: a.hcxOn, def: DEFAULTS.hcxNeHa },
    ] },
    { title: "Data Services Manager", note: "Provider appliance in the first instance. Databases are workload: add them as a group. Separately licensed.", fields: [
      { key: "dsmOn", label: "Data Services Manager", type: "bool", def: DEFAULTS.dsmOn },
    ] },
  ];
}

export function hostTypeFields(h          )          {
  const f = VENDORS[h.vendor];
  return [
    { key: "name", label: "Name", type: "text" },
    { key: "vendor", label: "CPU", type: "select", choices: Object.entries(VENDORS).map(([k, v]) => [k, v.label]) },
    { key: "sockets", label: "Sockets", type: "select", choices: f.sockets.map(n => [n, String(n)]) },
    { key: "cores", label: "Cores per socket", type: "select", choices: f.cores.map(n => [n, String(n)]) },
    { key: "ramGB", label: "Memory", type: "select", choices: ramOptions(h.vendor, h.sockets).map(o => [o.gb, o.label]), why: "Balanced DIMM configurations only (every memory channel filled the same way), up to vSphere's 24 TB per host." },
    { key: "ht", label: "Hyperthreading", type: "bool" },
    { key: "nvme", label: "NVMe drives", type: "select", choices: Array.from({ length: 25 }, (_, n) => [n, String(n)]), why: "Drives for vSAN ESA and, per cluster, the memory tier." },
    { key: "nvmeTB", label: "NVMe size", type: "select", choices: NVME_TB.map(n => [n, `${n} TB`]) },
  ];
}

export function domainFields()          {
  return [
    { key: "name", label: "Domain name", type: "text" },
    { key: "vcSize", label: "vCenter size", type: "select", choices: Object.entries(VCENTER).map(([k, v]) => [k, `${k === "xlarge" ? "X-Large" : cap(k)} (${nf(v[3])} hosts)`]), def: "medium" },
    { key: "nsx", label: "NSX Manager", type: "select", choices: [["shared", "Shared with management"], ["dedicated", "Dedicated"]], why: "A dedicated NSX Manager isolates this domain's networking (and its upgrades) at the cost of three more appliances in the management domain." },
  ];
}
export function domainNsxFields()          {
  return [
    { key: "nsxSize", label: "NSX size", type: "select", choices: Object.entries(NSXMGR).map(([k, v]) => [k, `${cap(k)} (${nf(v[3])} hosts)`]), def: "large" },
    { key: "nsxNodes", label: "NSX nodes", type: "select", choices: [[3, "3 (HA)"], [1, "1"]], def: 3 },
  ];
}
export const edgeSizes = ()           => Object.entries(EDGE).map(([k, v]) => [k, `${cap(k)} (${v[0]} vCPU, ${v[1]} GB)`]);

/** A cluster's fields, given its host type and the design (mirrors the page's cluster editor). */
export function clusterFields(c         , hw          , d        , maxHosts        , tierMax        )          {
  const vs = c.storage === "esa", st = c.topo === "stretched", fixed = c.fixedHosts > 0, P = POL[c.storage] || POL.esa;
  const dedOk = vs && !st && d.project.version === "9.1";
  const D = CLUSTER_DEFAULTS;
  const out          = [
    { key: "name", label: "Cluster name", type: "text" },
    { key: "hostType", label: "Host type", type: "select", choices: d.hostTypes.map(h => [h.id, h.name]), why: "The server this cluster is built from. Changing a host type updates every cluster that uses it." },
    { key: "storage", label: "Principal storage", type: "select", choices: Object.entries(STORAGE), def: D.storage, why: "vSAN ESA uses the host type's NVMe drives (at least 3 hosts). NFS or Fibre Channel use an external array (at least 2 hosts); the result is the capacity the array must provide." },
    { key: "topo", label: "Topology", type: "select", choices: [["standard", "Single site"], ["stretched", "Stretched (two sites)"]], def: D.topo, why: "Stretched: hosts split across two sites and each site can run everything, so compute doubles. vSAN needs a witness at a third site." },
    { key: "nPlus", label: `Spare hosts (N+#)${st ? " per site" : ""}`, type: "select", choices: [0, 1, 2, 3, 4].map(n => [n, `N+${n}`]), def: D.nPlus, why: "Default N+1, so one host can fail or be in maintenance without overloading the rest. Consider N+2 for large clusters or strict SLAs." },
  ];
  if (vs && !st) out.push({ key: "policy", label: "vSAN policy", type: "select", def: D.policy, why: "Auto follows vSAN ESA Auto-RAID: RAID-5 2+1 at 3–5 hosts, RAID-6 4+2 at 6+. A chosen policy grows the cluster to its minimum hosts.",
    choices: [["auto", "Auto (by host count)"], ...Object.entries(P).map(([k, p]) => [k, `${p[1]} · ${p[2]}+ hosts`, fixed && c.fixedHosts < p[2]]          )] });
  if (vs && st) out.push({ key: "local", label: "Local protection per site", type: "select", def: D.local, why: "Protection inside each site, on top of mirroring between sites; survives a host failure while one site is down.",
    choices: [["auto", "Auto (by hosts per site)"], ["none", "None (site mirroring only)"], ...Object.entries(P).filter(([k]) => k !== "r1f2").map(([k, p]) => [k, `${p[1]} · ${p[2]}+ per site`, fixed && c.fixedHosts / 2 < p[2]]          )] });
  out.push({ key: "comp", label: vs ? "vSAN compression ratio" : "Array data reduction", type: "number", min: 1, max: 8, step: 0.05, def: D.comp,
    why: vs ? "Default 1.25, a conservative planning value; the real ratio depends on the data. Use the customer's measured ratio if known." : "The array's data reduction (compression and dedupe). Leave at the default without the vendor's estimate." });
  if (vs) out.push({ key: "dedupe", label: "Dedupe ratio", type: "number", min: 1, max: 8, step: 0.05, on: dedOk, def: D.dedupe,
    why: dedOk ? "Default 1.0 (none). vSAN ESA global dedupe (VCF 9.1, 3–64 hosts, not stretched); no published typical ratio, so use measured data or stay conservative." : "Needs vSAN ESA on VCF 9.1, not stretched." });
  out.push({ key: "opsRes", label: vs ? "Operations reserve (%)" : "Free-space reserve (%)", type: "number", min: 0, max: 50, step: 1, def: D.opsRes,
    why: vs ? "Default 10%: free space vSAN needs for resyncs, policy changes and rebalancing. Broadcom's ESA formula (KB 326889) usually gives less, so 10% is conservative." : "Free space kept on the array for growth and snapshots." });
  if (vs) out.push({ key: "rebuild", label: `Host rebuild reserve${st ? " (1 per site)" : ""}`, type: "bool", def: D.rebuild, why: "On by default: keeps one host's worth of capacity free so data can be rebuilt after a host failure." });
  out.push(
    { key: "maxHosts", label: "Max hosts", type: "number", min: 2, max: maxHosts, step: 1, why: "The largest this cluster may get; auto workloads past it spill into a new cluster with the same settings. 16–32 is common." },
    { key: "fixedHosts", label: "Fixed hosts (0 = size it)", type: "number", min: 0, max: maxHosts, step: 1, def: D.fixedHosts, why: "Set a host count instead of letting the sizer choose, e.g. for hardware already bought. Checks warn if it's not enough." },
    { key: "auto", label: "Takes auto workloads", type: "bool", why: "Workload groups placed on Auto are spread over these clusters, filling each up to its max hosts in order." },
  );
  if (d.addons.vdefend !== "off") out.push({ key: "vdefend", label: "vDefend", type: "bool", why: "Applies the vDefend add-on to this cluster: appliances per host and vDefend core licences." });
  out.push({ key: "supOn", label: "Supervisor (VKS)", type: "bool", def: D.supOn, why: "vSphere Supervisor for Kubernetes: adds 3 control-plane VMs. Kubernetes clusters themselves are workload: add them as a group." });
  if (c.supOn) out.push({ key: "supSize", label: "Supervisor size", type: "select", def: D.supSize, choices: Object.entries(SUPERVISOR).map(([k, v]) => [k, `${cap(k)} (3 × ${v[0]} vCPU, ${v[1]} GB)`]) });
  out.push({ key: "tierOn", label: "Memory tiering", type: "bool", on: tierMax > 0, def: D.tierOn,
    why: tierMax > 0 ? "NVMe memory tiering (VCF 9): cold pages move to NVMe so each host offers more memory than its DRAM. Best when active memory is well under half of DRAM." : "Needs a spare NVMe drive in the host type (on vSAN ESA at least one stays in vSAN)." });
  if (c.tierOn && tierMax > 0) out.push(
    { key: "tierDrives", label: "Tier drives (of the host's NVMe)", type: "select", def: D.tierDrives, choices: [[1, "1 drive"], [2, "2 drives, mirrored (VCF 9.1)"]].map(([n, l]) => [n, l, (n          ) > tierMax]          ) },
    { key: "tierPct", label: "Tier ratio (% of DRAM)", type: "select", def: D.tierPct, choices: [25, 50, 75, 100, 150, 200, 300, 400].map(n => [n, `${n}%`]), why: "Default 100% (1:1, doubling memory), limited by the drive size and the 4 TB cap." },
  );
  return out;
}

// ---------- identity & access (VCF 9.1+) ----------
export const ACCESS           = [["admin", "Administrator"], ["operator", "Operator"], ["readonly", "Read-only"]];
export function identityFields(x                    )          {
  const kind = x.idp ? IDENTITY.providers[x.idp].kind : "";
  return [
    { key: "mode", label: "Identity Broker mode", type: "select", choices: [["", "Not decided"], ...Object.entries(IDENTITY.modes).map(([k, m]) => [k, m.label]          )],
      why: "Instance mode is Broadcom's recommendation for production: the broker runs as a VCF management service in the management domain. Embedded (inside the management vCenter) is intended for labs and proofs of concept, and can be migrated to instance mode later." },
    { key: "idp", label: "Identity provider", type: "select", choices: [["", "Not chosen"], ...Object.entries(IDENTITY.providers).map(([k, p]) => [k, p.label]          )],
      why: "One identity provider per Identity Broker. Federated providers sign users in with SAML 2.0 or OIDC; a directory (AD over LDAP, OpenLDAP) is read directly." },
    { key: "provisioning", label: "User and group provisioning", type: "select", on: !!kind,
      choices: [["", kind ? "Not chosen" : "Choose the identity provider first"], ...Object.entries(IDENTITY.provisioning).filter(([, p]) => p.for === kind).map(([k, p]) => [k, p.label]          )],
      why: "How users and groups reach VCF. SCIM: the identity provider pushes them. Just-in-time: groups are created at first sign-in. Directory: selected users and groups are synced at intervals; passwords never are." },
  ];
}
export function breakGlassFields()          {
  return [
    { key: "holder", label: "Who holds the break-glass accounts", type: "text", placeholder: "e.g. Infrastructure on-call lead",
      why: "Local administrator accounts still work when the identity provider is down. Name the role or team that holds them." },
    { key: "vault", label: "Where they're kept", type: "text", placeholder: "e.g. the corporate password vault" },
    { key: "rotationDays", label: "Password rotation (days, 0 = not set)", type: "number", min: 0, max: 3650, step: 1, why: "The customer's policy for rotating these passwords. No VCF default is assumed." },
    { key: "notes", label: "Notes", type: "textarea", placeholder: "Access procedure, approvals, audit" },
  ];
}
