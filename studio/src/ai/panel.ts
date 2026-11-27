// The copilot panel and the AI-drafts card: HTML from state (no DOM), so tests can render them.
// The page (main.ts) owns the state and the events; `aiView` is what the screens read.
import { NARRATIVE_TARGETS } from "../../../engine/src/index.ts";
import type { Design } from "../../../engine/src/index.ts";
import { MODELS } from "./connector.ts";
import type { AiSettings } from "./connector.ts";
import type { Suggestion, Impact } from "./tools.ts";
import { TARGETS } from "./writer.ts";
import { designSnap } from "../hld.ts";
import { enabled } from "../flags.ts";

export interface Turn { role: "user" | "assistant" | "error"; text: string; steps?: string[] }
export interface AiView { settings: AiSettings; ready: boolean; open: boolean; showSettings: boolean; turns: Turn[]; suggestions: Suggestion[];
  busy: string; input: string; preview: string; drafting: string }
/** What the screens show; set by the page. */
export const aiView: AiView = { settings: { plug: "off", key: "", remember: false, model: MODELS[0][0], standIns: true, hostedUrl: "" }, ready: false, open: false, showSettings: false,
  turns: [], suggestions: [], busy: "", input: "", preview: "", drafting: "" };

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const nf = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 1 });
/** The model's plain text: paragraphs, and lines starting "- " or "1. " as list items. */
export function textHtml(t: string) {
  return t.split(/\n\s*\n/).map(p => {
    const lines = p.split("\n");
    if (lines.every(l => /^\s*([-*•]|\d+\.)\s+/.test(l))) return `<ul>${lines.map(l => `<li>${esc(l.replace(/^\s*([-*•]|\d+\.)\s+/, "")).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")}</li>`).join("")}</ul>`;
    return `<p>${esc(p).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/\n/g, "<br>")}</p>`;
  }).join("");
}

function settingsHtml(s: AiSettings) {
  return `<div class="ai-settings">
    <p class="hint">Uses your own Claude API key, sent only to Anthropic from this browser. A vCloudOne AI service may come later.</p>
    <label class="field"><span>Claude API key</span><input type="password" id="ai-key" autocomplete="off" placeholder="sk-ant-…" value="${esc(s.key)}"></label>
    <label class="check"><input type="checkbox" id="ai-remember" ${s.remember ? "checked" : ""}> Remember the key on this device</label>
    <label class="field"><span>Model</span><select id="ai-model">${MODELS.map(([id, l]) => `<option value="${id}" ${id === s.model ? "selected" : ""}>${esc(l)}</option>`).join("")}</select></label>
    <label class="check"><input type="checkbox" id="ai-standins" ${s.standIns ? "checked" : ""}> Use stand-in names (recommended): customer, site, workload group and VM names, DNS domain, identity groups</label>
    <p class="hint">Sent: the design's choices and the tool's own numbers. Never sent: DNS and NTP servers, IP addresses, ASNs, the notes field. Nothing is stored by vCloudOne.</p>
    <div class="row"><button type="button" data-act="ai-save">Save</button><button type="button" class="ghost" data-act="ai-preview">Show what's sent</button>${s.key ? `<button type="button" class="ghost" data-act="ai-forget">Forget key</button>` : ""}</div>
  </div>`;
}

const delta = (a: number, b: number) => (a === b ? nf(b) : `${nf(a)} → <b>${nf(b)}</b>`);
function impactHtml(b: Impact, a: Impact) {
  const cl = a.clusters.filter(c => { const o = b.clusters.find(x => x.id === c.id); return !o || o.hosts !== c.hosts; });
  return `<ul class="ai-impact"><li>Hosts ${delta(b.hosts, a.hosts)} · VCF cores ${delta(b.licCores, a.licCores)}${a.addOnTiB || b.addOnTiB ? ` · vSAN add-on ${delta(b.addOnTiB, a.addOnTiB)} TiB` : ""}</li>
    ${cl.map(c => `<li>${esc(c.name)}: ${esc(c.why)}</li>`).join("")}
    ${a.mustFix.length > b.mustFix.length ? `<li class="crit">Adds ${a.mustFix.length - b.mustFix.length} sizing issue(s) to fix</li>` : ""}
    ${a.openRequired + a.openRecommended !== b.openRequired + b.openRecommended ? `<li>Open best practices ${b.openRequired + b.openRecommended} → ${a.openRequired + a.openRecommended}</li>` : ""}</ul>`;
}
function suggestionHtml(s: Suggestion) {
  return `<div class="ai-sugg ${s.status}"><p class="ai-sugg-head"><span class="pill ai">AI suggestion</span> <b>${esc(s.summary)}</b></p>
    ${s.reason ? `<p class="hint">${esc(s.reason)}</p>` : ""}
    <ul class="ai-changes">${s.changes.map(c => `<li>${esc(c.where)}: ${esc(c.label)} ${esc(String(c.from))} → <b>${esc(String(c.to))}</b></li>`).join("")}</ul>
    ${impactHtml(s.before, s.after)}
    ${s.status === "pending" ? `<div class="row"><button type="button" data-act="ai-apply" data-sid="${s.id}">Apply</button><button type="button" class="ghost" data-act="ai-dismiss" data-sid="${s.id}">Dismiss</button></div>`
      : `<p class="hint">${s.status === "applied" ? "Applied, and recorded as an AI-suggested decision." : "Dismissed."}</p>`}</div>`;
}

/** The copilot card in the side panel. */
export function copilotHtml(v: AiView = aiView): string {
  if (!enabled("aiCopilot")) return "";
  if (!v.open) return `<section class="card ai-card closed"><button type="button" class="ai-open" data-act="ai-toggle"><span class="pill ai">AI</span> Design copilot <span class="hint">ask, what-if, suggestions</span></button></section>`;
  const head = `<header class="ai-head"><h2>Design copilot</h2><div class="row"><button type="button" class="link" data-act="ai-settings">${v.showSettings ? "Close settings" : "Settings"}</button>${v.turns.length ? `<button type="button" class="link" data-act="ai-clear">New chat</button>` : ""}<button type="button" class="link" data-act="ai-toggle" aria-label="Close the copilot">Close</button></div></header>`;
  if (!v.ready || v.showSettings) return `<section class="card ai-card">${head}${!v.ready ? `<p>The copilot explains this design, runs what-ifs through the sizing engine and suggests changes you can apply. Add your Claude API key to turn it on.</p>` : ""}${settingsHtml(v.settings)}${v.preview ? `<details open class="ai-preview"><summary>What's sent with a question</summary><pre>${esc(v.preview)}</pre></details>` : ""}</section>`;
  const sugg = (t: Turn, i: number) => i === v.turns.length - 1 && t.role === "assistant" ? v.suggestions.filter(s => s.status === "pending").map(suggestionHtml).join("") : "";
  const turns = v.turns.map((t, i) => t.role === "user" ? `<div class="ai-msg user">${esc(t.text)}</div>`
    : t.role === "error" ? `<div class="ai-msg error">${esc(t.text)}</div>`
    : `<div class="ai-msg bot">${t.steps?.length ? `<p class="ai-steps">${esc([...new Set(t.steps)].join(" · "))}</p>` : ""}${textHtml(t.text)}</div>${sugg(t, i)}`).join("");
  const done = v.suggestions.filter(s => s.status !== "pending");
  const examples = ["Why does each cluster have the hosts it has?", "What if we used 4 NICs per host?", "Review this design against the best practices", "How could we lower the VCF core count?"];
  return `<section class="card ai-card">${head}
    <p class="hint">${v.settings.standIns ? "Stand-in names on. " : ""}Numbers come from the sizing engine; suggestions change nothing until you apply them.</p>
    <div class="ai-log" id="ai-log">${turns || `<div class="ai-examples">${examples.map(q => `<button type="button" class="ghost" data-act="ai-example">${esc(q)}</button>`).join("")}</div>`}
      ${v.busy ? `<div class="ai-msg bot busy" aria-live="polite">${esc(v.busy)}…</div>` : ""}</div>
    ${done.length ? `<p class="hint">${done.filter(s => s.status === "applied").length} applied, ${done.filter(s => s.status === "dismissed").length} dismissed in this chat.</p>` : ""}
    <div class="ai-ask"><textarea id="ai-input" rows="2" placeholder="Ask about this design…" ${v.busy ? "disabled" : ""}>${esc(v.input)}</textarea>
      <button type="button" data-act="ai-send" ${v.busy ? "disabled" : ""}>Ask</button>${v.busy ? `<button type="button" class="ghost" data-act="ai-stop">Stop</button>` : ""}</div>
  </section>`;
}

/** The AI drafts card on the Design output page. */
export function writerHtml(d: Design, v: AiView = aiView): string {
  if (!enabled("aiWriter")) return "";
  const snap = designSnap(d);
  const rows = NARRATIVE_TARGETS.map(t => {
    const n = d.narrative?.[t], T = TARGETS[t], busy = v.drafting === t;
    return `<div class="ai-draft"><div class="ai-draft-head"><h4>${esc(T.title)} <span class="hint">in "${esc(T.where)}"</span></h4>
      <div class="row">${v.ready ? `<button type="button" class="ghost" data-act="ai-draft" data-target="${t}" ${v.drafting ? "disabled" : ""}>${busy ? "Drafting…" : n ? "Redraft" : "Draft with AI"}</button>` : ""}${n ? `<button type="button" class="link" data-act="ai-undraft" data-target="${t}">Remove</button>` : ""}</div></div>
      ${n ? `${n.snap !== snap ? `<p class="hint warn">The design changed after this was drafted. Redraft it or check it still holds.</p>` : ""}
        <textarea rows="8" data-narr="${t}" aria-label="${esc(T.title)} text">${esc(n.text)}</textarea>
        <p class="hint">${n.edited ? "Drafted with AI and edited" : "AI draft"}${n.at ? `, ${esc(n.at)}` : ""}. It appears in the HLD labelled as such.</p>` : ""}</div>`;
  }).join("");
  return `<section class="card ai-drafts"><h3><span class="pill ai">AI</span> HLD drafts</h3>
    <p class="hint">${v.ready ? "The AI writes from this design's own facts and numbers. Review and edit before you share it." : "Add your Claude API key in the Design copilot panel to draft these sections."}</p>${rows}</section>`;
}
