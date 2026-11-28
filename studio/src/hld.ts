// The high-level design (HLD) as content: sections of paragraphs, lists, tables and diagram slots, built
// from the design and its sizing. Every output format (the page preview, Word, PDF via print) renders this
// same model, so they always say the same thing. A pure function of the design → data (no DOM); tested.
import { IDENTITY, NETWORK, NSX, PILLARS, RULES, SOURCES, isVsan, clusterReason, summaryLine, workloadTotals } from "../../engine/src/index.ts";
import type { Design, SizingResult, NarrativeTarget } from "../../engine/src/index.ts";
import { snapOf } from "./snap.ts";
import { productName } from "./flags.ts";
import { evaluate, scorecard, decisionRegister, riskRegister, scorable } from "./rules.ts";
import { stepState, changes, show } from "./steps.ts";
import { STEPS } from "./flow.ts";
import { policyFields, fleetFields, addonFields, clusterNetFields, nsxFields, STORAGE } from "./fields.ts";
import { allClusters, effective, networksOf, hostsByCluster, nicsOf } from "./hostnet.ts";
import { allDomains, effectiveNsx, asns } from "./nsx.ts";
import { planNets, dnsRecords, planIssues } from "./ip.ts";
import { prerequisites } from "./prereqs.ts";
import type { Field } from "./fields.ts";

// ---------- the model ----------
export type Block =
  | { t: "p"; text: string }
  | { t: "list"; items: string[] }
  | { t: "table"; head: string[]; rows: string[][]; num?: number[] }   // num: column indexes to right-align
  | { t: "tbd"; text: string }                                         // "To be defined": a skipped or unfinished part
  | { t: "diagram"; id: "topology" | "network"; caption: string }
  | { t: "ai"; target: NarrativeTarget; label: string; paras: string[]; stale: boolean; unmatched: string[] };   // AI-drafted text, labelled as such; `unmatched`: its numbers this HLD doesn't contain
export interface Section { id: string; title: string; blocks: Block[]; sub?: Section[] }
export interface Hld {
  /** the app that made it: "VCF Design Studio" or "VCF Design Studio: AI-powered" */
  tool: string;
  title: string; customer: string; site: string; version: string; date: string; status: string;
  summary: string; sections: Section[];
}

// ---------- helpers ----------
const nf = (n: number, d = 0) => (Number.isFinite(n) ? n.toLocaleString("en-US", { maximumFractionDigits: d, minimumFractionDigits: 0 }) : "–");
const plural = (n: number, w: string) => `${nf(n)} ${w}${n === 1 ? "" : "s"}`;
const p = (text: string): Block => ({ t: "p", text });
const tbd = (text: string): Block => ({ t: "tbd", text });
const table = (head: string[], rows: (string | number)[][], num?: number[]): Block => ({ t: "table", head, rows: rows.map(r => r.map(c => (typeof c === "number" ? nf(c, 1) : c))), num });
const sec = (id: string, title: string, blocks: Block[], sub?: Section[]): Section => ({ id, title, blocks, ...(sub ? { sub } : {}) });
const skipped = (d: Design, id: string) => stepState(d, id).state === "skipped";
const stepTitle = (id: string) => STEPS.find(s => s.id === id)?.title || id;
const skipNote = (d: Design, id: string): Block[] => skipped(d, id)
  ? [tbd(`To be defined: the ${stepTitle(id)} step was skipped. The values below are the recommended ones, used for sizing until it's decided.`)] : [];
/** A settings table: every field with its value, and the recommended value where it differs. */
const settingsTable = (fs: Field[], o: Record<string, unknown>): Block => table(["Setting", "Value", "Recommended"],
  fs.filter(f => f.on !== false).map(f => [f.label, show(f, o[f.key]), f.def !== undefined && o[f.key] !== f.def ? show(f, f.def) : "✓ same"]));
const where = (d: Design, inst: { name: string }, rest: string) => (d.topology.instances.length > 1 ? `${inst.name} / ` : "") + rest;

/** A fingerprint of everything an AI draft depends on (the design, less the drafts and the AI log). */
export const designSnap = (d: Design) => snapOf({ ...d, narrative: {}, decisions: { ...d.decisions, ai: [] } });
/** AI-drafted text for a target, as an HLD block, or nothing. */
function aiBlock(d: Design, t: NarrativeTarget): Block[] {
  const n = d.narrative?.[t]; if (!n || !n.text.trim()) return [];
  const stale = n.snap !== designSnap(d);
  return [{ t: "ai", target: t, label: n.edited ? "Drafted with AI and edited by the architect" : "AI draft: review before sharing", paras: n.text.split(/\n\s*\n/).map(x => x.trim()).filter(Boolean), stale, unmatched: [] }];
}

const num = (x: string) => Number(x.replace(/,/g, ""));
/** Host and core counts are checked against those figures only (a "13" elsewhere in the document doesn't make "13 hosts" right). */
const UNITS: [unit: string, re: RegExp][] = [["host", /^(?:\S+\s+)?hosts?\b/i], ["core", /^(?:\S+\s+){0,2}cores?\b/i]];
export interface Allowed { any: Set<number>; host: Set<number>; core: Set<number> }

/** What an AI draft may quote: every number the HLD states from the design and the engine (AI drafts left out), and for
 *  hosts and cores, the engine's host and core figures plus the counts the HLD itself gives in hosts or cores. */
export function hldNumbers(h: Hld, r?: SizingResult): Allowed {
  const own = JSON.stringify({ ...h, sections: h.sections.map(function strip(s: Section): Section { return { ...s, blocks: s.blocks.filter(b => b.t !== "ai"), sub: s.sub?.map(strip) }; }) });
  const a: Allowed = { any: new Set(), host: new Set(), core: new Set() };
  for (const m of own.matchAll(/(\d[\d,]*(?:\.\d+)?)([^\d"]{0,40})/g)) {
    a.any.add(num(m[1]));
    for (const [u, re] of UNITS) if (re.test(m[2].trim())) a[u as "host" | "core"].add(num(m[1]));
  }
  if (r) {
    a.host.add(r.hosts); a.core.add(r.cores); a.core.add(r.licCores);
    for (const x of r.clusters) for (const v of [x.total, x.need, x.cpuH, x.ramH, x.storH, x.fixed]) if (typeof v === "number") a.host.add(v);
  }
  return a;
}
/** The numbers in a draft that the design doesn't contain, each with the word after it ("14 hosts").
 *  Only standalone numbers count: not those inside names such as wld01-cl01, VM-3 or N+1. */
export function unmatchedNumbers(text: string, allowed: Allowed): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/(?<![\w.+\-/:#])(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)(?![\w])(\s*%|\s+[A-Za-z]+)?/g)) {
    const n = num(m[1]), after = text.slice(m.index! + m[1].length).trim();
    const unit = UNITS.find(([, re]) => re.test(after))?.[0] as "host" | "core" | undefined;
    if (!(unit ? allowed[unit] : allowed.any).has(n)) { const shown = (m[1] + (m[2] || "")).trim(); if (!out.includes(shown)) out.push(shown); }
  }
  return out;
}

/** The HLD for a design. `date` is passed in so the content is reproducible (tests, saved copies). */
export function buildHld(d: Design, r: SizingResult, date: string): Hld {
  const res = evaluate(d, r), score = scorecard(d, res), decs = decisionRegister(d, res), risks = riskRegister(res);
  const ready = scorable(d, r), customer = d.project.customer.trim() || "Customer to be named";
  const T = workloadTotals(d.workload.groups.map(g => ({ ...g })) as never);
  const hosts = hostsByCluster(r);

  // ----- 1. Executive summary -----
  const domains = allDomains(d), clusters = allClusters(d);
  const openRules = ready ? res.filter(x => x.status === "open" && x.rule.level !== "consider").flatMap(x => x.findings.filter(f => !f.reason).map(f => ({ x, f }))) : [];
  const skippedSteps = STEPS.filter(s => skipped(d, s.id));
  const summary = r.clusters.length
    ? `${customer}${d.project.site ? ` (${d.project.site})` : ""}: a VMware Cloud Foundation ${d.project.version} design of ${plural(d.topology.instances.length, "instance")}, ${plural(domains.length, "domain")} and ${plural(clusters.length, "cluster")}, sized at ${summaryLine(r)}.`
    : `${customer}: a VMware Cloud Foundation ${d.project.version} design that isn't sized yet. Add the workload, host types and topology.`;
  const execBlocks: Block[] = [p(summary), ...aiBlock(d, "summary")];
  if (r.clusters.length) {
    execBlocks.push(p(`It runs ${plural(T.vms, "VM")} with ${nf(T.vcpu)} vCPU, ${nf(T.vramGiB)} GiB of memory and ${nf(T.usedTiB)} TiB of storage in use (${nf(T.allocTiB)} TiB allocated) today, planned with ${d.policy.growth}% growth. ` +
      `The design needs ${plural(r.hosts, "host")} with ${nf(r.cores)} physical cores, licensed as ${nf(r.licCores)} VCF cores${r.lic.addOnTiB ? ` plus ${nf(r.lic.addOnTiB)} TiB of vSAN add-on capacity` : ""}.`));
    execBlocks.push(table(["Instance", "Domain", "Cluster", "Hosts", "Why that many"],
      r.clusters.map(x => [x.inst.name, x.d.name, x.c.name, x.total, clusterReason(x).replace(/^\d[\d,]* hosts?: /, "")]), [3]));
  }
  const state: string[] = [];
  if (ready) state.push(`Best practices: ${score.reduce((a, s) => a + s.met, 0)} met, ${score.reduce((a, s) => a + s.accepted, 0)} deviations accepted with a reason, ${openRules.length} still open.`);
  if (risks.length) state.push(`${plural(risks.length, "risk")} recorded${risks.some(x => x.high) ? `, ${risks.filter(x => x.high).length} high` : ""}.`);
  if (skippedSteps.length) state.push(`Still to define: ${skippedSteps.map(s => s.title).join(", ")}.`);
  if (state.length) execBlocks.push({ t: "list", items: state });

  // ----- 2. Requirements, assumptions, constraints and risks -----
  const req = d.workload.groups.filter(g => g.include);
  const reqBlocks: Block[] = req.length ? [
    p("The workload this design is sized for, as imported from RVTools or entered by hand. Storage is the used capacity unless the sizing policy says allocated."),
    table(["Workload group", "Source", "VMs", "vCPU", "vRAM (GiB)", "Used (TiB)", "Allocated (TiB)", "Placement", "Protected to"],
      req.map(g => [g.name, g.source === "manual" ? "Entered by hand" : g.source, Number(g.values.vms) || 0, Number(g.values.vcpu) || 0, Number(g.values.vramGiB) || 0,
        Number(g.values.usedTiB) || 0, Number(g.values.allocTiB) || 0, placeText(d, g.opts?.place), drText(d, g.opts?.drTo)]), [2, 3, 4, 5, 6]),
  ] : [tbd("To be defined: no workload has been added yet.")];
  const assume: Block[] = [...skipNote(d, "policy"), p("Sizing policy: how demand turns into hosts. Every value can be changed in the Sizing policy step."),
    settingsTable(policyFields(), d.policy as unknown as Record<string, unknown>)];
  const constraints: string[] = [`VMware Cloud Foundation ${d.project.version}.`,
    ...d.hostTypes.map(h => `Host type "${h.name}": ${h.sockets} × ${h.cores}-core ${h.vendor === "amd" ? "AMD EPYC" : "Intel Xeon"}, ${nf(h.ramGB)} GB RAM, ${h.nvme} × ${h.nvmeTB} TB NVMe.`),
    "VCF is licensed per physical core with a minimum of 16 cores per CPU; vSAN capacity beyond 1 TiB per licensed core needs the vSAN add-on."];
  const riskBlocks: Block[] = [];
  if (risks.length) riskBlocks.push(table(["Risk", "Where", "Best practice", "Accepted because"], risks.map(x => [`${x.high ? "HIGH: " : ""}${x.risk}`, x.where, x.rule.title, x.reason])));
  if (openRules.length) riskBlocks.push(p("Best practices not met yet (open items, not accepted deviations):"),
    { t: "list", items: openRules.map(o => `${o.x.rule.level === "required" ? "Required" : "Recommended"}: ${o.x.rule.title}: ${o.f.where}.`) });
  for (const s of skippedSteps) riskBlocks.push(tbd(`${s.title} was skipped: an open item until it's decided.`));
  const crit = r.warnings.filter(w => w.lvl !== "info");
  if (crit.length) riskBlocks.push(p("Sizing checks:"), { t: "list", items: crit.map(w => `${w.lvl === "crit" ? "Must fix" : "Check"}: ${w.t}`) });
  if (!riskBlocks.length) riskBlocks.push(p("No risks recorded and no open items."));
  riskBlocks.push(...aiBlock(d, "mitigations"));

  // ----- 3. Fleet, instance, domain and cluster design -----
  const fleetBlocks: Block[] = [...skipNote(d, "fleet"), settingsTable(fleetFields(d.fleet), d.fleet as unknown as Record<string, unknown>)];
  const topoBlocks: Block[] = d.topology.instances.length ? [
    { t: "diagram", id: "topology", caption: "Fleet topology: instances, domains and clusters, with hosts per cluster." },
    table(["Instance", "Deployment model", "Domain", "vCenter", "NSX", "Clusters", "Edges"], domains.map(({ inst, dm }) => [inst.name, inst.profile || d.fleet.profile, dm.name,
      dm.vcSize || "per model", dm.kind === "mgmt" ? "Management NSX" : dm.nsx === "dedicated" ? `Dedicated, ${dm.nsxSize}, ${dm.nsxNodes || 3} nodes` : "Shared with management",
      dm.clusters.map(c => c.name).join(", "), dm.edges.length ? dm.edges.map(e => `${e.name} (${e.on === "bm" ? `${e.nodes} bare-metal` : `${e.nodes} × ${e.size}`})`).join(", ") : "none"])),
  ] : [tbd("To be defined: no instances in the topology yet.")];

  // ----- 4. Host and storage design -----
  const count = new Map<string, number>(); for (const x of r.clusters) count.set(x.c.hw.id, (count.get(x.c.hw.id) || 0) + x.total);
  const hostBlocks: Block[] = d.hostTypes.length ? [table(["Host type", "CPU", "Cores per host", "RAM (GB)", "NVMe", "NICs for VCF", "Hosts in design"],
    d.hostTypes.map(h => [h.name, `${h.sockets} × ${h.cores}-core ${h.vendor === "amd" ? "AMD EPYC" : "Intel Xeon"}`, h.sockets * h.cores, h.ramGB, h.nvme ? `${h.nvme} × ${h.nvmeTB} TB` : "none", nicsOf(d, h.id), count.get(h.id) || 0]), [2, 3, 6])]
    : [tbd("To be defined: no host types yet.")];
  const storBlocks: Block[] = [...skipNote(d, "storage")];
  if (r.clusters.length) storBlocks.push(table(["Cluster", "Storage", "Protection", "Hosts", "Needed (TiB)", "Usable (TiB)", "Raw (TiB)", "Memory tiering"],
    r.clusters.map(x => [x.c.name, STORAGE[x.c.storage] || x.c.storage, isVsan(x.c) ? x.pol?.label || "–" : "array", x.total, x.stor, isVsan(x.c) ? x.usable : x.extTiB, isVsan(x.c) ? x.rawTiB : 0,
      x.c.tierOn ? `${x.c.tierPct}% of DRAM, ${x.c.tierDrives} drive${x.c.tierDrives > 1 ? "s" : ""}` : "off"]), [3, 4, 5, 6]),
    p("For NFS and Fibre Channel clusters, Usable is the capacity the array must present, after its free-space reserve."));

  // ----- 5. Identity and access -----
  const id = d.identity, idBlocks: Block[] = [...skipNote(d, "identity")];
  idBlocks.push(table(["Choice", "Value"], [
    ["Identity Broker mode", id.mode ? IDENTITY.modes[id.mode].label : "Not chosen"],
    ["Identity provider", id.idp ? IDENTITY.providers[id.idp]?.label || id.idp : "Not chosen"],
    ["Provisioning", id.provisioning ? IDENTITY.provisioning[id.provisioning]?.label || id.provisioning : "Not chosen"],
    ["Break-glass account holder", id.breakGlass.holder || "Not named"],
    ["Break-glass credential vault", id.breakGlass.vault || "Not named"],
    ["Break-glass password rotation", id.breakGlass.rotationDays ? `every ${id.breakGlass.rotationDays} days` : "Not set"],
  ]));
  if (id.mode) idBlocks.push(p(IDENTITY.modes[id.mode].use));
  idBlocks.push(id.roles.length ? table(["Identity provider group", "Scope", "Access"], id.roles.map(x => [x.group || "(no group)", scopeText(d, x.scope), ACCESS[x.access]]))
    : tbd("To be defined: no role mapping yet. Map identity provider groups to administrator, operator and read-only access."));
  if (!id.mode || !id.idp) idBlocks.push(tbd("To be defined: the Identity Broker mode and identity provider."));

  // ----- 6. Network -----
  const net = d.network, netSub: Section[] = [];
  netSub.push(sec("net-services", "DNS and NTP", [table(["Service", "Value"], [["DNS domain", net.domain || "Not entered"], ["DNS servers", net.dns || "Not entered"], ["NTP servers", net.ntp || "Not entered"]])]));
  const hostnet: Block[] = [...skipNote(d, "hostnet")];
  if (clusters.length) {
    hostnet.push(table(["Cluster", "Distributed switch model", "NICs × speed", "MTU", "Host TEP addressing"], clusters.map(({ inst, dm, c }) => {
      const v = effective(d, c), m = NETWORK.vdsModels[v.vds];
      return [where(d, inst, `${dm.name} / ${c.name}`), m.label, `${nicsOf(d, c.hostType)} × ${v.nicGbps} Gb/s`, v.mtu, NETWORK.methods[v.tep as keyof typeof NETWORK.methods] || v.tep];
    }), [3]));
    hostnet.push(table(["Cluster", "VMkernel network", "Switch", "MTU", "Addressing", "Addresses today"], clusters.flatMap(({ inst, dm, c }) =>
      networksOf(d, c, hosts.get(c.id) || 0).map(n => [where(d, inst, `${dm.name} / ${c.name}`), n.net, `VDS ${n.vds}`, n.mtu, n.addr, n.ips])), [3, 5]));
    const chg = changes(d, "hostnet"); if (chg.length) hostnet.push(p("Changed from the recommendation:"), { t: "list", items: chg.map(c => `${c.where}: ${c.label}: ${c.value} (recommended ${c.def})`) });
  }
  netSub.push(sec("net-hosts", "Host networking", hostnet));
  const nsx: Block[] = [...skipNote(d, "nsx")];
  if (domains.length) {
    nsx.push({ t: "diagram", id: "network", caption: "Network: per domain, the hosts' distributed switches and VMkernel networks, NSX connectivity and BGP peering." });
    nsx.push(table(["Domain", "Connectivity", "Tier-0 HA", "Transit gateway HA", "BFD", "Edge TEP", "VPC external block", "Local ASN", "Peer ASN"], domains.map(({ inst, dm }) => {
      const v = effectiveNsx(d, dm), a = asns(d, dm), cen = v.model === "centralized";
      return [where(d, inst, dm.name), NSX.models[v.model as keyof typeof NSX.models]?.label || v.model, cen ? HA[v.t0Ha] : "–", HA[v.tgwHa], v.bfd ? "on" : "off",
        dm.edges.length ? (v.edgeTep === "separate" ? "own VLAN" : "shared with host TEPs") : "no edges", `/${v.extPrefix}`, a.localAsn ? String(a.localAsn) : cen ? "Not entered" : "–", a.peerAsn ? String(a.peerAsn) : cen ? "Not entered" : "–"];
    })));
    const chg = changes(d, "nsx"); if (chg.length) nsx.push(p("Changed from the recommendation:"), { t: "list", items: chg.map(c => `${c.where}: ${c.label}: ${c.value} (recommended ${c.def})`) });
  }
  netSub.push(sec("net-nsx", "NSX and connectivity", nsx));
  const nets = planNets(d, r), { missing } = planIssues(d, r);
  const plan: Block[] = nets.length ? [
    p(missing ? `${plural(missing, "network")} still need a VLAN and subnet. The sizes below allow for growth; the Design output page can propose a plan from a base block.` : "Every network has a VLAN and a subnet."),
    table(["Network", "Where", "VLAN", "Subnet", "Gateway", "Addresses today", "Recommended size"], nets.map(n => { const row = d.plan.rows[n.key] || {};
      return [n.name, n.where, n.kind === "block" ? "–" : row.vlan ? String(row.vlan) : "To enter", row.cidr || "To enter", n.kind === "block" ? "–" : row.gw || "To enter", n.need || "–", `/${n.prefix}`]; }), [5]),
  ] : [tbd("To be defined: the IP plan follows from the topology and host networking.")];
  netSub.push(sec("net-plan", "IP and VLAN plan", plan));
  const recs = dnsRecords(d, r);
  netSub.push(sec("net-dns", "DNS records", recs.length ? [p("Each of these needs forward (A) and reverse (PTR) records before deployment."),
    table(["Instance", "Component", "FQDNs", "IP addresses"], recs.map(x => [x.inst.name, x.label, x.fqdn, x.ips]), [2, 3])] : [tbd("To be defined: the DNS records follow from the topology.")]));

  // ----- 7. Add-ons -----
  const addBlocks: Block[] = [...skipNote(d, "addons"), ...addonFields(d.addons, []).flatMap(g => [p(`${g.title}. ${g.note}`), settingsTable(g.fields, d.addons as unknown as Record<string, unknown>)])];

  // ----- 8. Capacity analysis -----
  const capBlocks: Block[] = r.clusters.length ? [
    table(["Cluster", "VMs", "vCPU", "vRAM (GiB)", "CPU hosts", "RAM hosts", "Storage hosts", "Hosts", "Deciding factor"], r.clusters.map(x => [x.c.name, x.load.vms || 0, x.load.vcpu || 0, x.load.vramGiB || 0,
      Math.ceil(x.cpuH - 1e-9) || 0, Math.ceil(x.ramH - 1e-9) || 0, isVsan(x.c) ? x.storH : "–", x.total, x.fixed ? "set by hand" : LIMIT[x.limiter] || x.limiter]), [1, 2, 3, 4, 5, 6, 7]),
    p("Management and add-on appliances placed on each cluster (included in the host counts above):"),
    table(["Cluster", "Appliance", "vCPU", "RAM (GB)", "Disk (GB)"], r.clusters.flatMap(x => x.items.map(i => [x.c.name, i.name, i.vcpu, i.ram, i.disk])), [2, 3, 4]),
  ] : [tbd("To be defined: capacity follows once the design is sized.")];

  // ----- 9. Bill of materials and licensing -----
  const L = r.lic, bomBlocks: Block[] = r.clusters.length ? [
    table(["Item", "Quantity", "Detail"], [
      ...[...count].map(([hid, n]) => { const h = d.hostTypes.find(x => x.id === hid) || r.clusters.find(x => x.c.hw.id === hid)!.c.hw; return [`Host: ${h.name}`, n, `${h.sockets} × ${h.cores}-core, ${nf(h.ramGB)} GB, ${h.nvme} × ${h.nvmeTB} TB NVMe`]; }),
      ...r.bom.witnesses.map(w => [`vSAN witness (${w.cluster})`, 1, `${w.size}: ${w.spec[0]} vCPU, ${w.spec[1]} GB RAM`]),
      ...r.bom.bmEdges.map(e => [`Bare-metal NSX Edge (${e.domain} / ${e.name})`, e.nodes, `${e.cores} cores each`]),
    ], [1]),
    table(["Licence", "Quantity", "How it's counted"], [
      ["VMware Cloud Foundation", `${nf(L.licCores)} cores`, `${nf(L.physCores)} physical cores; at least 16 cores counted per CPU`],
      ["vSAN capacity add-on", `${nf(L.addOnTiB)} TiB`, `${nf(L.rawVsan, 1)} TiB raw vSAN capacity, less 1 TiB included per licensed core`],
      ...(L.vdefendCores ? [["vDefend", `${nf(L.vdefendCores)} cores`, "Cores of hosts in clusters with vDefend"]] : []),
      ...(L.gwfwCores ? [["vDefend Gateway Firewall", `${nf(L.gwfwCores)} cores`, "Edge vCPU and bare-metal edge cores"]] : []),
      ...(L.aviSU ? [["Avi Load Balancer", `${nf(L.aviSU)} service units`, "Service Engines × vCPU per engine"]] : []),
      ...(L.vlrVms ? [["VMware Live Recovery", `${nf(L.vlrVms)} VMs`, "Protected VMs"]] : []),
    ]),
    p("Licence quantities are estimates from the design. Confirm them with Broadcom or your partner before ordering."),
  ] : [tbd("To be defined: the bill of materials follows once the design is sized.")];

  // ----- 10. Decisions and scorecard -----
  const KIND: Record<string, string> = { changed: "Changed from the recommendation", recommended: "Recommendation accepted", auto: "Auto-selected", deviation: "Deviation accepted", ai: "AI-suggested, applied by the architect" };
  const rationale = aiBlock(d, "rationale");
  const decBlocks: Block[] = rationale.length ? [...rationale] : [];
  decBlocks.push(...(decs.length ? [table(["Area", "Decision", "Kind", "Reason"], decs.map(x => [x.step, x.text, KIND[x.kind], x.reason || ""]))] : [p("No decisions recorded yet.")]));
  const scoreBlocks: Block[] = ready ? [table(["Pillar", "Met", "Deviations accepted", "Not met", "Status"], score.map(s => [s.label, `${s.met} of ${s.applicable}`, s.accepted, s.open,
    s.atRisk ? "At risk" : s.incomplete.length ? `Incomplete: ${s.incomplete.join(", ")} skipped` : s.open ? "Open items" : s.applicable ? "Good" : "Nothing to check"]), [2, 3])]
    : [tbd("Scores appear once the design has a workload and a topology.")];

  // ----- 11. Prerequisites -----
  const pre = prerequisites(d, r);
  const preBlocks: Block[] = [p("What each team needs to have ready before deployment. Items marked Done are already settled in this design."),
    table(["Team", "Prerequisite", "Detail", "Status"], pre.map(x => [x.team, x.item, x.detail, x.done ? "Done" : "To do"]))];

  // ----- 12. Appendix -----
  const appendix: Block[] = [
    p("How the numbers are worked out, in order:"),
    { t: "list", items: [
      `Workload demand: vCPU and vRAM from the workload groups, plus ${d.policy.growth}% growth${d.policy.vmOverhead ? ` and ${d.policy.vmOverhead}% VM memory overhead` : ""}.`,
      `CPU: workload vCPU divided by the CPU ratio (${d.policy.cpuRatio}:1), management vCPU by the management ratio (${d.policy.mgmtRatio}:1), against each host's cores.`,
      `Memory: vRAM against each host's RAM, after the memory reserve (${d.policy.memReserve}%) and vSAN memory, at the RAM ratio (${d.policy.ramRatio}:1); memory tiering adds NVMe as memory where it's on.`,
      "Storage: for vSAN, the hosts whose raw NVMe capacity, after the storage policy, compression, dedupe and reserves, holds the data; for NFS and Fibre Channel, the capacity the array must present.",
      "Management and add-on appliances are placed on their clusters first and count in those clusters' CPU, memory and storage.",
      "Hosts per cluster: the largest of CPU, memory and storage, plus spares, and never below the cluster's minimum for its storage policy and deployment model.",
      "Licensing: physical cores per host with at least 16 counted per CPU; vSAN add-on for raw vSAN capacity beyond 1 TiB per licensed core.",
    ] },
    p("Best-practice rules and their sources:"),
    table(["Rule", "Level", "Pillar", "Source", "Verified"], RULES.map(x => [x.title, x.level, PILLARS[x.pillar], x.url ? `${x.source} (${x.url})` : x.source, x.verified])),
    p("Reference data and its sources:"),
    table(["Table", "Source", "Verified"], SOURCES.map(s => [`${s.file} / ${s.table}`, s.url ? `${s.source} (${s.url})` : s.source, s.verified])),
  ];

  const sections: Section[] = [
    sec("summary", "Executive summary", execBlocks),
    sec("requirements", "Requirements, assumptions, constraints and risks", [], [
      sec("req-workload", "Requirements: workload", reqBlocks),
      sec("req-assumptions", "Assumptions: sizing policy", assume),
      sec("req-constraints", "Constraints", [{ t: "list", items: constraints }]),
      sec("req-risks", "Risks and open items", riskBlocks),
    ]),
    sec("fleet", "Fleet, instance, domain and cluster design", [], [sec("fleet-mgmt", "Fleet management", fleetBlocks), sec("fleet-topology", "Topology", topoBlocks)]),
    sec("hosts", "Host and storage design", [], [sec("hosts-types", "Host types", hostBlocks), sec("hosts-storage", "Cluster storage", storBlocks)]),
    sec("identity", "Identity and access", idBlocks),
    sec("network", "Network design", [], netSub),
    sec("addons", "Add-ons", addBlocks),
    sec("capacity", "Capacity analysis", capBlocks),
    sec("bom", "Bill of materials and licensing", bomBlocks),
    sec("decisions", "Design decisions", decBlocks),
    sec("scorecard", "Best-practice scorecard", scoreBlocks),
    sec("prereqs", "Prerequisites", preBlocks),
    sec("appendix", "Appendix: method and sources", appendix),
  ];
  const hld: Hld = { tool: productName(), title: `VMware Cloud Foundation high-level design`, customer, site: d.project.site, version: d.project.version, date,
    status: skippedSteps.length || openRules.length || missing ? "Draft: open items remain" : "Draft", summary, sections };
  // AI drafts: flag any number the rest of the document doesn't state (the model was told to quote only these)
  const allowed = hldNumbers(hld, r);
  for (const { s } of walk(hld)) for (const b of s.blocks) if (b.t === "ai") { b.unmatched = unmatchedNumbers(b.paras.join("\n\n"), allowed);
    if (b.unmatched.length) b.label += ` · check these numbers, they aren't in the design: ${b.unmatched.join(", ")}`; }
  return hld;
}

const ACCESS: Record<string, string> = { admin: "Administrator", operator: "Operator", readonly: "Read-only" };
const HA: Record<string, string> = { aa: "Active-active", as: "Active-standby" };
const LIMIT: Record<string, string> = { CPU: "CPU", RAM: "memory", Storage: "storage", Minimum: "minimum for the cluster" };
function scopeText(d: Design, scope: string) {
  if (scope === "fleet") return "Whole fleet";
  for (const inst of d.topology.instances) { if (inst.id === scope) return inst.name; for (const dm of [inst.mgmt, ...inst.wlds]) if (dm.id === scope) return where(d, inst, dm.name); }
  return "(scope removed)";
}
function placeText(d: Design, place?: string) {
  if (!place || place === "auto") return "Automatic";
  const c = allClusters(d).find(x => x.c.id === place); return c ? where(d, c.inst, `${c.dm.name} / ${c.c.name}`) : place;
}
function drText(d: Design, to?: string) {
  if (!to) return "–";
  const c = allClusters(d).find(x => x.c.id === to); return c ? where(d, c.inst, `${c.dm.name} / ${c.c.name}`) : to;
}

/** All blocks of the HLD in reading order (sections and their subsections), for tests and renderers. */
export function walk(h: Hld): { s: Section; depth: number }[] {
  const out: { s: Section; depth: number }[] = [];
  const go = (s: Section, depth: number) => { out.push({ s, depth }); for (const x of s.sub || []) go(x, depth + 1); };
  for (const s of h.sections) go(s, 1);
  return out;
}
