// Runs a test case through an engine (the legacy page engine or the TypeScript port) the way the
// page does, and returns the outputs as canonical JSON-safe data for golden comparison.
// The glue here mirrors the page's UI code (vcf-sizing/index.html): newCluster/newDomain/addEdge
// defaults, newOpts(), and rebuildRV()'s conversion of RVTools groups.

const newOpts = () => ({ cpuPeak: 0, ramPeak: 0, place: "auto", drTo: "", drMode: "storage" });
const ZERO = { vms: 0, vcpu: 0, vramGiB: 0, usedTiB: 0, allocTiB: 0, templTiB: 0 };

export function buildInputs(api, kase, rvFiles = {}) {
  const S = { ...api.DEFAULTS, customer: "", site: "", notes: "", ...(kase.settings || {}) };
  const hostTypes = (kase.hostTypes || []).map(h => api.fixHw({ ...h }));
  const dom = (d, kind) => ({ vcSize: "medium", nsx: "shared", nsxSize: "large", nsxNodes: 3, ...d, kind,
    clusters: (d.clusters || []).map(c => ({ ...api.CLUSTER_DEFAULTS, hostType: hostTypes[0] ? hostTypes[0].id : "", ...c })),
    edges: (d.edges || []).map(e => ({ nodes: 2, size: "large", on: (d.clusters && d.clusters[0] || {}).id || "bm", bmCores: 32, ...e })) });
  const topo = { instances: (kase.topo || []).map(i => ({ ...i, profile: i.profile || "", mgmt: dom(i.mgmt || { id: i.id + "-m", name: "Management", clusters: [] }, "mgmt"), wlds: (i.wlds || []).map(d => dom(d, "wld")) })) };
  let gid = 1, rv = null;
  const groups = [];
  if (kase.rvtools) {
    const files = kase.rvtools.files.map(name => {
      const f = rvFiles[name]; if (!f) throw new Error(`RVTools file ${name} not available`);
      const rec = { fileName: f.fileName, include: true, status: "Reading…", vms: [] };
      const p = api.parseRVTools(f.vInfo, f.vHost, f.vDisk, f.vPartition, f.fileName, f.vCPU, f.vMemory);
      return Object.assign(rec, p, { status: p.error ? "error" : "ok" });
    });
    const scope = { includeOff: true, templatesStorage: true, exVcls: true, patterns: "", groupBy: "file", ...(kase.rvtools.scope || {}) };
    const b = api.buildGroups(files.filter(f => f.status === "ok"), scope, scope.groupBy);
    for (const x of b.groups) {
      const parsed = { vms: x.vms, vcpu: x.vcpu, vramGiB: x.vramGiB, usedTiB: x.usedTiB, allocTiB: x.allocTiB, templTiB: x.templTiB };
      groups.push({ id: gid++, name: x.key, source: "rvtools", include: true, parsed, values: { ...parsed }, over: new Set(),
        opts: { ...newOpts(), ...((kase.rvtools.opts || {})[x.key] || {}) }, meta: { big: x.big, snap: x.snap, vc: scope.groupBy === "cluster" ? x.key.split(" / ")[0] : x.key } });
    }
    rv = { files, build: b };
  }
  for (const g of kase.groups || []) groups.push({ id: gid++, name: g.name, source: "manual", include: g.include !== false, values: { ...ZERO, ...g.values },
    parsed: null, over: new Set(), opts: { ...newOpts(), ...(g.opts || {}) }, meta: g.meta || null });
  return { S, hostTypes, topo, groups, rv };
}

export function runCase(api, kase, rvFiles) {
  const { S, hostTypes, topo, groups, rv } = buildInputs(api, kase, rvFiles);
  const result = api.size(S, topo, groups, hostTypes);
  return canonical({ rv, result, totals: api.workloadTotals(groups) });
}

// Canonical form: object references to instances, domains and groups become their ids;
// non-finite numbers and regexes become strings; Sets become arrays.
export function canonical(x) {
  return JSON.parse(JSON.stringify(x, function (k, v) {
    if (v && typeof v === "object") {
      if ((k === "inst" || k === "d") && v.id !== undefined) return `#${v.id}`;
      if (k === "g" && v.id !== undefined) return `#g${v.id}`;
      if (k === "domains" && Array.isArray(v)) return v.map(d => `#${d.id}`);
      if (Object.prototype.toString.call(v) === "[object RegExp]") return `/${v.source}/${v.flags}`;
      if (Object.prototype.toString.call(v) === "[object Set]") return [...v];
    }
    if (typeof v === "number" && !Number.isFinite(v)) return `num:${v}`;
    return v;
  }));
}

// Direct checks of the building blocks, over a grid of inputs.
export function units(api) {
  const out = {};
  out.ramOptions = {};
  for (const v of ["intel", "amd", "other"]) for (const s of [1, 2, 4, 8]) out.ramOptions[`${v}-${s}`] = api.ramOptions(v, s);
  const hwIn = [{}, { vendor: "amd", sockets: 4, cores: 30, ramGB: 3000 }, { fam: "AMD EPYC 9654", sockets: 2, cores: 96, ramGB: 1536 },
    { vendor: "intel", sockets: 3, cores: 100, ramGB: 100, nvme: 30.6, nvmeTB: 5, ht: false, name: "x".repeat(80) },
    { dataDrives: 4, dataTB: 3.84, tierDrives: 1, osaDG: 2, name: "" }, { vendor: "intel", sockets: 8, cores: 144, ramGB: 24576, nvme: -2 },
    { vendor: "amd", sockets: 1, cores: 8, ramGB: 128, nvme: 0 }];
  out.fixHw = hwIn.map(h => api.fixHw(h));
  out.defaultHw = api.defaultHw({ id: "h9", cores: 48 });
  out.hwText = out.fixHw.map(h => api.hwText(h));
  out.tierMax = [];
  for (const storage of ["esa", "nfs", "fc"]) for (const nvme of [0, 1, 2, 3, 8]) out.tierMax.push(api.tierMax({ storage }, { nvme }));
  out.localPol = {};
  for (const m of ["none", "auto", "r1", "r5", "r6", "r1f2"]) out.localPol[m] = Array.from({ length: 12 }, (_, n) => api.localPol("esa", m, n));
  const C = api.CLUSTER_DEFAULTS;
  const variants = [{}, { policy: "r1" }, { policy: "r5" }, { policy: "r6" }, { policy: "r1f2" }, { topo: "stretched" }, { topo: "stretched", local: "none" },
    { topo: "stretched", local: "r6" }, { topo: "stretched", local: "r1f2" }, { storage: "nfs" }, { storage: "fc", topo: "stretched" }];
  out.policy = variants.map(o => ({ o, at: [2, 3, 4, 5, 6, 7, 8, 12].map(n => api.isVsan({ ...C, ...o }) ? api.policy({ ...C, ...o }, n) : null), min: api.policyMin({ ...C, ...o }) }));
  out.clusterFloor = [];
  for (const o of variants) for (const prof of Object.keys(api.PROFILES)) for (const mg of [false, true, api.PROFILES["Simple"], api.PROFILES["HA Large"]])
    out.clusterFloor.push(api.clusterFloor({ ...C, ...o }, { ...api.DEFAULTS, profile: prof }, mg));
  out.dedupe = [];
  for (const version of ["9.0", "9.1"]) for (const o of [{}, { topo: "stretched" }, { storage: "nfs" }]) for (const n of [2, 3, 64, 65]) out.dedupe.push(api.dedupeAllowed({ ...C, ...o }, { version }, n));
  out.maxFor = ["esa", "nfs", "fc"].map(storage => api.maxFor({ storage }));
  const s0 = { ...api.DEFAULTS };
  const hw = api.fixHw({ id: "h1" }), hwAmd = api.fixHw({ id: "h2", vendor: "amd", sockets: 2, cores: 96, ramGB: 2304, nvme: 10, nvmeTB: 15.36, ht: false });
  const sets = [s0, { ...s0, vdefend: "atp", mps: true, ids: true, uplift: 25, memReserve: 10, memFill: 80, ramRatio: 1.25 }, { ...s0, vdefend: "fw", mgmtRatio: 3 }];
  const cls = [{ ...C, hw }, { ...C, hw: hwAmd, tierOn: true, tierDrives: 2, tierPct: 400 }, { ...C, hw: hwAmd, storage: "nfs", tierOn: true, tierPct: 50, vdefend: false },
    { ...C, hw, tierOn: true, tierDrives: 3, tierPct: 100 }, { ...C, hw: { ...hw, nvme: 1 }, tierOn: true }];
  out.hostCfg = sets.flatMap(s => cls.map(c => api.hostCfg(c, s)));
  const loads = [{ wvcpu: 0, coresFixed: 0, wram: 0, ramFixed: 0, stor: 0, vms: 0 }, { wvcpu: 4000, coresFixed: 50, wram: 20000, ramFixed: 900, stor: 300, vms: 800 },
    { wvcpu: 100, coresFixed: 0, wram: 200, ramFixed: 0, stor: 2000, vms: 50 }];
  out.sizeCluster = [];
  for (const c of [cls[0], { ...cls[0], topo: "stretched", local: "r5" }, { ...cls[0], policy: "r6", dedupe: 1.5 }, { ...cls[0], fixedHosts: 5 }, cls[2], { ...cls[0], hw: { ...hw, nvme: 0 } }])
    for (const L of loads) for (const mg of [false, api.PROFILES["HA Medium"]]) out.sizeCluster.push(canonical(api.sizeCluster(c, L, s0, mg)));
  out.groupDemand = [{ values: { vms: 10, vcpu: 40, vramGiB: 160, usedTiB: 2, allocTiB: 5, templTiB: 0.5 } }, { values: { vcpu: 40, vramGiB: 160, usedTiB: "3" }, opts: { cpuPeak: 40, ramPeak: 60 } }]
    .flatMap(g => [s0, { ...s0, growth: 20, vmOverhead: 5, storageBasis: "allocated", activePct: 30 }].map(s => api.groupDemand(g, s)));
  out.profName = [[{}, 0], [{ profile: "Simple" }, 0], [{ profile: "Simple" }, 1], [{ profile: "Bogus" }, 1], [{}, 2]].map(([i, ii]) => [api.profName({ ...s0, profile: "HA Small" }, i, ii), api.profName({ ...s0, profile: "Bogus" }, i, ii)]);
  out.excludeRules = canonical(api.excludeRules({ exVcls: true, patterns: " test-*, *-old,, TEST-*, a.b(c)*, *x?y* " }));
  return canonical(out);
}
