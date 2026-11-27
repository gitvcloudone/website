// Built from TypeScript by studio/build.mjs. Edit the .ts source, then run npm run build.
// The exporters: every downloadable output of a design, registered in one list. Each says what feature
// flag gates it, its file name and how to build it. Pure builders (no DOM); the page adds the two
// browser-only steps: PNG (an SVG drawn on a canvas) and PDF (the browser's print of the HLD preview).
                                                                         
                                           
import { buildHld } from "../hld.js";
import { hldDocx } from "./docx.js";
                                          
import { workbook } from "./xlsx.js";
import { diagrams, toSvg, toDrawio } from "../diagram.js";
import { prerequisites } from "../prereqs.js";
import { planNets, dnsRecords } from "../ip.js";

                                                              
                                                                                 
/** how: "file" builds bytes here; "png" needs the page to draw the SVG on a canvas; "print" opens the browser's print of the HLD. */
                           
                                                                                           
                                                                                      
                                                                                                                           
                                  
                                   
 

const MIME = { docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", svg: "image/svg+xml", drawio: "application/xml" };
/** "acme-bank" from the customer name, for file names. */
export const slug = (d        ) => (d.project.customer.trim() || "vcf-design").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "vcf-design";

const diagramOf = (d        , r              , id                        ) => diagrams(d, r).find(g => g.id === id) ;
const DIAG_LABEL = { topology: "Topology", network: "Network" }         ;

export const EXPORTERS             = [
  { id: "hld-docx", group: "Design document", label: "Word (.docx)", feature: "exportWord", how: "file",
    build: (d, r, date, images) => ({ data: hldDocx(buildHld(d, r, date), images), mime: MIME.docx, name: `${slug(d)}-hld.docx` }) },
  { id: "hld-pdf", group: "Design document", label: "PDF (print)", feature: "exportPdf", how: "print" },
  ...(["topology", "network"]         ).flatMap((id)             => [
    { id: `${id}-svg`, group: "Diagrams", label: `${DIAG_LABEL[id]}: SVG`, feature: "exportDiagrams", how: "file", diagram: id,
      build: (d, r) => ({ data: toSvg(diagramOf(d, r, id)), mime: MIME.svg, name: `${slug(d)}-${id}.svg` }) },
    { id: `${id}-png`, group: "Diagrams", label: `${DIAG_LABEL[id]}: PNG`, feature: "exportDiagrams", how: "png", diagram: id },
    { id: `${id}-drawio`, group: "Diagrams", label: `${DIAG_LABEL[id]}: draw.io`, feature: "exportDiagrams", how: "file", diagram: id,
      build: (d, r) => ({ data: toDrawio(diagramOf(d, r, id)), mime: MIME.drawio, name: `${slug(d)}-${id}.drawio` }) },
  ]),
  { id: "prereqs-xlsx", group: "Tables", label: "Prerequisites checklist (Excel)", feature: "exportTables", how: "file",
    build: (d, r) => ({ data: prereqWorkbook(d, r), mime: MIME.xlsx, name: `${slug(d)}-prerequisites.xlsx` }) },
  { id: "ipplan-xlsx", group: "Tables", label: "IP / VLAN / DNS plan (Excel)", feature: "exportTables", how: "file",
    build: (d, r) => ({ data: planWorkbook(d, r), mime: MIME.xlsx, name: `${slug(d)}-ip-vlan-dns.xlsx` }) },
];

/** The prerequisite checklist with columns for the owner and due date to fill in. */
export function prereqWorkbook(d        , r              ) {
  return workbook([{ name: "Prerequisites", head: ["Team", "Prerequisite", "Detail", "Status", "Owner", "Due date", "Notes"],
    rows: prerequisites(d, r).map(x => [x.team, x.item, x.detail, x.done ? "Done" : "To do", "", "", ""]), widths: [20, 48, 70, 10, 18, 12, 30] }]);
}

/** The IP / VLAN plan and the DNS records, one sheet each. */
export function planWorkbook(d        , r              ) {
  const nets = planNets(d, r);
  return workbook([
    { name: "IP and VLAN plan", head: ["Instance", "Network", "Where", "Type", "VLAN", "Subnet", "Gateway", "Addresses today", "Recommended size"],
      rows: nets.map(n => { const row = d.plan.rows[n.key] || {};
        return [n.inst.name, n.name, n.where, n.kind === "block" ? "IP block" : "VLAN", n.kind === "block" ? "" : row.vlan ?? "", row.cidr || "", n.kind === "block" ? "" : row.gw || "", n.need || "", `/${n.prefix}`]; }) },
    { name: "DNS records", head: ["Instance", "Component", "FQDNs", "IP addresses", "Network"],
      rows: dnsRecords(d, r).map(x => [x.inst.name, x.label, x.fqdn, x.ips, nets.find(n => n.key === x.net)?.name || x.net]) },
  ]);
}
