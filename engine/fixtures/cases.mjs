// Golden test cases: designs in the shape the page builds them (only non-default fields given;
// engine/baseline/harness.mjs fills defaults exactly as the page's UI does).
// Each case aims at specific engine paths, noted in `covers`.

// Host types
const H1 = { id: "h1", name: "Standard 2×32", vendor: "intel", sockets: 2, cores: 32, ramGB: 1024, nvme: 6, nvmeTB: 7.68 };
const H2 = { id: "h2", name: "Dense AMD 2×64", vendor: "amd", sockets: 2, cores: 64, ramGB: 1536, nvme: 8, nvmeTB: 15.36 };
const H3 = { id: "h3", name: "Small 1×8", vendor: "intel", sockets: 1, cores: 8, ramGB: 256, nvme: 4, nvmeTB: 3.84, ht: false };
const H4 = { id: "h4", name: "Huge 8×144", vendor: "intel", sockets: 8, cores: 144, ramGB: 24576, nvme: 12, nvmeTB: 30.72 };
const H5 = { id: "h5", name: "Diskless 2×24", vendor: "intel", sockets: 2, cores: 24, ramGB: 768, nvme: 0 };
const H6 = { id: "h6", name: "ESA many drives", vendor: "intel", sockets: 1, cores: 16, ramGB: 128, nvme: 24, nvmeTB: 1.92 };

// Clusters as the page adds them: management clusters don't take auto workloads or vDefend, max 16
const mg = (id, o = {}) => ({ id, name: `${id}`, auto: false, vdefend: false, maxHosts: 16, ...o });
const wl = (id, o = {}) => ({ id, name: `${id}`, ...o });
const inst = (id, mgmtClusters, wlds = [], o = {}) => ({ id, name: o.name || `Instance ${id}`, mgmt: { id: `${id}-m`, name: "Management", clusters: mgmtClusters, edges: o.mgmtEdges || [] }, wlds, ...o });
const wld = (id, name, clusters, o = {}) => ({ id, name, nsx: "dedicated", clusters, ...o });
const grp = (name, values, opts, extra = {}) => ({ name, values, opts, ...extra });
const G = (vms, vcpu, vramGiB, usedTiB, allocTiB = usedTiB * 1.5, templTiB = 0) => ({ vms, vcpu, vramGiB, usedTiB, allocTiB, templTiB });

export const CASES = [
  { name: "empty", covers: "no instances, no host types", },
  { name: "no-host-types", covers: "engine falls back to the default host type", topo: [inst("i1", [mg("m1")])] },
  { name: "mgmt-only", covers: "management footprint only (HA Medium)", hostTypes: [H1], topo: [inst("i1", [mg("m1")])] },
  { name: "simple-basic", covers: "Simple model, one WLD with dedicated medium NSX, auto workload",
    settings: { profile: "Simple" }, hostTypes: [H1],
    topo: [inst("i1", [mg("m1")], [wld("w1", "WLD-01", [wl("c1")], { nsxSize: "medium" })])],
    groups: [grp("Apps", G(300, 1200, 4800, 60))] },
  { name: "ha-small-nfs-fc", covers: "HA Small, no VCF Automation, NFS and FC clusters, manual placement, external storage",
    settings: { profile: "HA Small", automation: false }, hostTypes: [H1],
    topo: [inst("i1", [mg("m1", { storage: "nfs" })], [wld("w1", "WLD-01", [wl("c1", { storage: "nfs" }), wl("c2", { storage: "fc", auto: false })], { nsx: "shared" })])],
    groups: [grp("Web", G(200, 600, 1600, 20)), grp("DB", G(20, 320, 2560, 40), { place: "c2" })] },
  { name: "multi-instance", covers: "HA Large fleet, per-instance models, dedicated and shared NSX, vCenter sizes, placement across instances",
    settings: { profile: "HA Large" }, hostTypes: [H1, H2],
    topo: [
      inst("i1", [mg("m1", { hostType: "h2" })], [wld("w1", "WLD-01", [wl("c1", { hostType: "h2" })], { vcSize: "large", nsxSize: "large" }), wld("w2", "WLD-02", [wl("c2")], { nsx: "shared", vcSize: "xlarge" })]),
      inst("i2", [mg("m2")], [wld("w3", "WLD-01", [wl("c3", { auto: false })], { vcSize: "small", nsxSize: "xlarge", nsxNodes: 3 })], { profile: "Simple" }),
      inst("i3", [mg("m3")], [], { profile: "" }),
    ],
    groups: [grp("Core", G(1500, 6000, 24000, 300)), grp("Branch", G(100, 400, 1600, 30), { place: "c3" })] },
  { name: "stretched", covers: "stretched management and workload clusters, site mirroring, witnesses (medium and large)",
    hostTypes: [H1],
    topo: [inst("i1", [mg("m1", { topo: "stretched" })], [wld("w1", "WLD-01", [wl("c1", { topo: "stretched", local: "r5" }), wl("c2", { topo: "stretched", local: "auto", auto: false }), wl("c3", { topo: "stretched", local: "r1f2", auto: false })])])],
    groups: [grp("Stretched apps", G(900, 3600, 14400, 200)), grp("Small", G(50, 100, 400, 10), { place: "c2" }), grp("Mirror", G(30, 60, 200, 5), { place: "c3" })] },
  { name: "vsan-policies-9.1", covers: "each vSAN policy, global dedupe, compression, ops reserve, no rebuild reserve",
    settings: { version: "9.1" }, hostTypes: [H1],
    topo: [inst("i1", [mg("m1")], [wld("w1", "WLD-01", [
      wl("r1", { policy: "r1", auto: false }), wl("r5", { policy: "r5", auto: false, dedupe: 1.5, comp: 1.5 }), wl("r6", { policy: "r6", auto: false, opsRes: 20 }),
      wl("r1f2", { policy: "r1f2", auto: false, rebuild: false }), wl("ded", { dedupe: 2, auto: false, maxHosts: 64 })])])],
    groups: ["r1", "r5", "r6", "r1f2", "ded"].map((c, i) => grp(`On ${c}`, G(40 + i * 10, 160, 640, 80 + i * 40), { place: c })) },
  { name: "vsan-policies-9.0", covers: "dedupe not applied on 9.0 (info), same clusters",
    settings: { version: "9.0" }, hostTypes: [H1],
    topo: [inst("i1", [mg("m1")], [wld("w1", "WLD-01", [wl("r5", { policy: "r5", auto: false, dedupe: 1.5 }), wl("ded", { dedupe: 2 })])])],
    groups: [grp("A", G(40, 160, 640, 120), { place: "r5" }), grp("B", G(100, 400, 1600, 300))] },
  { name: "memory-tiering", covers: "tiering 1 and 2 drives, 400% tier, tier on NFS, no spare drive, 4 TB cap, active memory warning",
    settings: { activePct: 60 }, hostTypes: [H1, H2, H4, { ...H1, id: "h7", name: "One drive", nvme: 1 }],
    topo: [inst("i1", [mg("m1")], [wld("w1", "WLD-01", [
      wl("t1", { hostType: "h2", tierOn: true, tierDrives: 1, tierPct: 100 }), wl("t2", { hostType: "h2", tierOn: true, tierDrives: 2, tierPct: 400, auto: false }),
      wl("t3", { hostType: "h1", storage: "nfs", tierOn: true, tierDrives: 2, tierPct: 50, auto: false }), wl("t4", { hostType: "h7", tierOn: true, auto: false }),
      wl("t5", { hostType: "h4", tierOn: true, tierPct: 400, auto: false })])])],
    groups: [grp("Tiered", G(800, 3200, 25600, 150)), grp("T2", G(100, 400, 6400, 20), { place: "t2" }), grp("T3", G(50, 100, 1600, 10), { place: "t3" }),
      grp("T4", G(20, 40, 320, 5), { place: "t4" }), grp("T5", G(20, 400, 40000, 50), { place: "t5" })] },
  { name: "memory-tiering-9.0", covers: "mirrored tier drives need VCF 9.1 (warning)",
    settings: { version: "9.0" }, hostTypes: [H2],
    topo: [inst("i1", [mg("m1")], [wld("w1", "WLD-01", [wl("t2", { tierOn: true, tierDrives: 2, tierPct: 200 })])])],
    groups: [grp("Tiered", G(300, 1200, 9600, 60))] },
  { name: "vdefend-atp", covers: "vDefend ATP with IDS and Malware Prevention, SSP XL per NSX, Gateway Firewall, VM and bare-metal edges, edge checks",
    settings: { vdefend: "atp", ids: true, mps: true, ssp: "xlarge", gwfw: true }, hostTypes: [H1],
    topo: [inst("i1", [mg("m1")], [
      wld("w1", "WLD-01", [wl("c1"), wl("c2", { vdefend: false, auto: false, fixedHosts: 3 })], { edges: [{ id: "e1", name: "edge-1", nodes: 2, size: "large", on: "c1" }, { id: "e2", name: "edge-2", nodes: 1, size: "small", on: "c1" }, { id: "e3", name: "edge-3", nodes: 4, size: "xlarge", on: "c2" }] }),
      wld("w2", "WLD-02", [wl("c3")], { nsx: "shared", edges: [{ id: "e4", name: "bm-edge", nodes: 2, on: "bm", bmCores: 48 }] }),
    ], { mgmtEdges: [{ id: "e5", name: "mgmt-edge", nodes: 2, size: "medium", on: "m1" }] })],
    groups: [grp("Secure", G(600, 2400, 9600, 120)), grp("Fixed", G(30, 90, 300, 10), { place: "c2" })] },
  { name: "vdefend-fw", covers: "vDefend Firewall, SSP medium, Gateway Firewall on bare metal only, vDefend on management",
    settings: { vdefend: "fw", ssp: "medium", gwfw: true }, hostTypes: [H1],
    topo: [inst("i1", [mg("m1", { vdefend: true })], [wld("w1", "WLD-01", [wl("c1")], { nsx: "shared", edges: [{ id: "e1", name: "bm", nodes: 2, on: "bm" }] })])],
    groups: [grp("Apps", G(200, 800, 3200, 40))] },
  { name: "addons", covers: "HCX with NE HA, VLR standard, Avi on a chosen cluster, DSM, Ops for Networks, Log Management, no Automation, Supervisors, 2 instances",
    settings: { automation: false, logs: true, logReplicas: 2, opsNet: "large", opsNetNodes: 3, opsNetCollectors: 2, hcxOn: true, hcxNe: 3, hcxNeHa: true,
      vlrOn: true, vlrVms: 1500, aviOn: true, aviCtl: "medium", aviSe: 6, aviSeSize: 4, aviSeOn: "c2", dsmOn: true }, hostTypes: [H1],
    topo: [inst("i1", [mg("m1", { supOn: true, supSize: "tiny" })], [wld("w1", "WLD-01", [wl("c1", { supOn: true, supSize: "large" }), wl("c2", { auto: false })])]),
      inst("i2", [mg("m2")], [wld("w2", "WLD-01", [wl("c3")])])],
    groups: [grp("Apps", G(1000, 4000, 16000, 200))] },
  { name: "addons-defaults", covers: "Avi Service Engines on the default cluster, VLR light, Ops for Networks medium, single instance VLR note, unknown sizes fall back",
    settings: { vlrOn: true, vlrVms: 300, aviOn: true, opsNet: "medium", hcxOn: true, hcxNe: 0 }, hostTypes: [H1],
    topo: [inst("i1", [mg("m1", { supOn: true, supSize: "bogus" })], [wld("w1", "WLD-01", [wl("c1")], { vcSize: "bogus", nsxSize: "bogus" })])],
    groups: [grp("Apps", G(100, 400, 1600, 20))] },
  { name: "dr-protection", covers: "Protect to: replica storage only and with failover compute, same-instance note, VLR off info",
    hostTypes: [H1],
    topo: [inst("i1", [mg("m1")], [wld("w1", "WLD-01", [wl("c1"), wl("c1b", { auto: false })])]), inst("i2", [mg("m2")], [wld("w2", "WLD-01", [wl("dr1", { auto: false })])])],
    groups: [grp("Gold", G(200, 800, 3200, 50), { drTo: "dr1", drMode: "full" }), grp("Silver", G(300, 900, 3600, 80), { drTo: "dr1" }),
      grp("Local copy", G(40, 80, 320, 8), { place: "c1b", drTo: "c1" }), grp("Bad target", G(10, 20, 80, 1), { drTo: "nope" })] },
  { name: "dr-protection-vlr", covers: "VLR protected VMs counted from Protect to",
    settings: { vlrOn: true, vlrVms: 5 }, hostTypes: [H1],
    topo: [inst("i1", [mg("m1")], [wld("w1", "WLD-01", [wl("c1")])]), inst("i2", [mg("m2")], [wld("w2", "WLD-01", [wl("dr1", { auto: false })])])],
    groups: [grp("Gold", G(1200, 4800, 19200, 300), { drTo: "dr1", drMode: "full" })] },
  { name: "auto-spill", covers: "auto pool filled in order up to max hosts, extra clusters added, fixed hosts too small, max below minimum",
    hostTypes: [H1],
    topo: [inst("i1", [mg("m1")], [wld("w1", "WLD-01", [wl("a1", { maxHosts: 8 }), wl("a2", { maxHosts: 12, nPlus: 2 }), wl("f1", { auto: false, fixedHosts: 4 }), wl("x1", { auto: false, maxHosts: 2 })])])],
    groups: [grp("Huge", G(12000, 48000, 192000, 2400)), grp("Too big for f1", G(400, 3200, 12800, 100), { place: "f1" }), grp("On x1", G(10, 20, 80, 1), { place: "x1" })] },
  { name: "auto-last-full", covers: "last auto cluster already full with manual placements: auto goes to new clusters only",
    hostTypes: [H1],
    topo: [inst("i1", [mg("m1")], [wld("w1", "WLD-01", [wl("a1", { maxHosts: 6 })])])],
    groups: [grp("Pinned", G(500, 4000, 12000, 50), { place: "a1" }), grp("Auto", G(800, 3200, 12800, 100))] },
  { name: "auto-stretched-spill", covers: "spill with a stretched last target",
    hostTypes: [H1],
    topo: [inst("i1", [mg("m1")], [wld("w1", "WLD-01", [wl("s1", { topo: "stretched", maxHosts: 10 })])])],
    groups: [grp("Auto", G(3000, 12000, 48000, 400))] },
  { name: "no-auto-targets", covers: "no cluster takes auto workloads, instance without management cluster, empty WLD, edge without a cluster",
    hostTypes: [H1],
    topo: [inst("i1", [mg("m1")], [wld("w1", "WLD-01", [wl("c1", { auto: false })]), wld("w2", "WLD-02", [], { edges: [{ id: "e1", name: "orphan", nodes: 2, size: "large", on: "zz" }] })]),
      inst("i2", [], [wld("w3", "WLD-01", [wl("c3", { auto: false })])])],
    groups: [grp("Floating", G(100, 400, 1600, 20))] },
  { name: "policy-knobs", covers: "every sizing policy input, peak CPU / RAM groups, excluded group",
    settings: { cpuRatio: 6, mgmtRatio: 3, ramRatio: 1.3, memReserve: 10, vsanMem: 48, memFill: 85, vmOverhead: 5, growth: 25, uplift: 30, activePct: 35, storageBasis: "allocated" },
    hostTypes: [H1],
    topo: [inst("i1", [mg("m1")], [wld("w1", "WLD-01", [wl("c1"), wl("c2", { tierOn: true })])])],
    groups: [grp("Ratio", G(400, 1600, 6400, 80, 140, 6)), grp("Peaks", G(200, 1600, 6400, 40), { cpuPeak: 35, ramPeak: 55 }), grp("Off", G(999, 9999, 99999, 999), {}, { include: false }),
      grp("Tiered", G(100, 400, 3200, 10), { place: "c2" })] },
  { name: "host-types-mix", covers: "AMD, 16-core licence minimum, no hyperthreading, >960 logical CPUs, ESA ReadyNode RAM rule, no vSAN drives, large VMs",
    hostTypes: [H1, H2, H3, H4, H5, H6],
    topo: [inst("i1", [mg("m1")], [wld("w1", "WLD-01", ["h1", "h2", "h3", "h4", "h5", "h6"].map(h => wl(`on-${h}`, { hostType: h, auto: h === "h1" })))])],
    groups: [
      grp("Big VMs", G(40, 800, 8000, 20), { place: "on-h3" }, { meta: { big: [{ name: "sql01", cpus: 24, memGiB: 512 }, { name: "app02", cpus: 12, memGiB: 200 }, { name: "tiny", cpus: 8, memGiB: 64 }, { name: "monster", cpus: 128, memGiB: 3000 }] } }),
      grp("On AMD", G(100, 800, 4000, 50), { place: "on-h2" }, { meta: { big: [{ name: "hana", cpus: 120, memGiB: 1200 }, { name: "wide", cpus: 80, memGiB: 700 }, { name: "threads", cpus: 200, memGiB: 100 }] } }),
      grp("On huge", G(50, 2000, 40000, 100), { place: "on-h4" }), grp("On diskless", G(20, 40, 160, 5), { place: "on-h5" }),
      grp("On many drives", G(20, 40, 160, 30), { place: "on-h6" }), grp("Auto", G(300, 1200, 4800, 60)),
    ] },
  { name: "scale-limits", covers: "41 workload domains, vCenter and NSX scale, 2,500-host vCenter limit, VMs per host, cluster maximum",
    hostTypes: [H1],
    topo: [inst("i1", [mg("m1")], [
      wld("big", "WLD-BIG", Array.from({ length: 40 }, (_, i) => wl(`b${i}`, { auto: false, fixedHosts: 64 })), { vcSize: "xlarge" }),
      wld("sml", "WLD-SML", Array.from({ length: 6 }, (_, i) => wl(`s${i}`, { auto: false, fixedHosts: 20 })), { nsx: "shared", vcSize: "small" }),
      wld("dense", "WLD-DENSE", [wl("d1", { auto: false, fixedHosts: 3 }), wl("n1", { storage: "nfs", auto: false, maxHosts: 96 })], { nsx: "shared" }),
      ...Array.from({ length: 38 }, (_, i) => wld(`e${i}`, `WLD-E${i}`, [], { nsx: "shared" })),
    ])],
    groups: [grp("Dense", G(4000, 4000, 8000, 10), { place: "d1" }), grp("NFS heavy", G(3000, 40000, 300000, 10), { place: "n1" })] },
  { name: "mgmt-cluster-auto", covers: "management cluster taking auto workloads, Simple on vSAN minimum, stretched NFS management",
    settings: { profile: "Simple" }, hostTypes: [H1],
    topo: [inst("i1", [mg("m1", { auto: true })]), inst("i2", [mg("m2", { storage: "nfs", topo: "stretched" })], [], { profile: "HA Small" })],
    groups: [grp("Apps", G(200, 800, 3200, 40))] },

  // RVTools (fake exports from engine/fixtures/fake-rvtools.mjs)
  { name: "rv-fake-a-by-file", covers: "RVTools: full export, grouped by file",
    hostTypes: [H1, H2], topo: [inst("i1", [mg("m1")], [wld("w1", "WLD-01", [wl("c1"), wl("c2", { hostType: "h2", auto: false })])])],
    rvtools: { files: ["A"] } },
  { name: "rv-fake-all-by-cluster", covers: "RVTools: all fake files incl. broken ones, by cluster, name patterns, powered-off and templates excluded, placement and DR",
    hostTypes: [H1, H2],
    topo: [inst("i1", [mg("m1")], [wld("w1", "WLD-01", [wl("c1"), wl("c2", { hostType: "h2", auto: false })])]), inst("i2", [mg("m2")], [wld("w2", "WLD-01", [wl("dr1", { auto: false })])])],
    rvtools: { files: ["A", "B", "C", "D", "E"], scope: { groupBy: "cluster", patterns: "test-*, *-old, nomatch*", includeOff: false, templatesStorage: false },
      opts: { "vc-a.lab.example / prod-cl02": { place: "c2", drTo: "dr1", drMode: "full" }, "vc-b.lab.example / dr-cl01": { place: "dr1" } } } },
  { name: "rv-fake-ab-allocated", covers: "RVTools: two files with duplicates, vCLS kept, allocated storage, peak CPU on a group",
    settings: { storageBasis: "allocated" }, hostTypes: [H1],
    topo: [inst("i1", [mg("m1")], [wld("w1", "WLD-01", [wl("c1")])])],
    rvtools: { files: ["A", "B"], scope: { exVcls: false }, opts: { "vc-a.lab.example": { cpuPeak: 30 } } },
    groups: [grp("Manual extra", G(10, 40, 160, 2))] },
];

// Real RVTools exports listed in engine/test/private.local.json run through these designs.
export const PRIVATE_DESIGNS = [
  { suffix: "by-file", hostTypes: [H1, H2], topo: [inst("i1", [mg("m1")], [wld("w1", "WLD-01", [wl("c1"), wl("c2", { hostType: "h2" })])])], scope: { groupBy: "file" } },
  { suffix: "by-cluster-allocated", settings: { storageBasis: "allocated", growth: 15 }, hostTypes: [H2], topo: [inst("i1", [mg("m1")], [wld("w1", "WLD-01", [wl("c1", { maxHosts: 16 })])])], scope: { groupBy: "cluster", includeOff: false } },
];
