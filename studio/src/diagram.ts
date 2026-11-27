// Architecture diagrams from the design: a layout model of boxes and links, laid out here once, then
// rendered as SVG (on the page, in the HLD, and as PNG) and as an editable draw.io file. Pure functions
// of the design → data / text (no DOM); tested.
import { NETWORK, NSX, isVsan } from "../../engine/src/index.ts";
import type { Design, SizingResult } from "../../engine/src/index.ts";
import { STORAGE } from "./fields.ts";
import { allClusters, effective, networksOf, hostsByCluster, nicsOf } from "./hostnet.ts";
import { allDomains, effectiveNsx, asns } from "./nsx.ts";
import { xml } from "./export/zip.ts";
import { productName } from "./flags.ts";

export type Kind = "instance" | "domain" | "cluster" | "edge" | "nsx" | "switch" | "router" | "note";
export interface Node { id: string; kind: Kind; x: number; y: number; w: number; h: number; title: string; lines: string[]; parent?: string }
export interface Link { from: string; to: string; label?: string; dashed?: boolean }
export interface Diagram { id: "topology" | "network"; title: string; w: number; h: number; nodes: Node[]; links: Link[] }

const LINE = 16, HEAD = 22, PAD = 12, GAP = 16;
const boxH = (lines: number) => HEAD + lines * LINE + PAD;
const nf = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 1 });

/** Instances side by side; in each, its domains side by side; in each domain, its clusters stacked. */
export function topologyDiagram(d: Design, r: SizingResult): Diagram {
  const hosts = hostsByCluster(r), nodes: Node[] = [], links: Link[] = [];
  const CW = 220, DW = CW + 2 * PAD;
  let x = 0, maxH = 0;
  for (const inst of d.topology.instances) {
    const doms = [inst.mgmt, ...inst.wlds], ix = x, iy = 0;
    let dx = ix + PAD, instH = 0;
    for (const dm of doms) {
      const nsx = dm.kind === "mgmt" ? "Management NSX" : dm.nsx === "dedicated" ? `Dedicated NSX (${dm.nsxSize})` : "NSX shared with management";
      const dLines = [`vCenter ${dm.vcSize || "per model"}`, nsx];
      let cy = iy + HEAD + PAD + boxH(dLines.length) - PAD;
      const children: Node[] = [];
      for (const c of dm.clusters) {
        const ht = d.hostTypes.find(h => h.id === c.hostType) || d.hostTypes[0];
        const rc = r.clusters.find(z => z.c.id === c.id);
        const lines = [`${hosts.get(c.id) || 0} hosts${ht ? ` · ${ht.name}` : ""}`,
          `${STORAGE[c.storage] || c.storage}${isVsan(c) && rc?.pol ? ` · ${rc.pol.label.replace(/ \(auto\)$/, "")}` : ""}`,
          ...(c.topo === "stretched" ? ["Stretched across two sites"] : []),
          ...(c.tierOn ? [`Memory tiering ${c.tierPct}%`] : []),
          ...(c.supOn ? ["vSphere Supervisor"] : [])];
        const n: Node = { id: `cl-${c.id}`, kind: "cluster", x: dx + PAD, y: cy, w: CW, h: boxH(lines.length), title: c.name, lines, parent: `dm-${dm.id}` };
        children.push(n); cy += n.h + GAP;
      }
      for (const e of dm.edges) {
        const n: Node = { id: `ed-${dm.id}-${e.id}`, kind: "edge", x: dx + PAD, y: cy, w: CW, h: boxH(1), title: `Edge cluster ${e.name}`,
          lines: [e.on === "bm" ? `${e.nodes} bare-metal edges` : `${e.nodes} × ${e.size} edge VMs on ${dm.clusters.find(c => c.id === e.on)?.name || "a cluster"}`], parent: `dm-${dm.id}` };
        children.push(n); cy += n.h + GAP;
      }
      const dh = cy - iy - HEAD - PAD + PAD - GAP + PAD;
      nodes.push({ id: `dm-${dm.id}`, kind: "domain", x: dx, y: iy + HEAD + PAD, w: DW, h: Math.max(dh, boxH(dLines.length)), title: `${dm.name} (${dm.kind === "mgmt" ? "management domain" : "workload domain"})`, lines: dLines, parent: `in-${inst.id}` }, ...children);
      instH = Math.max(instH, dh + HEAD + 2 * PAD);
      dx += DW + GAP;
    }
    const iw = dx - ix - GAP + PAD;
    nodes.unshift({ id: `in-${inst.id}`, kind: "instance", x: ix, y: iy, w: iw, h: instH, title: `${inst.name} · ${inst.profile || d.fleet.profile}`, lines: [] });
    x += iw + 2 * GAP; maxH = Math.max(maxH, instH);
  }
  return { id: "topology", title: "Fleet topology", w: Math.max(x - 2 * GAP, 200), h: Math.max(maxH, 60), nodes: order(nodes), links };
}

/** One band per domain: its clusters (switches and VMkernel networks), the top-of-rack switches, NSX connectivity and the upstream routers. */
export function networkDiagram(d: Design, r: SizingResult): Diagram {
  const hosts = hostsByCluster(r), nodes: Node[] = [], links: Link[] = [];
  const multi = d.topology.instances.length > 1;
  const COL = { cl: 0, tor: 350, nsx: 600, rtr: 880 }, CW = 290, W = 220;
  let y = 0;
  for (const { inst, dm } of allDomains(d)) {
    const v = effectiveNsx(d, dm), a = asns(d, dm), cen = v.model === "centralized", nodesN = dm.edges.reduce((s, e) => s + (e.nodes || 0), 0);
    const band = `bd-${dm.id}`, top = y + HEAD + PAD;
    let cy = top;
    const cls: Node[] = [];
    for (const c of dm.clusters) {
      const ev = effective(d, c), m = NETWORK.vdsModels[ev.vds], row = (k: string) => d.plan.rows[`${c.id}:${k}`] || {};
      const keyOf: Record<string, string> = { "ESX management": "esx", vMotion: "vmotion", vSAN: "vsan", "Host TEP (NSX overlay)": "tep" };
      const lines = [`${nicsOf(d, c.hostType)} × ${ev.nicGbps} Gb/s · ${m.vds === 2 ? "2 switches" : "1 switch"} · MTU ${ev.mtu}`,
        ...networksOf(d, c, hosts.get(c.id) || 0).map(n => { const p = row(keyOf[n.net] || ""); return `${n.net.replace(" (NSX overlay)", "")}: ${p.vlan ? `VLAN ${p.vlan}` : "VLAN to enter"}${p.cidr ? ` · ${p.cidr}` : ""}`; })];
      const n: Node = { id: `nc-${c.id}`, kind: "cluster", x: COL.cl, y: cy, w: CW, h: boxH(lines.length), title: `${c.name} (${hosts.get(c.id) || 0} hosts)`, lines, parent: band };
      cls.push(n); cy += n.h + GAP;
    }
    const tor: Node = { id: `tor-${dm.id}`, kind: "switch", x: COL.tor, y: top, w: W - 20, h: boxH(2), title: "Top-of-rack switches", lines: ["VLAN trunks to hosts", "Gateways for host networks"], parent: band };
    const nsxLines = cen
      ? [`Tier-0 gateway, ${v.t0Ha === "aa" ? "active-active" : "active-standby"}`, nodesN ? `${nodesN} edge nodes` : "No edges yet", "Peering VLANs A and B", `VPC external block /${v.extPrefix}`]
      : [`Transit gateway, ${v.tgwHa === "aa" ? "active-active" : "active-standby"}`, "No edges needed", "On the external VLAN", `VPC external block /${v.extPrefix}`];
    const nsx: Node = { id: `nsx-${dm.id}`, kind: "nsx", x: COL.nsx, y: top, w: W, h: boxH(nsxLines.length), title: `NSX: ${NSX.models[v.model as keyof typeof NSX.models]?.label.split(" (")[0] || v.model}`, lines: nsxLines, parent: band };
    const rtr: Node = { id: `rtr-${dm.id}`, kind: "router", x: COL.rtr, y: top, w: W, h: boxH(cen ? 2 : 1), title: "Upstream routers", lines: cen ? [a.peerAsn ? `ASN ${a.peerAsn}` : "ASN to enter", `BGP with Tier-0${a.localAsn ? ` (ASN ${a.localAsn})` : ""}${v.bfd ? ", BFD" : ""}`] : ["External VLAN gateway"], parent: band };
    const bh = Math.max(cy - GAP, top + Math.max(tor.h, nsx.h, rtr.h)) - y + PAD;
    nodes.push({ id: band, kind: "domain", x: -PAD, y, w: COL.rtr + W + 2 * PAD, h: bh, title: multi ? `${inst.name} / ${dm.name}` : dm.name, lines: [] }, ...cls, tor, nsx, rtr);
    for (const n of cls) links.push({ from: n.id, to: tor.id });
    links.push(cen ? { from: nsx.id, to: rtr.id } : { from: nsx.id, to: tor.id });
    if (cen) links.push({ from: nsx.id, to: tor.id, dashed: true });
    y += bh + 2 * GAP;
  }
  return { id: "network", title: "Network", w: COL.rtr + W + PAD, h: Math.max(y - 2 * GAP, 60), nodes: order(nodes), links };
}

// containers first, so they draw behind what they hold
const RANK: Record<Kind, number> = { instance: 0, domain: 1, cluster: 2, edge: 2, nsx: 2, switch: 2, router: 2, note: 3 };
const order = (ns: Node[]) => [...ns].sort((a, b) => RANK[a.kind] - RANK[b.kind]);

// ---------- SVG ----------
const FILL: Record<Kind, [fill: string, stroke: string]> = {
  instance: ["#f4f7fb", "#9fb3c8"], domain: ["#ffffff", "#7a93ad"], cluster: ["#e8f1fb", "#3b78b5"], edge: ["#fff4e5", "#c77d1a"],
  nsx: ["#eef7ee", "#3f8f4a"], switch: ["#f1eefa", "#6b55b3"], router: ["#f1eefa", "#6b55b3"], note: ["#ffffff", "#bbbbbb"],
};
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
/** Where a link leaves a box: the side facing the other box, level with it where the two overlap. */
const anchor = (n: Node, to: Node) => {
  const tx = to.x + to.w / 2, ty = to.y + to.h / 2;
  if (to.x >= n.x + n.w || to.x + to.w <= n.x) return { x: tx > n.x + n.w / 2 ? n.x + n.w : n.x, y: clamp(ty, n.y + 14, n.y + n.h - 14) };
  return { x: clamp(tx, n.x + 14, n.x + n.w - 14), y: ty > n.y + n.h / 2 ? n.y + n.h : n.y };
};

/** The diagram as a standalone SVG document. */
export function toSvg(g: Diagram): string {
  const M = 24, W = g.w + 2 * M, H = g.h + 2 * M + 28, by = new Map(g.nodes.map(n => [n.id, n]));
  const box = (n: Node) => { const [f, s] = FILL[n.kind], container = n.kind === "instance" || n.kind === "domain";
    return `<g><rect x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" rx="${container ? 10 : 6}" fill="${f}" stroke="${s}" stroke-width="${container ? 1.2 : 1.5}"/>` +
      `<text x="${n.x + 10}" y="${n.y + 16}" font-weight="600" font-size="${n.kind === "instance" ? 14 : 12.5}" fill="#1f2d3d">${xml(n.title)}</text>` +
      n.lines.map((l, i) => `<text x="${n.x + 10}" y="${n.y + HEAD + 12 + i * LINE}" font-size="11.5" fill="#3a4a5c">${xml(l)}</text>`).join("") + `</g>`; };
  const link = (l: Link) => { const a = by.get(l.from), b = by.get(l.to); if (!a || !b) return "";
    const p = anchor(a, b), q = anchor(b, a), mx = (p.x + q.x) / 2, my = (p.y + q.y) / 2;
    return `<line x1="${p.x}" y1="${p.y}" x2="${q.x}" y2="${q.y}" stroke="#5b6b7c" stroke-width="1.4"${l.dashed ? ` stroke-dasharray="5 4"` : ""}/>` +
      (l.label ? `<rect x="${mx - l.label.length * 3.3 - 4}" y="${my - 9}" width="${l.label.length * 6.6 + 8}" height="16" rx="3" fill="#ffffff" opacity="0.92"/><text x="${mx}" y="${my + 3}" font-size="10.5" text-anchor="middle" fill="#3a4a5c">${xml(l.label)}</text>` : ""); };
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="Segoe UI, Helvetica, Arial, sans-serif">` +
    `<rect width="${W}" height="${H}" fill="#ffffff"/><text x="${M}" y="${M + 4}" font-size="16" font-weight="700" fill="#1f3a5f">${xml(g.title)}</text>` +
    `<g transform="translate(${M + (g.nodes.some(n => n.x < 0) ? 12 : 0)},${M + 28})">${g.nodes.map(box).join("")}${g.links.map(link).join("")}</g></svg>`;
}

// ---------- draw.io ----------
/** The diagram as a draw.io file (uncompressed mxGraph XML): every box and link is editable. */
export function toDrawio(g: Diagram): string {
  const id = (s: string) => xml(s.replace(/[^A-Za-z0-9_-]/g, "_")), byId = new Map(g.nodes.map(n => [n.id, n]));
  const cells = g.nodes.map(n => {
    const [f, s] = FILL[n.kind], container = n.kind === "instance" || n.kind === "domain", par = n.parent && byId.get(n.parent);
    const x = par ? n.x - par.x : n.x, y = par ? n.y - par.y : n.y;
    const value = `<b>${xml(n.title)}</b>${n.lines.map(l => `<br>${xml(l)}`).join("")}`;
    const style = `rounded=1;arcSize=${container ? 4 : 8};whiteSpace=wrap;html=1;align=left;verticalAlign=top;spacingLeft=8;spacingTop=2;fillColor=${f};strokeColor=${s};fontSize=11;${container ? "container=1;collapsible=0;" : ""}`;
    return `<mxCell id="${id(n.id)}" value="${xml(value)}" style="${style}" vertex="1" parent="${par ? id(par.id) : "1"}"><mxGeometry x="${x}" y="${y}" width="${n.w}" height="${n.h}" as="geometry"/></mxCell>`;
  });
  const edges = g.links.map((l, i) => `<mxCell id="lk${i}" value="${xml(l.label || "")}" style="endArrow=none;html=1;fontSize=10;strokeColor=#5b6b7c;${l.dashed ? "dashed=1;" : ""}labelBackgroundColor=#ffffff;" edge="1" parent="1" source="${id(l.from)}" target="${id(l.to)}"><mxGeometry relative="1" as="geometry"/></mxCell>`);
  return `<mxfile host="${xml(productName())}"><diagram id="${g.id}" name="${xml(g.title)}"><mxGraphModel dx="1200" dy="800" grid="1" gridSize="10" guides="1" page="0"><root>` +
    `<mxCell id="0"/><mxCell id="1" parent="0"/>${cells.join("")}${edges.join("")}</root></mxGraphModel></diagram></mxfile>`;
}

export function diagrams(d: Design, r: SizingResult): Diagram[] {
  return d.topology.instances.length ? [topologyDiagram(d, r), networkDiagram(d, r)] : [];
}
