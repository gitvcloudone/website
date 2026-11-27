// Saved "Copy settings" files in shapes the page's loader has to cope with: older versions of the
// page, hand edits, and references to things that no longer exist. Each must load into the design
// document exactly as the page's own Load settings loads it.
const cl = (id, o = {}) => ({ id, name: id, ...o });
const G = (name, o = {}) => ({ name, values: { vms: 100, vcpu: 400, vramGiB: 1600, usedTiB: 20, allocTiB: 30, templTiB: 0 }, ...o });

export const SETTINGS_CASES = [
  { name: "empty-object", file: {} },
  { name: "settings-only", file: { v: 1, tool: "vcf", settings: { customer: "Acme", cpuRatio: 3 } } },
  { name: "osa-and-inline-hw", covers: "older page: vSAN OSA clusters and a host spec inside each cluster, no host types",
    file: { v: 1, tool: "vcf", topo: { instances: [{ id: "i1", name: "DC1", mgmt: { id: "d1", name: "Management", clusters: [cl("m1", { storage: "osa", hw: { sockets: 2, cores: 64, ramGB: 2048 } })] },
      wlds: [{ id: "d2", name: "WLD-01", clusters: [cl("c1", { storage: "osa", hw: { cores: 96 } }), cl("c2", { storage: "nfs" })] }] }] }, groups: [G("Apps")] } },
  { name: "unknown-profile-and-keys", covers: "unknown deployment model (fleet and instance), unknown and missing keys, instance without id or name",
    file: { v: 1, tool: "vcf", settings: { profile: "Mega", automation: false, colour: "blue", constructor: 1 }, hostTypes: [{ id: "h1", name: "A" }],
      topo: { instances: [{ id: "i1", mgmt: { id: "d1", clusters: [cl("m1", { hostType: "h1" })] } }, { profile: "Huge", mgmt: { clusters: [cl("m2")] } }] }, groups: [G("Apps")] } },
  { name: "dangling-references", covers: "placement, DR target, Avi cluster and edges pointing at clusters that don't exist, or at a domain",
    file: { v: 1, tool: "vcf", settings: { aviOn: true, aviSeOn: "gone" }, hostTypes: [{ id: "h1", name: "A" }],
      topo: { instances: [{ id: "i1", mgmt: { id: "d1", name: "Management", clusters: [cl("m1", { hostType: "h1", auto: false })] },
        wlds: [{ id: "d2", name: "WLD-01", clusters: [cl("c1", { hostType: "h1" })], edges: [{ id: "e1", name: "a", nodes: 2, size: "large", on: "gone" }, { id: "e2", name: "b", nodes: 2, on: "bm" }, { id: "e3", name: "c", nodes: 2, size: "medium", on: "d1" }] }] }] },
      groups: [G("To nowhere", { opts: { place: "gone", drTo: "also-gone" } }), G("To a domain", { opts: { place: "d2" } }), G("Fine", { opts: { place: "c1" } })] } },
  { name: "duplicate-ids", covers: "two clusters with one id, an instance id equal to a cluster id, two host types with one id, a missing host type",
    file: { v: 1, tool: "vcf", hostTypes: [{ id: "h1", name: "First", cores: 32 }, { id: "h1", name: "Second", cores: 64 }, { id: "h2", name: "Third", vendor: "amd", cores: 96 }],
      topo: { instances: [{ id: "c1", mgmt: { id: "d1", name: "Management", clusters: [cl("m1", { hostType: "h1" })] },
        wlds: [{ id: "d2", name: "WLD-01", clusters: [cl("c1", { hostType: "h2" }), cl("c1", { hostType: "h9", auto: false })] }] }] },
      groups: [G("On c1", { opts: { place: "c1" } }), G("Auto")] } },
  { name: "browser-host-types", covers: "file with an empty host types list: the browser's saved host types are used",
    browserHostTypes: [{ id: "h7", name: "Saved one", cores: 48, ramGB: 1536 }, { name: "Saved two", vendor: "amd", cores: 128 }],
    file: { v: 1, tool: "vcf", hostTypes: [], topo: { instances: [{ id: "i1", mgmt: { id: "d1", name: "Management", clusters: [cl("m1", { hostType: "h1" })] }, wlds: [{ id: "d2", name: "W", clusters: [cl("c1")] }] }] }, groups: [G("Apps")] } },
  { name: "no-host-types-anywhere", covers: "clusters but no host types in the file or the browser: one default host type",
    file: { v: 1, tool: "vcf", topo: { instances: [{ id: "i1", mgmt: { id: "d1", name: "Management", clusters: [cl("m1")] } }] } } },
  { name: "legacy-host-fields", covers: "older host-type fields: fam, dataDrives/dataTB, OSA disk groups, off-catalogue values",
    file: { v: 1, tool: "vcf", hostTypes: [{ id: "h1", name: "Old AMD", fam: "AMD EPYC 9004", sockets: 2, cores: 60, ramGB: 1000, dataDrives: 10, dataTB: 3.84, osaDG: 2, osaCapTB: 7.68, tierDrives: 1 }],
      topo: { instances: [{ id: "i1", mgmt: { id: "d1", name: "Management", clusters: [cl("m1", { hostType: "h1" })] }, wlds: [{ id: "d2", name: "W", clusters: [cl("c1", { hostType: "h1" })] }] }] }, groups: [G("Apps")] } },
  { name: "string-numbers", covers: "numbers saved as text are kept as the page keeps them",
    file: { v: 1, tool: "vcf", settings: { cpuRatio: "5", growth: "10", memFill: "85" }, hostTypes: [{ id: "h1", name: "A" }],
      topo: { instances: [{ id: "i1", mgmt: { id: "d1", name: "Management", clusters: [cl("m1", { hostType: "h1" })] }, wlds: [{ id: "d2", name: "W", clusters: [cl("c1", { hostType: "h1", nPlus: 2 })] }] }] }, groups: [G("Apps")] } },
  { name: "missing-mgmt-and-fields", covers: "instance without a management domain, domain without clusters or edges, groups without values or options",
    file: { v: 1, tool: "vcf", hostTypes: [{ id: "h1", name: "A" }], topo: { instances: [{ id: "i1", wlds: [{ id: "d2", name: "W", clusters: [cl("c1")] }, { id: "d3" }] }] },
      groups: [{ name: "Bare" }, { name: "Off", include: false, values: { vcpu: 9999 } }, G("RV", { source: "rvtools", meta: { big: [{ name: "x", cpus: 200, memGiB: 50 }] } })] } },
];
