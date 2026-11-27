// Built from TypeScript by studio/build.mjs. Edit the .ts source, then run npm run build.
// RVTools import for the studio. Files are read in the browser (SheetJS, loaded by the page) and kept in
// memory for this visit only; the design keeps the groups built from them, never the files.
// rebuild() is the VCF Sizing page's rebuildRV: same grouping, and a group keeps its include, options
// and hand-edited values when the files or scope change. No DOM here; tested in engine/test/studio.test.ts.
import { parseRVTools, buildGroups } from "../../engine/src/index.js";
                                                                                           

export const SHEETS = ["vInfo", "vHost", "vDisk", "vPartition", "vCPU", "vMemory"]         ;
                                             
                                                                               

/** One export, from a function giving each sheet's rows (null when the sheet is missing). */
export function readExport(fileName        , rows                         )             {
  try {
    const p = parseRVTools(rows("vInfo")         , rows("vHost")         , rows("vDisk")         , rows("vPartition")         , fileName, rows("vCPU")         , rows("vMemory")         );
    return { ...p, include: true, status: p.error ? "error" : "ok" };
  } catch (e) {
    return { fileName, vms: [], include: true, status: "error", error: `Couldn't read this file as an RVTools export (${(e         ).message}).` };
  }
}

export const VALUE_KEYS = ["vms", "vcpu", "vramGiB", "usedTiB", "allocTiB", "templTiB"]         ;
const newOpts = () => ({ cpuPeak: 0, ramPeak: 0, place: "auto", drTo: "", drMode: "storage" });

/** Values of an RVTools group that differ from what was read (the page's amber cells). */
export function overridden(g             )           {
  if (g.source !== "rvtools" || !g.parsed) return [];
  return VALUE_KEYS.filter(k => Math.abs((Number(g.values[k]) || 0) - (Number(g.parsed [k]) || 0)) > 1e-9);
}

/** Groups from the files loaded now, merged with the design's: RVTools groups first (rebuilt), then manual ones. */
export function rebuild(d        , files              , scope              ) {
  const ok = files.filter(f => f.status === "ok");
  const b = buildGroups(ok, scope, scope.groupBy);
  const old = new Map(d.workload.groups.filter(g => g.source === "rvtools").map(g => [g.name, g]));
  let next = d.workload.groups.reduce((m, g) => Math.max(m, g.id), 0) + 1;
  const fresh                = b.groups.map(x => {
    const parsed                         = { vms: x.vms, vcpu: x.vcpu, vramGiB: x.vramGiB, usedTiB: x.usedTiB, allocTiB: x.allocTiB, templTiB: x.templTiB };
    const prev = old.get(x.key), values                                  = { ...parsed };
    if (prev) for (const k of overridden(prev)) values[k] = prev.values[k];
    return { id: prev ? prev.id : next++, name: x.key, source: "rvtools", include: prev ? prev.include : true, parsed, values,
      opts: prev && prev.opts ? prev.opts : newOpts(), meta: { big: x.big, snap: x.snap, vc: scope.groupBy === "cluster" ? x.key.split(" / ")[0] : x.key } };
  });
  return { groups: [...fresh, ...d.workload.groups.filter(g => g.source !== "rvtools")], stats: b };
}

/** The current estate from vHost (included files): hosts, cores, RAM and CPU models. */
export function estate(files              ) {
  const est = files.filter(f => f.status === "ok" && f.include && f.est).map(f => f.est );
  if (!est.length) return null;
  const models                         = {};
  est.forEach(e => Object.entries(e.models).forEach(([m, c]) => { models[m] = (models[m] || 0) + c; }));
  return { hosts: est.reduce((a, e) => a + e.hosts, 0), cores: est.reduce((a, e) => a + e.cores, 0), ramGiB: est.reduce((a, e) => a + e.ramGiB, 0),
    models: Object.entries(models).sort((a, b) => b[1] - a[1]) };
}
