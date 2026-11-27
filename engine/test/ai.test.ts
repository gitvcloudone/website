// Step 9: the AI layer, tested with a stand-in API (no key, no network). The AI suggests and explains;
// the engine decides; customer facts and real names stay home.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import * as engine from "../src/index.ts";
import * as store from "../../studio/src/store.ts";
import * as flags from "../../studio/src/flags.ts";
import { CASES } from "../fixtures/cases.mjs";
import { buildInputs } from "../baseline/harness.mjs";
import { fakeFiles } from "../baseline/rvtools-files.mjs";
import { keyConnector, hostedConnector, loadAi, saveAi, aiReady, connectorFor, DEFAULT_AI } from "../../studio/src/ai/connector.ts";
import type { AiRequest, AiResponse, Connector, ContentBlock } from "../../studio/src/ai/connector.ts";
import { redactorFor, backDeep } from "../../studio/src/ai/redact.ts";
import { catalog, coerce } from "../../studio/src/ai/catalog.ts";
import { TOOLS, changesToOps, designSummary, impactOf } from "../../studio/src/ai/tools.ts";
import type { Suggestion } from "../../studio/src/ai/tools.ts";
import { ask, trimHistory, COPILOT_SYSTEM } from "../../studio/src/ai/copilot.ts";
import { draft, writerFacts } from "../../studio/src/ai/writer.ts";
import { copilotHtml, writerHtml, aiView, textHtml } from "../../studio/src/ai/panel.ts";
import { decisionRegister, evaluate } from "../../studio/src/rules.ts";
import { buildHld, walk, designSnap } from "../../studio/src/hld.ts";
import { hldDocx } from "../../studio/src/export/docx.ts";
import { stepHtml } from "../../studio/src/guided.ts";
import { toDrawio, topologyDiagram } from "../../studio/src/diagram.ts";
import { snapOf } from "../../studio/src/snap.ts";

const caseDesign = (name: string) => {
  const i = buildInputs(engine, CASES.find(x => x.name === name)!, fakeFiles());
  const r = engine.loadDesign({ v: 1, tool: "vcf", settings: i.S, hostTypes: i.hostTypes, topo: i.topo, groups: i.groups });
  if (r.kind !== "design") throw new Error(); return r.design;
};
const must = (d: engine.Design, ops: store.Op[]) => { const o = store.propose(d, { source: "test", ops }); if (!o.ok) throw new Error(o.error); return o.design; };
/** A design with things that identify the customer. */
const acme = () => {
  let d = caseDesign("simple-basic");
  d = must(d, [{ op: "set", path: ["project", "customer"], value: "Acme Bank" }, { op: "set", path: ["project", "site"], value: "Ashburn" },
    { op: "set", path: ["project", "notes"], value: "Secret merger with Initech" },
    { op: "set", path: ["workload", "groups", 0, "name"], value: "Core banking" },
    { op: "set", path: ["network", "domain"], value: "acme.local" }, { op: "set", path: ["network", "dns"], value: "10.9.8.7" }, { op: "set", path: ["network", "ntp"], value: "10.9.8.6" }]);
  return d;
};
/** A stand-in API that replies from a script and records every request. */
function fakeApi(script: ((req: AiRequest) => AiResponse)[]) {
  const seen: AiRequest[] = [];
  const conn: Connector = { label: "fake", async send(req) { seen.push(structuredClone(req)); const f = script.shift(); if (!f) throw new Error("script ran out"); return f(req); } };
  return { conn, seen };
}
const say = (text: string): AiResponse => ({ content: [{ type: "text", text }], stop_reason: "end_turn" });
const call = (...uses: [string, Record<string, unknown>][]): AiResponse => ({ content: uses.map(([name, input], i) => ({ type: "tool_use", id: `t${i}${name}`, name, input }) as ContentBlock), stop_reason: "tool_use" });
const ids = () => { let n = 0; return () => `s${++n}`; };

test("connector: own key goes only to Anthropic with the browser-access header; errors in plain words; hosted plug uses sign-in cookies", async () => {
  const calls: { url: string; init: RequestInit }[] = [];
  const ok = (body: unknown, status = 200) => async (url: string, init: RequestInit) => { calls.push({ url, init }); return new Response(JSON.stringify(body), { status }); };
  const res = await keyConnector("sk-ant-test", ok({ content: [{ type: "text", text: "hi" }], stop_reason: "end_turn" })).send({ model: "m", max_tokens: 10, system: "s", messages: [] });
  assert.equal(res.stop_reason, "end_turn");
  const h = calls[0].init.headers as Record<string, string>;
  assert.equal(calls[0].url, "https://api.anthropic.com/v1/messages"); assert.equal(h["x-api-key"], "sk-ant-test");
  assert.equal(h["anthropic-dangerous-direct-browser-access"], "true"); assert.equal(h["anthropic-version"], "2023-06-01");
  await assert.rejects(keyConnector("sk-ant-x", ok({ error: { message: "invalid x-api-key" } }, 401)).send({ model: "m", max_tokens: 1, system: "", messages: [] }), /API key wasn't accepted/);
  await assert.rejects(keyConnector("sk-ant-x", async () => { throw new TypeError("fetch failed"); }).send({ model: "m", max_tokens: 1, system: "", messages: [] }), /Couldn't reach the Claude API/);
  calls.length = 0;
  await hostedConnector("https://ai.example/api", ok(say("x"))).send({ model: "m", max_tokens: 1, system: "", messages: [] });
  assert.equal(calls[0].url, "https://ai.example/api"); assert.equal(calls[0].init.credentials, "include"); assert.equal((calls[0].init.headers as Record<string, string>)["x-api-key"], undefined, "no key in the browser for the hosted plug");
});

test("AI settings: off by default; the key is saved only when asked to remember it", () => {
  const m: Record<string, string> = {}, st = { getItem: (k: string) => m[k] ?? null, setItem: (k: string, v: string) => { m[k] = v; }, removeItem: (k: string) => { delete m[k]; } };
  assert.deepStrictEqual(loadAi(st), DEFAULT_AI); assert.equal(aiReady(DEFAULT_AI), false); assert.equal(connectorFor(DEFAULT_AI), null);
  saveAi(st, { ...DEFAULT_AI, plug: "key", key: "sk-ant-secret", remember: false });
  assert.doesNotMatch(m["vcfStudio.ai"], /sk-ant-secret/); assert.equal(loadAi(st).key, "");
  saveAi(st, { ...DEFAULT_AI, plug: "key", key: "sk-ant-secret", remember: true });
  assert.equal(loadAi(st).key, "sk-ant-secret"); assert.ok(aiReady(loadAi(st)));
  assert.equal(aiReady({ ...DEFAULT_AI, plug: "key", key: "not-a-key" }), false);
  assert.equal(loadAi({ ...st, getItem: () => "{broken" }).plug, "off");
});

test("stand-in names: customer details go out swapped and come back real; addresses and notes never go out", () => {
  const d = acme(), red = redactorFor(d, true), sent = red.out(JSON.stringify(designSummary(d)));
  for (const real of ["Acme Bank", "Ashburn", "Core banking", "acme.local", "10.9.8.7", "10.9.8.6", "Initech"]) assert.ok(!sent.includes(real), `${real} not sent`);
  for (const stand of ["Customer A", "Site A", "Workload group 1"]) assert.ok(sent.includes(stand), `${stand} sent instead`);
  assert.equal(red.back("Customer A runs Workload group 1 at Site A"), "Acme Bank runs Core banking at Ashburn");
  assert.deepStrictEqual(backDeep({ a: ["Customer A"], b: 2 }, red), { a: ["Acme Bank"], b: 2 });
  const off = redactorFor(d, false); assert.equal(off.out("Acme Bank"), "Acme Bank");
  const s = JSON.stringify(designSummary(d)); assert.ok(!s.includes("10.9.8.7") && !s.includes("Initech"), "even without stand-ins, addresses and notes aren't in the summary");
});

test("catalogue: design choices only; customer facts can't be set; values are checked", () => {
  const d = acme(), cat = catalog(d), idsOf = cat.map(s => s.id);
  assert.ok(idsOf.length > 40);
  for (const id of idsOf) assert.match(id, /^(policy|fleet|addons|hostType|nics|cluster|net|nsx|identity)\./, id);
  assert.ok(!idsOf.some(id => /dns|ntp|domain$|Asn|idp|roles|breakGlass|plan|workload|project|customer/i.test(id)), "no customer facts");
  assert.deepStrictEqual(idsOf.filter(i => i.startsWith("identity.")), ["identity.mode"]);
  const nplus = cat.find(s => s.id.endsWith(".nPlus"))!;
  assert.deepStrictEqual(coerce(nplus, "2"), { ok: true, value: 2 }); assert.equal(coerce(nplus, 9).ok, false);
  const ratio = cat.find(s => s.id === "policy.cpuRatio")!; assert.equal(coerce(ratio, -1).ok, false); assert.equal(coerce(ratio, "abc").ok, false);
  assert.equal(changesToOps(d, [{ setting: "project.customer", value: "x" }], redactorFor(d, true)).ok, false);
  assert.equal(changesToOps(d, [{ setting: "policy.cpuRatio", value: 0 }], redactorFor(d, true)).ok, false);
  assert.equal(changesToOps(d, [], redactorFor(d, true)).ok, false);
});

test("what-if and proposals: the engine's numbers, and the design itself never changes", () => {
  const d = acme(), before = snapOf(d), red = redactorFor(d, true);
  const cid = d.topology.instances[0].wlds[0].clusters[0].id, sug: Suggestion[] = [], ctx = { design: d, red, suggestions: sug, nextId: ids() };
  const w = TOOLS.find(t => t.name === "what_if")!.run({ changes: [{ setting: `cluster.${cid}.nPlus`, value: 2 }] }, ctx) as { before: { hosts: number }; after: { hosts: number } };
  const changed = must(d, catalog(d).find(s => s.id === `cluster.${cid}.nPlus`)!.ops(2));
  assert.equal(w.after.hosts, store.sizeDesign(changed).hosts, "after = the engine on the changed design");
  assert.equal(w.before.hosts, store.sizeDesign(d).hosts);
  TOOLS.find(t => t.name === "propose_changes")!.run({ summary: "N+2 on the workload cluster", reason: "Customer A wants maintenance headroom", changes: [{ setting: `cluster.${cid}.nPlus`, value: 2 }] }, ctx);
  assert.equal(sug.length, 1); assert.equal(sug[0].status, "pending"); assert.equal(sug[0].reason, "Acme Bank wants maintenance headroom", "real names back in what the architect sees");
  assert.deepStrictEqual(sug[0].after, impactOf(changed));
  assert.equal(snapOf(d), before, "tools never change the design");
  assert.throws(() => TOOLS.find(t => t.name === "explain_cluster")!.run({ cluster: "nope" }, ctx), /No cluster nope/);
});

test("copilot: reads through tools, sends only stand-ins, returns real names, and proposals wait for the architect", async () => {
  const d = acme(), before = snapOf(d), cid = d.topology.instances[0].wlds[0].clusters[0].id;
  const { conn, seen } = fakeApi([
    () => call(["get_design", {}]),
    () => call(["propose_changes", { summary: "N+2 for Workload group 1's cluster", reason: "headroom", changes: [{ setting: `cluster.${cid}.nPlus`, value: 2 }] }], ["no_such_tool", {}]),
    () => call(["what_if", { changes: [{ setting: "workload.groups", value: 1 }] }]),
    () => say("Customer A's design has **room**. I proposed N+2; apply it if you agree."),
  ]);
  const sug: Suggestion[] = [];
  const out = await ask(conn, "claude-sonnet-5-5", d, redactorFor(d, true), [], "How does Acme Bank's design look?", sug, ids());
  assert.equal(out.reply, "Acme Bank's design has **room**. I proposed N+2; apply it if you agree.");
  assert.deepStrictEqual(out.steps, ["Read the design", "Proposed a change", "Ran a what-if"]);
  const wire = JSON.stringify(seen);
  for (const real of ["Acme Bank", "Core banking", "acme.local", "10.9.8.7"]) assert.ok(!wire.includes(real), `${real} never sent`);
  assert.equal(seen[0].system, COPILOT_SYSTEM); assert.ok(seen[0].tools!.some(t => t.name === "propose_changes"));
  const third = seen[2].messages.at(-1)!.content as ContentBlock[];
  assert.ok(third.some(b => b.type === "tool_result" && b.is_error && /No tool no_such_tool/.test(b.content)), "an unknown tool is an error the model sees");
  const fourth = seen[3].messages.at(-1)!.content as ContentBlock[];
  assert.ok(fourth.some(b => b.type === "tool_result" && b.is_error && /not changeable setting/.test(b.content)), "customer facts refused");
  assert.equal(sug.length, 1); assert.equal(sug[0].summary, "N+2 for Core banking's cluster"); assert.equal(snapOf(d), before, "nothing applied");
  // tool calls stay paired with their results when the history is trimmed
  const t = trimHistory([...out.history, ...out.history, ...out.history], 6);
  assert.ok(t[0].role === "user" && typeof t[0].content === "string");
});

test("applying an AI suggestion goes through the same checks and is recorded as AI-suggested in the register and the HLD", () => {
  const d = acme(), cid = d.topology.instances[0].wlds[0].clusters[0].id;
  const c = changesToOps(d, [{ setting: `cluster.${cid}.nPlus`, value: 2 }], redactorFor(d, false)); if (!c.ok) throw new Error(c.error);
  const x = must(d, [...c.ops, { op: "set", path: ["decisions", "ai"], value: [{ summary: "N+2 on wld01", reason: "headroom", at: "2026-11-27", paths: [`cluster.${cid}.nPlus`] }] }]);
  assert.equal(x.topology.instances[0].wlds[0].clusters[0].nPlus, 2);
  const r = store.sizeDesign(x), reg = decisionRegister(x, evaluate(x, r));
  assert.ok(reg.some(e => e.kind === "ai" && e.text === "N+2 on wld01" && e.reason === "headroom"));
  const dec = walk(buildHld(x, r, "2026-11-27")).find(s => s.s.id === "decisions")!.s;
  assert.ok(dec.blocks.some(b => b.t === "table" && b.rows.some(row => row.includes("N+2 on wld01") && row.some(v => /AI-suggested/.test(v)))));
  const saved = engine.loadDesign(engine.serializeDesign(x)); if (saved.kind !== "design") throw new Error();
  assert.deepStrictEqual(saved.design.decisions.ai, x.decisions.ai, "the record survives a save");
});

test("writer: drafts from the design's facts with stand-ins, stored labelled; flagged when the design changes; edits labelled", async () => {
  const d = acme();
  const { conn, seen } = fakeApi([() => say("# Heading\n\nCustomer A gets a **solid** design.\n\n\n\nSecond paragraph.")]);
  const n = await draft(conn, "claude-sonnet-5-5", d, redactorFor(d, true), "summary", "2026-11-27");
  assert.equal(n.text, "Acme Bank gets a solid design.\n\nSecond paragraph.", "no markdown, real names");
  assert.equal(n.snap, designSnap(d)); assert.equal(n.edited, false);
  const wire = JSON.stringify(seen); assert.ok(!wire.includes("Acme Bank") && !wire.includes("10.9.8.7"));
  assert.ok(JSON.stringify(writerFacts(d)).includes('"decisions"'));
  let x = must(d, [{ op: "set", path: ["narrative"], value: { summary: n } }]);
  const block = () => walk(buildHld(x, store.sizeDesign(x), "2026-11-27")).find(s => s.s.id === "summary")!.s.blocks.find(b => b.t === "ai") as { label: string; paras: string[]; stale: boolean };
  assert.deepStrictEqual(block().paras, ["Acme Bank gets a solid design.", "Second paragraph."]); assert.match(block().label, /AI draft/); assert.equal(block().stale, false);
  x = must(x, [{ op: "set", path: ["policy", "cpuRatio"], value: 5 }]);
  assert.equal(block().stale, true, "the design changed after drafting");
  x = must(x, [{ op: "set", path: ["narrative"], value: { summary: { ...x.narrative.summary!, text: "Mine now.", edited: true } } }]);
  assert.match(block().label, /edited by the architect/);
  const docx = new TextDecoder().decode(hldDocx(buildHld(x, store.sizeDesign(x), "2026-11-27")));
  assert.match(docx, /AiLabel/); assert.match(docx, /Mine now\./);
  await assert.rejects(draft(fakeApi([() => say("   ")]).conn, "m", d, redactorFor(d, true), "rationale", "x"), /no text/);
});

test("design format 10: a format 9 file opens with no AI record and no drafts; bad AI data is dropped", () => {
  const raw = JSON.parse(readFileSync(new URL("../fixtures/designs/format-9.vcf-design.json", import.meta.url), "utf8"));
  assert.equal(raw.formatVersion, 9);
  const r = engine.loadDesign(raw); if (r.kind !== "design") throw new Error();
  assert.equal(r.design.formatVersion, 10); assert.deepStrictEqual(r.design.decisions.ai, []); assert.deepStrictEqual(r.design.narrative, {});
  const bad = engine.loadDesign({ ...JSON.parse(engine.serializeDesign(r.design)), narrative: { summary: { text: "ok", edited: "yes" }, bogus: { text: "x" }, rationale: { text: "  " } },
    decisions: { ...r.design.decisions, ai: [{ summary: "  kept  ", paths: ["a", 3] }, { summary: "" }, "junk"] } });
  if (bad.kind !== "design") throw new Error();
  assert.deepStrictEqual(Object.keys(bad.design.narrative), ["summary"]); assert.equal(bad.design.narrative.summary!.edited, false);
  assert.deepStrictEqual(bad.design.decisions.ai, [{ summary: "kept", reason: "", at: "", paths: ["a"] }]);
});

test("panel: off until a key; behind its flags; suggestions offer Apply; drafts card explains what it needs", () => {
  const d = acme(), keep = structuredClone(aiView);
  flags.setEdition("ai");
  try {
    assert.match(copilotHtml(), /data-act="ai-toggle"/, "a closed launcher by default");
    Object.assign(aiView, { open: true, ready: false });
    assert.match(copilotHtml(), /id="ai-key"/); assert.match(copilotHtml(), /stand-in names/i);
    Object.assign(aiView, { ready: true, showSettings: false, turns: [{ role: "user", text: "q" }, { role: "assistant", text: "a\n\n- one\n- two", steps: ["Read the design"] }],
      suggestions: [{ id: "s1", summary: "Do X", reason: "why", changes: [{ setting: "policy.cpuRatio", label: "CPU ratio", where: "Sizing policy", from: 4, to: 5 }], ops: [], before: impactOf(d), after: impactOf(d), status: "pending" }] });
    const html = copilotHtml();
    assert.match(html, /data-act="ai-apply" data-sid="s1"/); assert.match(html, /<li>one<\/li>/); assert.match(html, /Read the design/);
    assert.match(writerHtml(d), /Draft with AI/);
    Object.assign(aiView, { ready: false }); assert.match(writerHtml(d), /Add your Claude API key/);
    flags.setOverrides({ aiCopilot: false, aiWriter: false }); assert.equal(copilotHtml(), ""); assert.equal(writerHtml(d), "");
  } finally { flags.setOverrides({}); flags.setEdition("classic"); Object.assign(aiView, keep); }
  assert.equal(textHtml("<b>x</b>"), "<p>&lt;b&gt;x&lt;/b&gt;</p>", "model text is escaped");
});

test("editions: classic has no AI anywhere; AI-powered has it; each names itself in its documents", () => {
  const d = acme(), r = store.sizeDesign(d), ui = { sel: "", closed: new Set() } as never, keep = structuredClone(aiView);
  try {
    flags.setEdition("classic");
    assert.equal(flags.enabled("aiCopilot"), false); assert.equal(flags.enabled("aiWriter"), false);
    Object.assign(aiView, { open: true, ready: true });
    assert.equal(copilotHtml(), ""); assert.equal(writerHtml(d), "");
    assert.doesNotMatch(stepHtml(d, r, ui, "output"), /data-act="ai-|ai-drafts/);
    assert.equal(buildHld(d, r, "x").tool, "VCF Design Studio");
    assert.match(new TextDecoder().decode(hldDocx(buildHld(d, r, "x"))), /<dc:creator>VCF Design Studio by vCloudOne</);
    flags.setEdition("ai");
    assert.ok(flags.enabled("aiCopilot") && flags.enabled("aiWriter"));
    assert.match(stepHtml(d, r, ui, "output"), /ai-drafts/);
    const h = buildHld(d, r, "x"); assert.equal(h.tool, "VCF Design Studio: AI-powered");
    assert.match(new TextDecoder().decode(hldDocx(h)), /Prepared with VCF Design Studio: AI-powered by vCloudOne/);
    assert.match(toDrawio(topologyDiagram(d, r)), /<mxfile host="VCF Design Studio: AI-powered">/);
    flags.setEdition("bogus" as never); assert.equal(flags.currentEdition(), "classic", "unknown editions fall back to classic");
  } finally { flags.setEdition("classic"); Object.assign(aiView, keep); }
});

test("pages: the AI-powered page uses the shared app, is unlinked and kept out of search; classic stays classic", () => {
  const root = new URL("../../", import.meta.url), read = (p: string) => readFileSync(new URL(p, root), "utf8");
  const classic = read("vcf-design-studio/index.html"), ai = read("vcf-design-studio-ai/index.html");
  assert.doesNotMatch(classic, /data-edition/); assert.match(classic, /<h1>VCF Design Studio <span/);
  assert.match(ai, /<html lang="en" data-edition="ai">/); assert.match(ai, /<title>VCF Design Studio: AI-powered \| vCloudOne<\/title>/);
  assert.match(ai, /<meta name="robots" content="noindex">/);
  for (const ref of [...ai.matchAll(/(?:src|href)="(\.\.\/vcf-design-studio\/[^"]+)"/g)].map(m => m[1])) assert.ok(existsSync(new URL(ref.replace("../", ""), root)), `${ref} exists`);
  assert.match(ai, /src="\.\.\/vcf-design-studio\/app\/studio\/src\/main\.js"/);
  assert.doesNotMatch(ai, /never leave your machine: designs/, "no promise the AI page can't keep");
  const others = ["index.html", "sitemap.xml", "404.html", "vcf-sizing/index.html", "evs-sizing/index.html", "vmc-sizing/index.html", "vcf-design-studio/index.html"].map(read).join("");
  assert.doesNotMatch(others, /vcf-design-studio-ai/, "nothing links to it yet");
});
