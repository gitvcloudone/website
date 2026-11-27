// Built from TypeScript by studio/build.mjs. Edit the .ts source, then run npm run build.
// The whole fleet: management and add-on load per cluster, workload placement (manual and auto),
// cluster sizing, witnesses, licensing, large-VM fit and checks.
import { TIB, PROFILES, VCENTER, NSXMGR, EDGE, WITNESS, OPSNET, SUPERVISOR, ADDON, HOST_LCPU_MAX } from "./knowledge.js";
import { defaultHw } from "./hardware.js";
import { isVsan, maxFor, profName, sizeCluster, dedupeAllowed } from "./cluster.js";
                                                
                                                                                                                                                          

export const zeroLoad = ()       => ({ wvcpu: 0, coresFixed: 0, wram: 0, ramFixed: 0, stor: 0, vms: 0, vcpu: 0, vramGiB: 0, activeGiB: 0 });
export const addLoad = (a      , b               , f = 1)       => { for (const k of Object.keys(a)                  ) a[k] += (b[k] || 0) * f; return a; };

export function workloadTotals(groups         ) {
  const t = { vms: 0, vcpu: 0, vramGiB: 0, usedTiB: 0, allocTiB: 0, templTiB: 0 };
  for (const g of groups) { if (!g.include) continue; for (const k of Object.keys(t)                      ) t[k] += Number(g.values[k]) || 0; }
  return t;
}

export function groupDemand(g                                , s          )       {
  const gr = 1 + s.growth / 100, v = g.values, o = g.opts || {};
  const vcpu = (Number(v.vcpu) || 0) * gr, vram = (Number(v.vramGiB) || 0) * (1 + s.vmOverhead / 100) * gr;
  const L = zeroLoad();
  if ((o.cpuPeak          ) > 0) L.coresFixed = vcpu * ((o.cpuPeak          ) / 100) / 0.8; else L.wvcpu = vcpu;
  if ((o.ramPeak          ) > 0) L.ramFixed = vram * ((o.ramPeak          ) / 100); else L.wram = vram;
  L.stor = ((s.storageBasis === "allocated" ? Number(v.allocTiB) : Number(v.usedTiB)) || 0) * gr + (Number(v.templTiB) || 0);
  L.vms = (Number(v.vms) || 0) * gr; L.vcpu = vcpu; L.vramGiB = vram; L.activeGiB = vram * s.activePct / 100;
  return L;
}

                                                                                                                                                          

/** Walk the topology: instances → management domain + workload domains → clusters */
export function flatten(topo          )           {
  const out           = [];
  topo.instances.forEach((inst, ii) => {
    [inst.mgmt, ...inst.wlds].forEach((d, di) => d.clusters.forEach((c, ci) => out.push({ c, inst, ii, d, di, ci, mgmtDefault: di === 0 && ci === 0 ? (PROFILES[inst._prof          ] || true) : false })));
  });
  return out;
}

                                                                                                    
                                                                                          
                                                                             
                                                                                  
                                                                                                                                                     

export function size(s          , topo          , groups         , hostTypes            ) {
  topo.instances.forEach((inst, ii) => { inst._prof = profName(s, inst, ii); });
  const prof = PROFILES[topo.instances[0] ? topo.instances[0]._prof           : s.profile] || PROFILES["HA Medium"];
  const profOf = (inst          )          => PROFILES[inst._prof          ] || prof;
  const types = (hostTypes && hostTypes.length ? hostTypes : [defaultHw({ id: "h0" })]);
  const flat                         = flatten(topo).map(x => ({ ...x, c: { ...x.c, hw: types.find(t => t.id === x.c.hostType) || types[0] } }));
  const byId = new Map(flat.map(x => [x.c.id, x]));
  const loads = new Map                        (flat.map(x => [x.c.id, { fixed: zeroLoad(), items: [], groups: [] }]));
  const warnings            = [];
  const bom = { bmEdges: []                                                                    , witnesses: []                                                    };
  const mgmtCl = (inst          )                      => inst.mgmt.clusters[0];
  const item = (cl                            , name        , spec          , n = 1, cat = "mgmt", ratio = s.mgmtRatio) => {
    if (!cl || n <= 0) return;
    const L = loads.get(cl.id) .fixed, vc = spec[0] * n, rm = spec[1] * n, dk = spec[2] * n;
    L.coresFixed += vc / ratio; L.ramFixed += rm; L.stor += dk * 1e9 / TIB;
    loads.get(cl.id) .items.push({ name: n > 1 && !/×/.test(name) ? `${name} × ${n}` : name, vcpu: vc, ram: rm, disk: dk, cat, ratio });
  };

  const drVmsPre = groups.filter(g => g.include && g.opts && g.opts.drTo && byId.has(g.opts.drTo)).reduce((a, g) => a + (Number(g.values.vms) || 0), 0);
  const vlrN = drVmsPre > 0 ? drVmsPre : s.vlrVms;
  // fleet + instance management (VCF 9.1 fleet sizing models)
  topo.instances.forEach((inst, ii) => {
    const cl = mgmtCl(inst); if (!cl) { warnings.push({ lvl: "crit", t: `${inst.name}: add a cluster to the management domain. It runs the VCF management appliances, so the instance isn't sized until it has one.` }); return; }
    if (ii === 0) {
      const a = prof.auto;
      item(cl, `VCF management, first instance (${s.profile}${s.automation ? "" : ", without VCF Automation"})`,
        [prof.first[0] - (s.automation ? 0 : a[1]), prof.first[1] - (s.automation ? 0 : a[2]), prof.first[2] - (s.automation ? 0 : a[3])]);
      if (s.logs) {
        const [w, wv, wr] = prof.workers, [lv, lr] = prof.logW;
        item(cl, `Log Management (Day 2): ${w} management-services workers resized to ${lv} vCPU / ${lr} GB, + 1 worker`, [w * (lv - wv) + lv, w * (lr - wr) + lr, 500 * Math.max(1, s.logReplicas)]);
      }
      if (s.opsNet !== "off") {
        item(cl, `VCF Operations for Networks platform (${s.opsNet})`, OPSNET.platform[s.opsNet], Math.max(1, s.opsNetNodes));
        item(cl, `VCF Operations for Networks collector (${s.opsNet})`, OPSNET.collector[s.opsNet], Math.max(1, s.opsNetCollectors));
      }
    } else item(cl, `VCF management, additional instance (${inst._prof})`, profOf(inst).add);
    inst.wlds.forEach(d => {
      const v = VCENTER[d.vcSize] || VCENTER.medium;
      item(cl, `${d.name}: vCenter (${d.vcSize})`, v);
      if (d.nsx === "dedicated") item(cl, `${d.name}: NSX Manager (${d.nsxSize})`, NSXMGR[d.nsxSize] || NSXMGR.large, d.nsxNodes || 3);
    });
    if (s.hcxOn) {
      item(cl, "HCX Manager", ADDON.hcxMgr, 1, "addon");
      item(cl, "HCX Interconnect (IX)", ADDON.hcxIx, 1, "addon");
      item(cl, `HCX Network Extension${s.hcxNeHa ? " (HA pairs)" : ""}`, ADDON.hcxNe, Math.max(0, Math.round(s.hcxNe)) * (s.hcxNeHa ? 2 : 1), "addon");
    }
    if (s.vlrOn) {
      const n = Math.max(0, vlrN);
      item(cl, `VMware Live Recovery: Site Recovery (${n >= 1000 ? "standard" : "light"})`, n >= 1000 ? ADDON.srmStd : ADDON.srmLight, 1, "addon");
      item(cl, "VMware Live Recovery: vSphere Replication", ADDON.vr, 1, "addon");
      item(cl, "Additional vSphere Replication servers", ADDON.vrServer, Math.min(9, Math.max(0, Math.ceil(n / 400) - 1)), "addon");
    }
    if (s.aviOn) item(cl, `Avi Controller (${s.aviCtl})`, ADDON.aviCtl[s.aviCtl] || ADDON.aviCtl.small, 3, "addon");
    if (s.dsmOn && ii === 0) item(cl, "Data Services Manager provider", ADDON.dsm, 1, "addon");
  });

  // NSX instances (for SSP and NSX scale checks): the management NSX of each instance + dedicated ones
  const nsxSets           = [];
  topo.instances.forEach(inst => {
    const shared = { name: `${inst.name} management NSX`, size: profOf(inst).nsx[1], inst, domains: [inst.mgmt, ...inst.wlds.filter(d => d.nsx !== "dedicated")] };
    nsxSets.push(shared);
    inst.wlds.filter(d => d.nsx === "dedicated").forEach(d => nsxSets.push({ name: `${d.name} NSX`, size: d.nsxSize, inst, domains: [d] }));
  });
  if (s.vdefend !== "off" && s.ssp !== "off") {
    for (const n of nsxSets) {
      const prot = n.domains.some(d => d.clusters.some(c => c.vdefend));
      if (!prot) continue;
      const cl = mgmtCl(n.inst), w = ADDON.ssp[s.ssp] || 4;
      item(cl, `Security Services Platform for ${n.name} (${s.ssp}: installer)`, ADDON.sspInstaller, 1, "addon");
      item(cl, `SSP controller nodes`, ADDON.sspCtl, 3, "addon");
      item(cl, `SSP worker nodes (${w} + 1 reserved)`, ADDON.sspWorker, w + 1, "addon");
    }
  }

  // NSX Edges
  for (const inst of topo.instances) for (const d of [inst.mgmt, ...inst.wlds]) for (const e of (d.edges || [])) {
    const sz = EDGE[e.size] || EDGE.large, n = Math.max(0, Math.round(e.nodes));
    if (e.on === "bm") { bom.bmEdges.push({ domain: d.name, name: e.name, nodes: n, cores: e.bmCores || 32 }); continue; }
    const cl = d.clusters.find(c => c.id === e.on) || d.clusters[0];
    if (!cl) { warnings.push({ lvl: "crit", t: `${d.name}: edge cluster ${e.name} has no vSphere cluster to run on.` }); continue; }
    item(cl, `${d.name}: NSX Edge ${e.name} (${e.size})`, sz, n, "edge", 1);
    e._cl = cl.id;
  }
  for (const x of flat) if (x.c.supOn) item(x.c, `Supervisor control plane (${x.c.supSize}) on ${x.c.name}`, SUPERVISOR[x.c.supSize] || SUPERVISOR.small, 3, "addon");
  if (s.aviOn) {
    const i0 = topo.instances[0], fallback = i0 ? ((i0.wlds.find(d => d.clusters.length) || {}                   ).clusters || [])[0] || mgmtCl(i0) : null;
    const cl = byId.has(s.aviSeOn) ? byId.get(s.aviSeOn) .c : fallback;
    item(cl, `Avi Service Engines (${s.aviSeSize} vCPU)`, ADDON.aviSe[s.aviSeSize] || ADDON.aviSe[2], Math.max(0, Math.round(s.aviSe)), "addon", 1);
  }

  // workload groups: manual placement or the auto pool
  const pool = zeroLoad(); const autoGroups          = [];
  let drVms = 0; const drNotes           = [];
  for (const g of groups) {
    if (!g.include) continue;
    const L = groupDemand(g, s), place = g.opts && g.opts.place;
    const dr = g.opts && g.opts.drTo;
    if (dr && loads.has(dr)) {
      const full = g.opts .drMode === "full", R = full ? { ...L } : { ...zeroLoad(), stor: L.stor };
      addLoad(loads.get(dr) .fixed, R); loads.get(dr) .groups.push({ g, f: 1, dr: true, full });
      drVms += Number(g.values.vms) || 0;
      if (place && place !== "auto" && loads.has(place) && byId.get(place) .ii === byId.get(dr) .ii) drNotes.push(g.name);
    }
    if (place && place !== "auto" && loads.has(place)) { addLoad(loads.get(place) .fixed, L); loads.get(place) .groups.push({ g, f: 1 }); }
    else { addLoad(pool, L); autoGroups.push(g); }
  }

  // auto targets, filled in order up to each cluster's max hosts; past the last, clusters with its spec are added
  let targets = flat.filter(x => x.c.auto);
  const poolAny = pool.wvcpu + pool.coresFixed + pool.wram + pool.ramFixed + pool.stor > 0;
  if (poolAny && !targets.length) {
    const fb = flat.find(x => x.di > 0) || flat[0];
    if (fb) { targets = [fb]; warnings.push({ lvl: "warn", t: `No cluster takes auto-placed workloads, so they were put in ${fb.c.name}. Tick "Takes auto workloads" on the clusters that should.` }); }
  }
  const clones                         = [];
  const userLimit = (c         ) => c.fixedHosts > 0 ? c.fixedHosts : Math.min(c.maxHosts || maxFor(c), maxFor(c));
  // a max below the cluster's own minimum (storage, policy, stretched, N+#) can never be met: the minimum wins
  const minOf = (c              , mg             ) => sizeCluster({ ...c, fixedHosts: 0 }, addLoad(zeroLoad(), pool, 1e-9), s, mg).need;   // smallest cluster that holds any workload at all
  const limitOf = (c              , mg              ) => c.fixedHosts > 0 ? c.fixedHosts : Math.max(userLimit(c), minOf(c, mg || false));
  const fits = (x                      , frac        ) => { const L = addLoad(addLoad(zeroLoad(), loads.get(x.c.id) .fixed), pool, frac); return sizeCluster({ ...x.c, fixedHosts: 0 }, L, s, x.mgmtDefault).need <= limitOf(x.c, x.mgmtDefault); };
  let rem = 1;
  if (poolAny && targets.length) {
    for (let i = 0; i < targets.length - 1 && rem > 1e-9; i++) {
      const x = targets[i];
      let lo = 0, hi = rem;
      if (fits(x, hi)) lo = hi; else for (let it = 0; it < 40; it++) { const m = (lo + hi) / 2; if (fits(x, m)) lo = m; else hi = m; }
      if (lo > 0) { addLoad(loads.get(x.c.id) .fixed, pool, lo); loads.get(x.c.id) .groups.push(...autoGroups.map(g => ({ g, f: lo, auto: true }))); x.autoShare = lo; rem -= lo; }
    }
    const last = targets[targets.length - 1];
    if (rem > 1e-9) {
      // last target plus k clones share what's left evenly
      // if the last target is already full with what's placed there by hand, the auto workload goes to new clusters only
      const lastTakes = fits(last, 0);
      let k = lastTakes ? 0 : 1;
      const split = (k        ) => lastTakes ? rem / (k + 1) : rem / k;
      const lastFits = (k        ) => {
        const share = split(k);
        const okLast = !lastTakes || fits(last, share);
        const okClone = k === 0 || sizeCluster({ ...last.c, fixedHosts: 0 }, addLoad(zeroLoad(), pool, share), s, false).need <= limitOf({ ...last.c, fixedHosts: 0 });
        return okLast && okClone;
      };
      while (!lastFits(k) && k < 200) k++;
      const share = split(k), lastShare = lastTakes ? share : 0;
      if (lastShare > 0) { addLoad(loads.get(last.c.id) .fixed, pool, lastShare); loads.get(last.c.id) .groups.push(...autoGroups.map(g => ({ g, f: lastShare, auto: true }))); }
      last.autoShare = lastShare;
      for (let j = 0; j < k; j++) {
        const nc = { ...last.c, id: `${last.c.id}+${j + 2}`, name: `${last.c.name}-${String(j + 2).padStart(2, "0")}`, clone: true, fixedHosts: 0 };
        const x = { c: nc, inst: last.inst, ii: last.ii, d: last.d, di: last.di, ci: last.ci + j + 1, mgmtDefault: false         , autoShare: share };
        loads.set(nc.id, { fixed: addLoad(zeroLoad(), pool, share), items: [], groups: autoGroups.map(g => ({ g, f: share, auto: true })) });
        clones.push(x);
      }
      if (k >= 200) warnings.push({ lvl: "crit", t: "The auto-placed workload needs more than 200 extra clusters. Check the workload totals and the cluster max hosts." });
    }
  }
  // place clones right after their source cluster
  const all                         = [];
  for (const x of flat) { all.push(x); for (const y of clones.filter(y => y.c.id.startsWith(x.c.id + "+"))) all.push(y); }

  // size every cluster
  const clusters                  = all.map(x => {
    const ld = loads.get(x.c.id) ;
    const r = sizeCluster(x.c, ld.fixed, s, x.mgmtDefault);
    return { ...x, ...r, load: ld.fixed, items: ld.items, groups: ld.groups, max: limitOf(x.c, x.mgmtDefault), maxRaised: !x.c.fixedHosts && limitOf(x.c, x.mgmtDefault) > userLimit(x.c) ? userLimit(x.c) : 0 };
  });

  // witnesses for stretched vSAN clusters
  for (const c of clusters) if (c.c.topo === "stretched" && isVsan(c.c)) {
    const sz = c.load.vms > 500 ? "large" : "medium";
    bom.witnesses.push({ cluster: c.c.name, size: sz, spec: WITNESS[sz] });
  }

  // ---------- totals and licensing ----------
  const sum = (f                              ) => clusters.reduce((a, c) => a + f(c), 0);
  const hosts = sum(c => c.total), cores = sum(c => c.total * c.h.cores), licCores = sum(c => c.total * c.h.licCores);
  const rawVsan = sum(c => isVsan(c.c) ? c.h.rawTiB * c.total : 0);
  const addOnTiB = Math.max(0, Math.ceil(rawVsan - licCores - 1e-9));
  const edgeVcpu = clusters.reduce((a, c) => a + c.items.filter(i => i.cat === "edge").reduce((b, i) => b + i.vcpu, 0), 0);
  const bmEdgeCores = bom.bmEdges.reduce((a, e) => a + e.nodes * e.cores, 0);
  const lic = {
    physCores: cores, licCores, rawVsan, entitled: licCores, addOnTiB,
    vdefendCores: s.vdefend !== "off" ? sum(c => c.c.vdefend ? c.total * c.h.licCores : 0) : 0,
    gwfwCores: s.vdefend !== "off" && s.gwfw ? edgeVcpu + bmEdgeCores : 0,
    aviSU: s.aviOn ? Math.max(0, Math.round(s.aviSe)) * (s.aviSeSize || 2) : 0,
    vlrVms: s.vlrOn ? (drVms > 0 ? Math.round(drVms) : s.vlrVms) : 0, drVms: Math.round(drVms),
  };
  const T = workloadTotals(groups);
  const D = { vcpu: sum(c => c.load.vcpu), vram: sum(c => c.load.vramGiB), stor: sum(c => c.stor), vms: sum(c => c.load.vms),
    mgmtVcpu: sum(c => c.items.reduce((a, i) => a + i.vcpu, 0)), mgmtRam: sum(c => c.items.reduce((a, i) => a + i.ram, 0)) };
  const extTiB = sum(c => c.extTiB);
  const lim                         = {}; for (const c of clusters) lim[c.limiter] = (lim[c.limiter] || 0) + c.total;
  const limiter = Object.entries(lim).sort((a, b) => b[1] - a[1])[0];

  if (drNotes.length) warnings.push({ lvl: "warn", t: `${drNotes.join(", ")}: protected to a cluster in the same instance as the VMs. A DR copy usually goes to another instance or site.` });
  if (drVms > 0 && !s.vlrOn) warnings.push({ lvl: "info", t: `${Math.round(drVms)} VMs are protected to a recovery cluster. Turn on VMware Live Recovery to add its appliances and licences.` });
  const r = { clusters, hosts, cores, licCores, lic, bom, D, T, extTiB, nsxSets, types, drVms, limiter: limiter ? limiter[0] : "–", warnings, prof,
    domains: topo.instances.reduce((a, i) => a + 1 + i.wlds.length, 0), instances: topo.instances.length, fit: []              };
  r.fit = largeVms(clusters, groups);
  checks(r, s, topo);
  return r;
}
                                                   

                                                                                                                                                                                                          

/** VMs that won't fit one host of the cluster(s) they land in */
export function largeVms(clusters                 , groups         )            {
  const out            = [];
  const where = new Map                         ();
  for (const c of clusters) for (const gg of c.groups) { if (gg.dr && !gg.full) continue; if (!where.has(gg.g.id)) where.set(gg.g.id, []); where.get(gg.g.id) .push(c); }
  for (const g of groups) {
    if (!g.include || !g.meta || !g.meta.big) continue;
    const cls = where.get(g.id) || [];
    for (const v of g.meta.big) {
      let worst                                                             = null;
      for (const c of cls) {
        const h = c.h, perSocketRam = h.dram / h.sockets;
        const lvl = (v.cpus > h.threads || v.memGiB > h.ramUsable) ? "crit" : v.cpus > h.cores ? "warn" : (v.cpus > h.coresPerSocket || v.memGiB > perSocketRam) ? "info" : null;
        const rank = { crit: 3, warn: 2, info: 1 };
        if (lvl && (!worst || rank[lvl] > rank[worst.lvl])) worst = { lvl, cluster: c.c.name, cores: h.cores, threads: h.threads, cps: h.coresPerSocket, ramCap: h.ramUsable, sockRam: perSocketRam };
      }
      if (worst) out.push({ name: v.name, group: g.name, cpus: v.cpus, memGiB: v.memGiB, ...worst });
    }
  }
  const order = { crit: 0, warn: 1, info: 2 };
  return out.sort((a, b) => (order[a.lvl] - order[b.lvl]) || b.memGiB - a.memGiB);
}

export function checks(r              , s          , topo          )       {
  const w = r.warnings, nf = (n        ) => Math.round(n).toLocaleString("en-US"), esaSeen = new Set        (), lic16 = new Set        ();
  for (const c of r.clusters) {
    const nm = `${c.d.name} / ${c.c.name}`;
    if (c.maxRaised && !c.c.clone) w.push({ lvl: "warn", t: `${nm}: max hosts ${c.maxRaised} is below this cluster's minimum of ${c.max} (storage, policy, topology and spares), so ${c.max} is used. Raise the max.` });
    if (c.short) w.push({ lvl: "crit", t: `${nm}: set to ${c.fixed} hosts but needs ${c.need} (${c.limiter}).` });
    else if (c.need > c.max) w.push({ lvl: "crit", t: `${nm}: needs ${c.need} hosts, above its max of ${c.max}. Move workloads placed here to Auto or another cluster, or raise the max.` });
    else if (c.need > maxFor(c.c)) w.push({ lvl: "crit", t: `${nm}: ${c.need} hosts is above the ${isVsan(c.c) ? "vSAN" : "vSphere"} cluster maximum of ${maxFor(c.c)}.` });
    if (isVsan(c.c) && c.c.topo !== "stretched" && c.total - 1 < c.pol .min) w.push({ lvl: "warn", t: `${nm}: ${c.pol .label} needs ${c.pol .min} hosts and the cluster has ${c.total}, so with a host in maintenance or failed, vSAN can't rebuild to full protection. Add a host for that.` });
    if (c.c.dedupe > 1 && isVsan(c.c) && !dedupeAllowed(c.c, s, c.total)) w.push({ lvl: "info", t: `${nm}: deduplication not applied: global dedupe needs vSAN ESA, VCF 9.1, 3–64 hosts and no stretched cluster.` });
    const vmh = c.total ? c.load.vms / c.total : 0, vmMax = c.c.storage === "esa" ? 500 : 1024;
    if (vmh > vmMax) w.push({ lvl: "warn", t: `${nm}: ${nf(vmh)} VMs per host, above the ${vmMax} per host ${isVsan(c.c) ? "vSAN " + c.c.storage.toUpperCase() : "vSphere"} supports. Add hosts.` });
    if (c.h.tiering && c.load.activeGiB > 0.5 * c.total * c.h.dram) w.push({ lvl: "warn", t: `${nm}: active memory (${s.activePct}% of vRAM) is above half of DRAM, so memory tiering will slow VMs. Lower the tier ratio or add DRAM.` });
    if (isVsan(c.c)) {
      const hw = c.c.hw, minRam = Math.max(128, Math.ceil(128 + Math.max(0, c.h.vsanNvme - 12) * 32 / 3));
      const short = [hw.sockets * hw.cores < 16 && "at least 16 cores", hw.ramGB < minRam && `at least ${minRam} GB RAM for ${c.h.vsanNvme} vSAN drives`].filter(Boolean);
      if (short.length && !esaSeen.has(hw.id)) { esaSeen.add(hw.id); w.push({ lvl: "warn", t: `Host type ${hw.name}: vSAN ESA ReadyNodes need ${short.join(" and ")} (ESA ReadyNode hardware guidance).` }); }
    }
    if (c.noStorage) w.push({ lvl: "crit", t: `${nm}: host type ${c.c.hw.name} leaves no vSAN capacity drives${c.h.tierDrives ? " after the memory tier" : ""}, so the cluster can't hold its storage.` });
    if (c.h.threads > HOST_LCPU_MAX) w.push({ lvl: "warn", t: `${nm}: host type ${c.c.hw.name} has ${c.h.threads} logical CPUs, above the ${HOST_LCPU_MAX} per host vSphere supports. Turn hyperthreading off or use fewer cores.` });
    if (c.c.tierOn && !c.h.tierDrives) w.push({ lvl: "warn", t: `${nm}: memory tiering is on, but host type ${c.c.hw.name} has no NVMe drive to spare for it${c.c.storage === "esa" ? " (vSAN ESA keeps at least one)" : ""}.` });
    if (c.h.tierShort) w.push({ lvl: "info", t: `${nm}: the memory-tier drive holds less than ${c.c.tierPct}% of DRAM (4 TB partition cap or drive size), so the tier is smaller.` });
    if (c.h.tierDrives === 2 && s.version !== "9.1") w.push({ lvl: "warn", t: `${nm}: mirrored memory-tier drives need VCF 9.1.` });
    if (c.h.coresPerSocket < 16 && !lic16.has(c.c.hw.id)) { lic16.add(c.c.hw.id); w.push({ lvl: "info", t: `Host type ${c.c.hw.name}: ${c.h.coresPerSocket}-core CPUs are licensed as 16 cores each (16-core minimum per CPU).` }); }
  }
  // edges: anti-affinity needs as many hosts as edge nodes
  for (const inst of topo.instances) for (const d of [inst.mgmt, ...inst.wlds]) for (const e of (d.edges || [])) {
    if (e.nodes < 2) w.push({ lvl: "warn", t: `${d.name}: edge cluster ${e.name} has ${e.nodes} node. Use at least 2 for availability.` });
    const c = r.clusters.find(x => x.c.id === e._cl);
    if (c && c.total < e.nodes) w.push({ lvl: "warn", t: `${d.name}: ${e.nodes} edge nodes on ${c.c.name} with ${c.total} hosts can't be kept on separate hosts.` });
  }
  // vCenter and NSX scale
  for (const inst of topo.instances) {
    if (inst.wlds.length > 40) w.push({ lvl: "crit", t: `${inst.name}: ${inst.wlds.length} workload domains; a VCF instance supports up to 40.` });
    [inst.mgmt, ...inst.wlds].forEach((d, di) => {
      const cs = r.clusters.filter(c => c.d === d), h = cs.reduce((a, c) => a + c.total, 0), vms = cs.reduce((a, c) => a + c.load.vms, 0);
      const size = di === 0 ? (PROFILES[inst._prof          ] || r.prof).vc : d.vcSize, v = VCENTER[size] || VCENTER.medium;
      if (h > 2500) w.push({ lvl: "crit", t: `${d.name}: ${nf(h)} hosts is above the 2,500 hosts one vCenter supports. Split it into more workload domains.` });
      else if (h > v[3] || vms > v[4]) w.push({ lvl: "warn", t: `${d.name}: ${nf(h)} hosts and ${nf(vms)} VMs is beyond a ${size} vCenter (${nf(v[3])} hosts / ${nf(v[4])} VMs).${di === 0 ? " The management vCenter size comes from the deployment model." : " Pick a larger vCenter."}` });
      if (!cs.length && di > 0) w.push({ lvl: "info", t: `${inst.name} / ${d.name} has no cluster yet, so only its vCenter and NSX are sized (in the management domain).` });
    });
  }
  for (const n of r.nsxSets) {
    const cs = r.clusters.filter(c => n.domains.includes(c.d)), h = cs.reduce((a, c) => a + c.total, 0), lim = NSXMGR[n.size] || NSXMGR.large;
    if (h > lim[3] || cs.length > lim[4]) w.push({ lvl: "warn", t: `${n.name} (${n.size}): ${nf(h)} hosts in ${cs.length} clusters is beyond its ${nf(lim[3])} hosts / ${lim[4]} clusters. Give some domains their own NSX, or use a larger NSX Manager${n.name.includes("management") ? " (the deployment model sets the management NSX size)" : ""}.` });
  }
  if (s.mgmtRatio > 2) w.push({ lvl: "info", t: `Management vCPU is counted at ${s.mgmtRatio}:1. VCF design guidance keeps the management domain at or below 2:1.` });
  if (r.instances === 1 && s.vlrOn) w.push({ lvl: "info", t: "VMware Live Recovery needs an appliance at the recovery site too; it isn't in this sizing (add a second instance for it)." });
  if (r.fit.some(f => f.lvl === "crit")) w.push({ lvl: "crit", t: `${r.fit.filter(f => f.lvl === "crit").length} VMs don't fit one host of the cluster they land in. See "Large VMs".` });
  if (r.bom.witnesses.length) w.push({ lvl: "info", t: `${r.bom.witnesses.length} stretched vSAN cluster${r.bom.witnesses.length > 1 ? "s need" : " needs"} a witness appliance at a third site (in the bill of materials, not in these clusters).` });
}
