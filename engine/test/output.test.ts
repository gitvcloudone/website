// Step 7: design outputs. The HLD content, the Word, Excel, SVG and draw.io writers, the prerequisites,
// the exporter registry, and the Design output page.
import { test } from "node:test";
import assert from "node:assert/strict";
import { crc32 } from "node:zlib";
import * as engine from "../src/index.ts";
import * as store from "../../studio/src/store.ts";
import * as flags from "../../studio/src/flags.ts";
import { CASES } from "../fixtures/cases.mjs";
import { buildInputs } from "../baseline/harness.mjs";
import { fakeFiles } from "../baseline/rvtools-files.mjs";
import { buildHld, walk } from "../../studio/src/hld.ts";
import type { Block } from "../../studio/src/hld.ts";
import { hldDocx } from "../../studio/src/export/docx.ts";
import { hldHtml } from "../../studio/src/export/html.ts";
import { workbook } from "../../studio/src/export/xlsx.ts";
import { zip } from "../../studio/src/export/zip.ts";
import { EXPORTERS, slug } from "../../studio/src/export/index.ts";
import { diagrams, toSvg, toDrawio, topologyDiagram, networkDiagram } from "../../studio/src/diagram.ts";
import { prerequisites, TEAMS } from "../../studio/src/prereqs.ts";
import { stepHtml } from "../../studio/src/guided.ts";

const caseDesign = (name: string) => {
  const i = buildInputs(engine, CASES.find(x => x.name === name)!, fakeFiles());
  const r = engine.loadDesign({ v: 1, tool: "vcf", settings: i.S, hostTypes: i.hostTypes, topo: i.topo, groups: i.groups });
  if (r.kind !== "design") throw new Error(); return r.design;
};
const must = (d: engine.Design, ops: store.Op[]) => { const o = store.propose(d, { source: "test", ops }); if (!o.ok) throw new Error(o.error); return o.design; };
const SIZED = CASES.filter(c => c.topo && c.hostTypes).map(c => c.name);
const ui = { sel: "", closed: new Set() } as never;

/** Read a stored zip (what ours writes): entries by name, every CRC checked against Node's own. */
function unzip(b: Uint8Array) {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength), dec = new TextDecoder(), out = new Map<string, Uint8Array>();
  let p = 0;
  while (v.getUint32(p, true) === 0x04034b50) {
    const crc = v.getUint32(p + 14, true), size = v.getUint32(p + 18, true), n = v.getUint16(p + 26, true), x = v.getUint16(p + 28, true);
    const name = dec.decode(b.subarray(p + 30, p + 30 + n)), data = b.subarray(p + 30 + n + x, p + 30 + n + x + size);
    assert.equal(v.getUint16(p + 8, true), 0, `${name}: stored`); assert.equal(crc32(data) >>> 0, crc, `${name}: CRC`);
    out.set(name, data); p += 30 + n + x + size;
  }
  assert.equal(v.getUint32(p, true), 0x02014b50, "central directory follows the entries");
  return { names: [...out.keys()], text: (k: string) => dec.decode(out.get(k)!), bytes: (k: string) => out.get(k) };
}
/** Well-formed XML: every tag closed in order, attributes quoted, no stray "&". */
function wellFormed(x: string, what: string) {
  const body = x.replace(/^<\?xml[^>]*\?>/, ""), stack: string[] = [];
  assert.doesNotMatch(body, /&(?!(amp|lt|gt|quot|apos|#\d+|#x[0-9a-f]+);)/i, `${what}: stray &`);
  for (const m of body.matchAll(/<(\/?)([A-Za-z_][\w:.-]*)((?:\s+[\w:.-]+="[^"]*")*)\s*(\/?)>/g)) {
    if (m[1]) assert.equal(stack.pop(), m[2], `${what}: </${m[2]}> closes the wrong tag`);
    else if (!m[4]) stack.push(m[2]);
  }
  assert.deepStrictEqual(stack, [], `${what}: unclosed tags`);
  assert.equal(body.replace(/<(\/?)([A-Za-z_][\w:.-]*)((?:\s+[\w:.-]+="[^"]*")*)\s*(\/?)>/g, "").includes("<"), false, `${what}: a tag that doesn't parse`);
}
const texts = (b: Block): string[] => b.t === "p" || b.t === "tbd" ? [b.text] : b.t === "list" ? b.items : b.t === "table" ? [...b.head, ...b.rows.flat()] : [b.caption];

test("HLD: every section CLAUDE.md lists, for every sized test design, with no undefined or NaN", () => {
  const want = ["Executive summary", "Requirements, assumptions, constraints and risks", "Fleet, instance, domain and cluster design", "Host and storage design",
    "Identity and access", "Network design", "Add-ons", "Capacity analysis", "Bill of materials and licensing", "Design decisions", "Best-practice scorecard", "Prerequisites", "Appendix: method and sources"];
  for (const name of SIZED) {
    const d = caseDesign(name), h = buildHld(d, store.sizeDesign(d), "2026-11-27");
    assert.deepStrictEqual(h.sections.map(s => s.title), want, name);
    for (const { s } of walk(h)) for (const b of s.blocks) for (const t of texts(b)) assert.doesNotMatch(String(t), /undefined|NaN|\[object/, `${name} / ${s.title}: "${t}"`);
    for (const { s } of walk(h)) for (const b of s.blocks) if (b.t === "table") for (const r of b.rows) assert.equal(r.length, b.head.length, `${name} / ${s.title}: row width`);
  }
});

test("HLD: a skipped step is marked To be defined in its section and listed as an open item", () => {
  let d = caseDesign("simple-basic");
  d = must(d, [{ op: "set", path: ["decisions", "steps"], value: { nsx: "skipped", identity: "skipped" } }]);
  const h = buildHld(d, store.sizeDesign(d), "2026-11-27"), by = new Map(walk(h).map(x => [x.s.id, x.s]));
  assert.ok(by.get("net-nsx")!.blocks.some(b => b.t === "tbd" && /NSX & connectivity step was skipped/.test(b.text)));
  assert.ok(by.get("identity")!.blocks.some(b => b.t === "tbd" && /Identity & access step was skipped/.test(b.text)));
  assert.ok(by.get("req-risks")!.blocks.some(b => b.t === "tbd" && /NSX & connectivity was skipped/.test(b.text)));
  assert.match(h.status, /open items/);
  assert.ok(by.get("summary")!.blocks.some(b => b.t === "list" && b.items.some(t => /Still to define: Identity & access, NSX & connectivity/.test(t))));
});

test("HLD: the numbers are the sizing's, and licensing counts at least 16 cores per CPU", () => {
  const d = caseDesign("multi-instance"), r = store.sizeDesign(d), h = buildHld(d, r, "2026-11-27");
  const exec = walk(h).find(x => x.s.id === "summary")!.s, txt = exec.blocks.flatMap(texts).join(" ");
  assert.match(txt, new RegExp(`${r.hosts.toLocaleString("en-US")} hosts`)); assert.match(txt, new RegExp(`${r.licCores.toLocaleString("en-US")} VCF cores`));
  const bom = walk(h).find(x => x.s.id === "bom")!.s, lic = bom.blocks.filter(b => b.t === "table")[1] as Extract<Block, { t: "table" }>;
  assert.equal(lic.rows[0][1], `${r.lic.licCores.toLocaleString("en-US")} cores`);
  assert.ok(r.lic.licCores >= r.clusters.reduce((a, x) => a + x.total * x.c.hw.sockets * 16, 0), "16-core minimum per CPU");
});

test("zip: entries and CRCs read back exactly", () => {
  const z = unzip(zip([{ name: "a.txt", data: "hello" }, { name: "dir/b.bin", data: new Uint8Array([0, 1, 2, 255]) }]));
  assert.deepStrictEqual(z.names, ["a.txt", "dir/b.bin"]); assert.equal(z.text("a.txt"), "hello"); assert.deepStrictEqual([...z.bytes("dir/b.bin")!], [0, 1, 2, 255]);
});

test("Word: a valid .docx with every section heading, the cover, and diagrams embedded when given", () => {
  for (const name of ["simple-basic", "multi-instance", "stretched"]) {
    const d = caseDesign(name), h = buildHld(d, store.sizeDesign(d), "2026-11-27");
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10]);
    const z = unzip(hldDocx(h, { topology: { png, w: 800, h: 400 }, network: { png, w: 2000, h: 900 } }));
    for (const part of ["[Content_Types].xml", "_rels/.rels", "word/document.xml", "word/styles.xml", "word/numbering.xml", "word/settings.xml", "word/footer1.xml", "word/_rels/document.xml.rels", "docProps/core.xml", "word/media/topology.png", "word/media/network.png"])
      assert.ok(z.names.includes(part), `${name}: ${part}`);
    for (const part of z.names.filter(n => /\.xml$|\.rels$/.test(n))) wellFormed(z.text(part), `${name} ${part}`);
    const doc = z.text("word/document.xml");
    for (const { s } of walk(h)) assert.ok(doc.includes(s.title.replace(/&/g, "&amp;")), `${name}: heading ${s.title}`);
    assert.match(doc, /w:pStyle w:val="Heading1"/); assert.match(doc, /TOC \\o/); assert.match(doc, new RegExp(h.customer));
    const ext = [...doc.matchAll(/<wp:extent cx="(\d+)"/g)].map(m => Number(m[1]));
    assert.ok(ext.length === 2 && ext.every(cx => cx <= Math.round((10080 / 1440) * 96 * 9525) + 1), `${name}: images fit the page width`);
    const plain = unzip(hldDocx(h));
    assert.ok(!plain.names.some(n => n.startsWith("word/media/")), "no images when none given");
    assert.match(plain.text("word/document.xml"), /download it from the Design output page/);
  }
});

test("Excel: valid workbooks; the prerequisite sheet has a row per prerequisite and columns to fill in", () => {
  const z = unzip(workbook([{ name: "A/B: c", head: ["x", "n"], rows: [["a & <b>", 1.5], ["", 0]] }]));
  for (const n of z.names.filter(n => n.endsWith(".xml") || n.endsWith(".rels"))) wellFormed(z.text(n), n);
  assert.match(z.text("xl/workbook.xml"), /name="A B  c"/, "sheet names cleaned of characters Excel refuses");
  assert.match(z.text("xl/worksheets/sheet1.xml"), /<v>1.5<\/v>/); assert.match(z.text("xl/worksheets/sheet1.xml"), /a &amp; &lt;b&gt;/);
  const d = caseDesign("vdefend-atp"), r = store.sizeDesign(d);
  const pre = unzip(EXPORTERS.find(e => e.id === "prereqs-xlsx")!.build!(d, r, "2026-11-27").data as Uint8Array);
  const rows = pre.text("xl/worksheets/sheet1.xml").match(/<row /g)!.length;
  assert.equal(rows, prerequisites(d, r).length + 1);
  assert.match(pre.text("xl/worksheets/sheet1.xml"), />Owner</); assert.match(pre.text("xl/worksheets/sheet1.xml"), />Due date</);
  const plan = unzip(EXPORTERS.find(e => e.id === "ipplan-xlsx")!.build!(d, r, "2026-11-27").data as Uint8Array);
  assert.match(plan.text("xl/workbook.xml"), /IP and VLAN plan/); assert.match(plan.text("xl/workbook.xml"), /DNS records/);
});

test("prerequisites: by owning team, Done exactly when the design holds what's needed", () => {
  let d = caseDesign("simple-basic"), r = store.sizeDesign(d), pre = prerequisites(d, r);
  assert.ok(pre.every(x => TEAMS.includes(x.team) && x.item && x.detail));
  const dns = () => pre.find(x => x.item.startsWith("DNS servers"))!;
  assert.equal(dns().done, false);
  d = must(d, [{ op: "set", path: ["network", "dns"], value: "10.0.0.53, 10.0.0.54" }]); r = store.sizeDesign(d); pre = prerequisites(d, r);
  assert.equal(dns().done, true); assert.match(dns().detail, /10\.0\.0\.53/);
  assert.ok(pre.some(x => x.team === "Servers" && /hosts:/.test(x.item)), "hosts to buy");
  assert.ok(pre.some(x => x.team === "Licensing and Broadcom" && x.detail.includes(`${r.lic.licCores.toLocaleString("en-US")} cores`)));
  const fc = caseDesign("ha-small-nfs-fc"), fr = store.sizeDesign(fc);
  assert.ok(prerequisites(fc, fr).some(x => x.team === "Storage"), "external storage needs the storage team");
});

test("diagrams: every cluster drawn, boxes inside their containers, siblings never overlapping; SVG and draw.io well-formed", () => {
  for (const name of SIZED) {
    const d = caseDesign(name), r = store.sizeDesign(d);
    for (const g of [topologyDiagram(d, r), networkDiagram(d, r)]) {
      const by = new Map(g.nodes.map(n => [n.id, n]));
      for (const n of g.nodes) if (n.parent) { const p = by.get(n.parent)!;
        assert.ok(n.x >= p.x && n.y >= p.y && n.x + n.w <= p.x + p.w + 0.5 && n.y + n.h <= p.y + p.h + 0.5, `${name} ${g.id}: ${n.id} inside ${p.id}`); }
      const kids = new Map<string, typeof g.nodes>(); for (const n of g.nodes) kids.set(n.parent || "", [...(kids.get(n.parent || "") || []), n]);
      for (const sib of kids.values()) for (let i = 0; i < sib.length; i++) for (let j = i + 1; j < sib.length; j++) {
        const a = sib[i], b = sib[j];
        assert.ok(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y, `${name} ${g.id}: ${a.id} overlaps ${b.id}`);
      }
      for (const l of g.links) assert.ok(by.has(l.from) && by.has(l.to), `${name} ${g.id}: link ends exist`);
      wellFormed(toSvg(g), `${name} ${g.id}.svg`);
      const x = toDrawio(g); wellFormed(x, `${name} ${g.id}.drawio`);
      const ids = new Set([...x.matchAll(/<mxCell id="([^"]+)"/g)].map(m => m[1]));
      for (const m of x.matchAll(/(?:parent|source|target)="([^"]+)"/g)) assert.ok(ids.has(m[1]), `${name} ${g.id}.drawio: ${m[1]} exists`);
    }
    const topo = topologyDiagram(d, r);
    for (const { c } of d.topology.instances.flatMap(i => [i.mgmt, ...i.wlds]).flatMap(dm => dm.clusters.map(c => ({ c })))) assert.ok(topo.nodes.some(n => n.id === `cl-${c.id}`), `${name}: ${c.name} drawn`);
  }
  assert.deepStrictEqual(diagrams(engine.newDesign(), store.sizeDesign(engine.newDesign())), [], "nothing to draw without a topology");
});

test("exporters: each has a feature flag, builds a named, non-empty file, and turning its flag off hides its button", () => {
  for (const e of EXPORTERS) assert.ok(e.feature in flags.FEATURES, `${e.id}: flag`);
  const d = must(caseDesign("addons"), [{ op: "set", path: ["project", "customer"], value: "Acme Bank & Trust" }]), r = store.sizeDesign(d);
  assert.equal(slug(d), "acme-bank-trust");
  for (const e of EXPORTERS.filter(x => x.how === "file")) {
    const o = e.build!(d, r, "2026-11-27");
    assert.ok(o.data.length > 100, `${e.id}: content`); assert.match(o.name, /^acme-bank-trust-[\w-]+\.(docx|svg|drawio|xlsx)$/, `${e.id}: ${o.name}`);
  }
  const page = stepHtml(d, r, ui, "output");
  for (const e of EXPORTERS) assert.match(page, new RegExp(`data-export="${e.id}"`), `${e.id}: button`);
  try {
    flags.setOverrides({ exportWord: false, exportDiagrams: false });
    const off = stepHtml(d, r, ui, "output");
    assert.doesNotMatch(off, /data-export="hld-docx"/); assert.doesNotMatch(off, /data-export="topology-svg"/); assert.match(off, /data-export="prereqs-xlsx"/);
  } finally { flags.setOverrides({}); }
});

test("Design output page: downloads, diagrams, the IP plan and the HLD preview; Review links to it", () => {
  const d = caseDesign("simple-basic"), r = store.sizeDesign(d), page = stepHtml(d, r, ui, "output");
  assert.match(page, /<h3>Downloads<\/h3>/); assert.match(page, /<figure class="diagram"><svg/); assert.match(page, /id="plan"/); assert.match(page, /<article class="hld">/);
  assert.doesNotMatch(page, /comes in a later build step/);
  const review = stepHtml(d, r, ui, "review");
  assert.doesNotMatch(review, /href="#plan"/, "the old #plan link fell through the router to Start");
  assert.match(review, /href="#\/step\/output"/);
  const empty = engine.newDesign(); assert.match(stepHtml(empty, store.sizeDesign(empty), ui, "output"), /need a sized design/);
  const html = hldHtml(buildHld(d, r, "2026-11-27"), { topology: "<svg></svg>" });
  assert.doesNotMatch(html, /href="#hld-/, "no in-page links that the hash router would catch");
});
