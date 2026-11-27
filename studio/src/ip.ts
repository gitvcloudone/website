// IP / VLAN / DNS plan, design level: every network the design needs (from host networking and NSX), the
// addresses each needs at today's size and with room to grow, the DNS records, and checks on what's
// entered (subnet too small, overlaps, duplicate VLANs, gateways, reserved ranges). The proposer fills
// empty rows from a base block. Stored: only what's entered or proposed (design.plan). No DOM; tested.
import { IPPLAN, PROFILES, isVsan } from "../../engine/src/index.ts";
import type { Design, Instance, SizingResult } from "../../engine/src/index.ts";
import { hostsByCluster } from "./hostnet.ts";
import { effectiveNsx } from "./nsx.ts";
import type { Op } from "./store.ts";

// ---------- IPv4 ----------
const ipNum = (t: string) => {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(t.trim()); if (!m) return null;
  const o = m.slice(1).map(Number); return o.some(x => x > 255) ? null : ((o[0] << 24) >>> 0) + (o[1] << 16) + (o[2] << 8) + o[3];
};
export const ipText = (n: number) => [24, 16, 8, 0].map(s => (n >>> s) & 255).join(".");
export interface Subnet { net: number; prefix: number; hostBits: boolean }
export function parseCidr(t: string): Subnet | null {
  const m = /^([\d.]+)\/(\d{1,2})$/.exec(t.trim()); if (!m) return null;
  const a = ipNum(m[1]), p = Number(m[2]); if (a === null || p > 32) return null;
  const net = p === 0 ? 0 : (a & (~0 << (32 - p))) >>> 0;
  return { net, prefix: p, hostBits: net !== a };
}
export const sizeOf = (p: number) => 2 ** (32 - p);
const overlaps = (a: Subnet, b: Subnet) => a.net < b.net + sizeOf(b.prefix) && b.net < a.net + sizeOf(a.prefix);
export const cidrText = (s: Subnet) => `${ipText(s.net)}/${s.prefix}`;
/** Smallest subnet (largest prefix) holding n addresses, network and broadcast included. */
const prefixFor = (n: number) => { let p = 32; while (p > 0 && sizeOf(p) < n) p--; return p; };

// ---------- what the design needs ----------
export interface PlanNet { key: string; inst: Instance; name: string; where: string; kind: "vlan" | "block"; need: number; prefix: number; fixed?: boolean }
export interface DnsRecord { inst: Instance; label: string; fqdn: number; ips: number; net: string }

const ha = (d: Design, inst: Instance) => !!(PROFILES[inst.profile || d.fleet.profile] || PROFILES[d.fleet.profile])?.ha;
const when: Record<string, (d: Design) => boolean> = {
  automation: d => d.fleet.automation, logs: d => d.fleet.logs, opsNet: d => d.fleet.opsNet !== "off", identityInstance: d => d.identity.mode === "instance",
};

/** Components needing an FQDN and a static IP (VCF 9.1 first-instance page); each with the plan network it sits on. */
export function dnsRecords(d: Design, r: SizingResult): DnsRecord[] {
  const out: DnsRecord[] = [], hosts = hostsByCluster(r);
  d.topology.instances.forEach((inst, ii) => {
    const h = ha(d, inst) ? 1 : 0, mg = `${inst.id}:vmmgmt`;
    const nsxNodes = [inst.mgmt, ...inst.wlds].map(dm => dm.kind === "mgmt" ? (PROFILES[inst.profile || d.fleet.profile] || PROFILES[d.fleet.profile]).nsx[0] : dm.nsx === "dedicated" ? dm.nsxNodes || 3 : 0).filter(n => n > 0);
    for (const rule of IPPLAN.records) {
      if (rule.when && !when[rule.when](d)) continue;
      const add = (n: number, label = rule.label, net = mg) => { if (n > 0) out.push({ inst, label, fqdn: rule.fqdn[h] * n, ips: rule.ips[h] * n, net }); };
      switch (rule.per) {
        case "domain": add(1 + inst.wlds.length, `${rule.label} (one per domain)`); break;
        case "nsx": add(nsxNodes.length); break;
        case "nsxNode": add(nsxNodes.reduce((a, b) => a + b, 0)); break;
        case "instance": add(1); break;
        case "fleet": if (ii === 0) add(1); break;
        case "opsNetNode": if (ii === 0) add(Math.max(1, d.fleet.opsNetNodes) + Math.max(0, d.fleet.opsNetCollectors)); break;
        case "edge": add([inst.mgmt, ...inst.wlds].reduce((a, dm) => a + dm.edges.reduce((s, e) => s + (e.nodes || 0), 0), 0)); break;
        case "host": for (const dm of [inst.mgmt, ...inst.wlds]) for (const c of dm.clusters) add(hosts.get(c.id) || 0, `${rule.label} (${c.name})`, `${c.id}:esx`); break;
      }
    }
  });
  return out;
}

/** Every network and IP block the design needs, with the addresses needed today and the recommended subnet size. */
export function planNets(d: Design, r: SizingResult): PlanNet[] {
  const out: PlanNet[] = [], hosts = hostsByCluster(r), recs = dnsRecords(d, r), multi = d.topology.instances.length > 1;
  const vlan = (key: string, inst: Instance, name: string, where: string, need: number, fixed?: number) => out.push({ key, inst, name, where, kind: "vlan", need,
    prefix: fixed ?? Math.min(IPPLAN.minPrefix, prefixFor(Math.ceil(need * IPPLAN.growth) + 3)), fixed: fixed !== undefined });
  for (const inst of d.topology.instances) {
    const at = (s: string) => (multi ? `${inst.name} / ` : "") + s;
    vlan(`${inst.id}:vmmgmt`, inst, "VM management", at("instance"), recs.filter(x => x.inst === inst && x.net === `${inst.id}:vmmgmt`).reduce((a, x) => a + x.ips, 0));
    for (const dm of [inst.mgmt, ...inst.wlds]) {
      const v = effectiveNsx(d, dm), nodes = dm.edges.reduce((s, e) => s + (e.nodes || 0), 0);
      const edgeOn = dm.clusters.find(c => dm.edges.some(e => e.on === c.id)) || dm.clusters[0];
      for (const c of dm.clusters) {
        const n = hosts.get(c.id) || 0, where = at(`${dm.name} / ${c.name}`);
        vlan(`${c.id}:esx`, inst, "ESX management", where, n);
        vlan(`${c.id}:vmotion`, inst, "vMotion", where, n);
        if (isVsan(c)) vlan(`${c.id}:vsan`, inst, "vSAN", where, n);
        vlan(`${c.id}:tep`, inst, v.edgeTep === "shared" && nodes && c === edgeOn ? "Host and edge TEP" : "Host TEP", where, n * 2 + (v.edgeTep === "shared" && c === edgeOn ? nodes * 2 : 0));
      }
      if (nodes && v.edgeTep === "separate") vlan(`${dm.id}:edgetep`, inst, "Edge TEP", at(dm.name), nodes * 2);
      if (nodes && v.model === "centralized") for (const s of ["A", "B"]) vlan(`${dm.id}:peer${s}`, inst, `Tier-0 peering ${s}`, at(dm.name), nodes + 1, Math.min(28, prefixFor(nodes + 4)));
      out.push({ key: `${dm.id}:ext`, inst, name: "VPC external IP block", where: at(dm.name), kind: "block", need: 0, prefix: v.extPrefix, fixed: true });
      if (v.model === "distributed") out.push({ key: `${dm.id}:priv`, inst, name: "Private transit gateway block", where: at(dm.name), kind: "block", need: 0, prefix: v.privPrefix, fixed: true });
    }
  }
  return out;
}

// ---------- checks ----------
export interface PlanIssue { lvl: "crit" | "warn"; t: string }
export function planIssues(d: Design, r: SizingResult): { issues: PlanIssue[]; missing: number } {
  const nets = planNets(d, r), issues: PlanIssue[] = [], ok: { n: PlanNet; s: Subnet; vlan?: number }[] = [];
  const label = (n: PlanNet) => `${n.name} (${n.where})`;
  let missing = 0;
  for (const n of nets) {
    const row = d.plan.rows[n.key] || {};
    if (!row.cidr || (n.kind === "vlan" && !row.vlan)) missing++;
    if (!row.cidr) continue;
    const s = parseCidr(row.cidr);
    if (!s) { issues.push({ lvl: "crit", t: `${label(n)}: "${row.cidr}" isn't an IPv4 subnet (a.b.c.d/nn).` }); continue; }
    if (s.hostBits) { issues.push({ lvl: "crit", t: `${label(n)}: ${row.cidr} has host bits set. Did you mean ${cidrText(s)}?` }); continue; }
    ok.push({ n, s, vlan: row.vlan });
    if (n.kind === "block") { if (s.prefix > n.prefix) issues.push({ lvl: "warn", t: `${label(n)}: ${row.cidr} is smaller than the /${n.prefix} chosen in NSX & connectivity.` }); continue; }
    const gw = row.gw ? ipNum(row.gw) : null;
    if (!row.gw) issues.push({ lvl: "crit", t: `${label(n)}: enter the gateway.` });
    else if (gw === null) issues.push({ lvl: "crit", t: `${label(n)}: gateway "${row.gw}" isn't an IPv4 address.` });
    else if (gw <= s.net || gw >= s.net + sizeOf(s.prefix) - 1) issues.push({ lvl: "crit", t: `${label(n)}: gateway ${row.gw} isn't a usable address in ${row.cidr}.` });
    if (n.fixed && s.prefix > n.prefix) issues.push({ lvl: "warn", t: `${label(n)}: ${row.cidr} is smaller than the recommended /${n.prefix}.` });
  }
  // a subnet entered on more than one network is shared: one VLAN, and room for all of them
  const bySubnet = new Map<string, typeof ok>();
  for (const x of ok) bySubnet.set(cidrText(x.s), [...(bySubnet.get(cidrText(x.s)) || []), x]);
  for (const [cidr, xs] of bySubnet) {
    if (new Set(xs.map(x => x.vlan)).size > 1) issues.push({ lvl: "crit", t: `${cidr} is used by ${xs.map(x => label(x.n)).join(", ")} on different VLANs.` });
    if (xs.some(x => x.n.kind === "block") && xs.length > 1) { issues.push({ lvl: "crit", t: `${cidr} is used by more than one network or block: ${xs.map(x => label(x.n)).join(", ")}.` }); continue; }
    if (xs[0].n.kind === "block") continue;
    const need = xs.reduce((a, x) => a + x.n.need, 0), usable = sizeOf(xs[0].s.prefix) - 3, who = xs.length > 1 ? `${cidr} (shared by ${xs.map(x => label(x.n)).join(", ")})` : `${label(xs[0].n)}: ${cidr}`;
    if (usable < need) issues.push({ lvl: "crit", t: `${who} is too small: ${need} addresses needed, ${Math.max(0, usable)} usable after the gateway.` });
    else if (!xs.some(x => x.n.fixed) && usable < need * IPPLAN.growth) issues.push({ lvl: "warn", t: `${who} has little room to grow (${need} of ${usable} usable addresses needed today). VCF can't change the mask later.` });
  }
  const subnets = [...bySubnet.values()].map(xs => xs[0]);
  for (let i = 0; i < subnets.length; i++) for (let j = i + 1; j < subnets.length; j++) if (overlaps(subnets[i].s, subnets[j].s))
    issues.push({ lvl: "crit", t: `${cidrText(subnets[i].s)} (${label(subnets[i].n)}) overlaps ${cidrText(subnets[j].s)} (${label(subnets[j].n)}).` });
  for (const x of subnets) for (const res of IPPLAN.reserved) if (overlaps(x.s, parseCidr(res.cidr)!))
    issues.push({ lvl: "crit", t: `${label(x.n)}: ${cidrText(x.s)} overlaps ${res.cidr}, reserved for ${res.use}.` });
  // one VLAN per subnet within an instance (VLANs can repeat at another site)
  for (const inst of d.topology.instances) {
    const byVlan = new Map<number, Set<string>>();
    for (const x of ok) if (x.vlan && x.n.inst === inst) byVlan.set(x.vlan, (byVlan.get(x.vlan) || new Set()).add(cidrText(x.s)));
    for (const [v, s] of byVlan) if (s.size > 1) issues.push({ lvl: "crit", t: `${inst.name}: VLAN ${v} is used for different subnets (${[...s].join(", ")}).` });
    // design rule: host management (ESX) and the management VMs each on their own VLAN
    const vm = ok.find(x => x.n.inst === inst && x.n.key.endsWith(":vmmgmt"));
    for (const x of ok) if (vm && vm.vlan && x.n.inst === inst && x.n.key.endsWith(":esx") && x.vlan === vm.vlan)
      issues.push({ lvl: "warn", t: `${label(x.n)} shares VLAN ${x.vlan} with VM management: host management and the management VMs each get their own VLAN.` });
  }
  return { issues, missing };
}

// ---------- edits and the proposer ----------
export function planOps(d: Design, key: string, f: "vlan" | "cidr" | "gw", value: unknown): Op[] {
  const row: Record<string, unknown> = { ...d.plan.rows[key] }, t = String(value ?? "").trim();
  if (f === "vlan") {
    const n = t === "" ? 0 : Number(t);
    if (!Number.isInteger(n) || n < 0 || n > 4094) throw new Error("A VLAN ID is a whole number from 1 to 4094.");
    if (n) row.vlan = n; else delete row.vlan;
  } else if (t) row[f] = t; else delete row[f];
  const rows = { ...d.plan.rows } as Record<string, unknown>;
  if (Object.keys(row).length) rows[key] = row; else delete rows[key];
  return [{ op: "set", path: ["plan", "rows"], value: rows }];
}

/** Fill every empty row: subnets of the recommended size from the base block (largest first, aligned, clear of
 *  what's entered and of reserved ranges), the first address as gateway, VLANs counting up from the first VLAN.
 *  What's already entered is kept. */
export function proposePlan(d: Design, r: SizingResult): Op[] {
  const base = parseCidr(d.plan.base || "");
  if (!base || base.hostBits) throw new Error("Enter the base block to plan from as a.b.c.d/nn, e.g. 10.10.0.0/16.");
  if (!d.plan.vlanStart) throw new Error("Enter the first VLAN ID to use.");
  const nets = planNets(d, r), rows: Record<string, Record<string, unknown>> = Object.fromEntries(Object.entries(d.plan.rows).map(([k, v]) => [k, { ...v }]));
  const taken: Subnet[] = [...IPPLAN.reserved.map(x => parseCidr(x.cidr)!), ...Object.values(rows).map(x => x.cidr ? parseCidr(String(x.cidr)) : null).filter((s): s is Subnet => !!s && !s.hostBits)];
  const vlans = new Set(Object.values(rows).map(x => x.vlan as number).filter(Boolean));
  let nextVlan = d.plan.vlanStart, short = 0;
  const todo = nets.filter(n => !rows[n.key]?.cidr).sort((a, b) => a.prefix - b.prefix);
  for (const n of todo) {
    const row = rows[n.key] = rows[n.key] || {};
    let at = -1;
    for (let a = base.net; a + sizeOf(n.prefix) <= base.net + sizeOf(base.prefix); a += sizeOf(n.prefix)) {
      const s = { net: a, prefix: n.prefix, hostBits: false };
      if (!taken.some(t => overlaps(t, s))) { at = a; break; }
    }
    if (at < 0) { short += sizeOf(n.prefix); delete rows[n.key].cidr; continue; }
    const s = { net: at, prefix: n.prefix, hostBits: false }; taken.push(s);
    row.cidr = cidrText(s);
    if (n.kind === "vlan" && !row.gw) row.gw = ipText(at + 1);
  }
  if (short) throw new Error(`${d.plan.base} is too small for the plan: about ${short.toLocaleString("en-US")} more addresses are needed. Use a larger base block.`);
  for (const n of nets) if (n.kind === "vlan" && !rows[n.key]?.vlan) {
    while (vlans.has(nextVlan)) nextVlan++;
    if (nextVlan > 4094) throw new Error("Not enough VLAN IDs above the first VLAN. Use a lower first VLAN.");
    rows[n.key].vlan = nextVlan; vlans.add(nextVlan);
  }
  return [{ op: "set", path: ["plan", "rows"], value: rows }];
}
