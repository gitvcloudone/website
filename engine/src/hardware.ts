// Host types: only values that exist.
// Cores per socket are the counts each vendor's current server CPUs ship with; memory is offered only
// as balanced configurations (every channel populated with the same DIMM, 1 or 2 per channel).
import { VENDORS, DIMMS, NVME_TB, HOST_RAM_MAX_GB } from "./knowledge.ts";
import type { HostType, HostTypeInput } from "./types.ts";

export interface RamOption { gb: number; dpc: number; ch: number; label: string }

/** Balanced memory configurations for a vendor and socket count. */
export function ramOptions(vendor: string, sockets: number): RamOption[] {
  const f = VENDORS[vendor]; if (!f) return [];
  const m = new Map<number, RamOption>();
  for (const ch of f.channels) for (const dpc of f.dpc) for (const d of DIMMS) {
    const n = sockets * ch * dpc, gb = n * d;
    if (gb < 128 || gb > HOST_RAM_MAX_GB) continue;
    const prev = m.get(gb);
    const better = !prev || prev.dpc > dpc || (prev.dpc === dpc && prev.ch > ch);
    if (better) m.set(gb, { gb, dpc, ch, label: `${gb.toLocaleString("en-US")} GB (${n} × ${d} GB${dpc === 2 ? ", 2 per channel" : ""})` });
  }
  return [...m.values()].sort((a, b) => a.gb - b.gb);
}

export function defaultHw(o: Partial<HostType> = {}): HostType {
  return { id: "", name: "Host type 1", vendor: "intel", sockets: 2, cores: 32, ramGB: 1024, ht: true,
    nvme: 6, nvmeTB: 7.68, ...o };
}

const nearest = (list: number[], x: number) => list.reduce((a, c) => Math.abs(c - x) < Math.abs(a - x) ? c : a, list[0]);

/** Snap a host type onto valid values (after a vendor or socket change, or a loaded file). */
export function fixHw(hw: HostTypeInput): HostType {
  const h = { ...defaultHw(), ...hw } as HostType & Record<string, unknown>;
  if (!VENDORS[hw.vendor as string]) h.vendor = /amd|epyc/i.test(String(hw.fam || "")) ? "amd" : "intel";
  delete h.fam;
  const f = VENDORS[h.vendor];
  if (!f.sockets.includes(h.sockets)) h.sockets = nearest(f.sockets, h.sockets);
  if (!f.cores.includes(h.cores)) h.cores = nearest(f.cores, h.cores);
  const ro = ramOptions(h.vendor, h.sockets);
  if (!ro.some(o => o.gb === h.ramGB)) h.ramGB = ro.reduce((a, o) => Math.abs(o.gb - h.ramGB) < Math.abs(a.gb - h.ramGB) ? o : a, ro[0]).gb;
  if (h.dataDrives !== undefined && hw.nvme === undefined) h.nvme = h.dataDrives as number;
  if (h.dataTB !== undefined && hw.nvmeTB === undefined) h.nvmeTB = h.dataTB as number;
  delete h.dataDrives; delete h.dataTB; delete h.tierDrives; delete h.tierTB;
  h.nvme = Math.min(24, Math.max(0, Math.round(h.nvme)));
  if (!NVME_TB.includes(h.nvmeTB)) h.nvmeTB = 7.68;
  for (const k of ["osaDG", "osaCap", "osaCapTB", "osaCacheTB"]) delete h[k];
  h.ht = h.ht !== false;
  h.name = String(h.name || "Host type").slice(0, 60);
  return h;
}

export function hwText(hw: HostType): string {
  const f = VENDORS[hw.vendor];
  return `${hw.sockets} × ${hw.cores}-core ${f ? f.label : hw.vendor}${hw.ht ? "" : " (no hyperthreading)"} · ${hw.ramGB.toLocaleString("en-US")} GB · ${hw.nvme ? `${hw.nvme} × ${hw.nvmeTB} TB NVMe` : "no NVMe"}`;
}
