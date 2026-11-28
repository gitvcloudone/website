// Built from TypeScript by studio/build.mjs. Edit the .ts source, then run npm run build.
// The AI-powered edition's page side: the copilot panel's and HLD drafts' events and state. main.ts loads
// this module only on the AI-powered page (a dynamic import), so the classic page never fetches any AI code.
// The logic lives in the other files here; this wires it to the page through the slots and a small context.
                                                                                          
import { NARRATIVE_TARGETS } from "../../../engine/src/index.js";
                                            
import { slots } from "../slots.js";
import { aiView, copilotHtml, writerHtml } from "./panel.js";
                                                
import { loadAi, saveAi, aiReady, connectorFor, modelOf, listModels, testConnection, problem, provider } from "./providers.js";
                                                              
import { redactorFor } from "./redact.js";
import { ask } from "./copilot.js";
import { draft } from "./writer.js";
import { designSummary, changesToOps } from "./tools.js";

                                                                                                                                              

export function install(ctx         ) {
const D = () => ctx.design();
slots.summary = () => copilotHtml();
slots.output = (d        ) => writerHtml(d);
slots.beforeRender = () => !!document.activeElement && (document.activeElement               ).id === "ai-input";
slots.afterRender = (aiFocus         ) => {
  const log = document.getElementById("ai-log"); if (log) log.scrollTop = log.scrollHeight;
  if (aiFocus) { const a = document.getElementById("ai-input")                              ; if (a && !a.disabled) { a.focus({ preventScroll: true }); a.setSelectionRange(a.value.length, a.value.length); } }
};
let aiHistory              = [], aiAbort                         = null, aiSeq = 0;
const today = () => new Date().toISOString().slice(0, 10);
const storage = (() => { try { return localStorage; } catch { return null; } })();
{
  aiView.settings = loadAi(storage); aiView.ready = aiReady(aiView.settings); aiView.edit = structuredClone(aiView.settings); aiView.origin = location.origin;
}
const aiConn = () => connectorFor(aiView.settings);
const redactor = () => redactorFor(D(), aiView.settings.standIns);

async function aiAsk(q        ) {
  const conn = aiConn(); q = q.trim(); if (!conn || !q || aiView.busy) return;
  aiView.turns.push({ role: "user", text: q }); aiView.input = ""; aiView.busy = "Thinking"; ctx.render();
  aiAbort = new AbortController();
  try {
    const out = await ask(conn, modelOf(aiView.settings), D(), redactor(), aiHistory, q, aiView.suggestions, () => `s${++aiSeq}`, aiAbort.signal,
      step => { aiView.busy = step; ctx.render(); });
    aiHistory = out.history; aiView.turns.push({ role: "assistant", text: out.reply, steps: out.steps });
  } catch (e) {
    aiView.turns.push({ role: "error", text: (e         ).name === "AbortError" ? "Stopped." : (e         ).message });
  } finally { aiView.busy = ""; aiAbort = null; ctx.render(); }
}

function aiApply(id        ) {
  const s = aiView.suggestions.find(x => x.id === id); if (!s || s.status !== "pending") return;
  // rebuilt against the D() as it is now, through the same checks
  const c = changesToOps(D(), s.changes.map(x => ({ setting: x.setting, value: x.to })), redactorFor(D(), false));
  if (!c.ok) { aiView.turns.push({ role: "error", text: `That suggestion no longer fits the D(): ${c.error}` }); ctx.render(); return; }
  const rec = { summary: s.summary, reason: s.reason, at: today(), paths: s.changes.map(x => x.setting) };
  if (ctx.commit({ source: "ai", ops: [...c.ops, { op: "set", path: ["decisions", "ai"], value: [...D().decisions.ai, rec] }] })) { s.status = "applied"; ctx.render(); }
}

async function aiDraft(t                 ) {
  const conn = aiConn(); if (!conn || aiView.drafting) return;
  aiView.drafting = t; ctx.render();
  try {
    const n = await draft(conn, modelOf(aiView.settings), D(), redactor(), t, today());
    ctx.commit({ source: "ai-writer", ops: [{ op: "set", path: ["narrative"], value: { ...D().narrative, [t]: n } }] });
  } catch (e) { ctx.flash((e         ).message); }
  finally { aiView.drafting = ""; ctx.render(); }
}

// The settings form edits a working copy (aiView.edit); Save makes it the settings in use.
const editId = () => (aiView.edit.provider === "hosted" ? "anthropic" : aiView.edit.provider)              ;
function aiField(id        , v                  ) {
  const e = aiView.edit, pid = editId(), c              = { key: "", base: "", model: "", ...e.cfg[pid] };
  if (id === "ai-key") c.key = String(v).trim(); else if (id === "ai-base") c.base = String(v).trim(); else if (id === "ai-model") c.model = String(v).trim();
  else if (id === "ai-remember") { e.remember = !!v; return; } else if (id === "ai-standins") { e.standIns = !!v; return; } else return;
  e.cfg[pid] = c; aiView.status = { kind: "", text: "" };
}
function aiSaveSettings() {
  aiView.settings = structuredClone(aiView.edit); saveAi(storage, aiView.settings); aiView.ready = aiReady(aiView.settings);
  const why = problem(aiView.settings);
  aiView.status = why ? { kind: "err", text: `Saved, but not ready yet: ${why}` } : { kind: "", text: "" };
  aiView.showSettings = !aiView.ready; aiView.preview = ""; ctx.render();
}
async function aiLoadModels() {
  const id = editId(); aiView.status = { kind: "busy", text: "Loading models…" }; ctx.render();
  try { const m = await listModels(aiView.edit, id); aiView.models[id] = m;
    if (!aiView.edit.cfg[id]?.model && !provider(id) .models.length) aiField("ai-model", m[0][0]);   // pick the first if none chosen yet
    aiView.status = { kind: "ok", text: `Found ${m.length} model${m.length === 1 ? "" : "s"}.` }; }
  catch (e) { aiView.status = { kind: "err", text: (e         ).message }; }
  ctx.render();
}
async function aiTest() {
  aiView.status = { kind: "busy", text: "Testing…" }; ctx.render();
  try { aiView.status = { kind: "ok", text: await testConnection({ ...aiView.edit, provider: editId() }) }; }
  catch (e) { aiView.status = { kind: "err", text: (e         ).message }; }
  ctx.render();
}

document.addEventListener("click", ev => {
  const b = (ev.target               ).closest             ("[data-act^='ai-']"); if (!b) return;
  const act = b.dataset.act;
  if (act === "ai-toggle") { aiView.open = !aiView.open; aiView.showSettings = aiView.open && !aiView.ready; if (aiView.showSettings) aiView.edit = structuredClone(aiView.settings); }
  else if (act === "ai-settings") { aiView.showSettings = !aiView.showSettings; aiView.edit = structuredClone(aiView.settings); aiView.status = { kind: "", text: "" }; }
  else if (act === "ai-save") { aiSaveSettings(); return; }
  else if (act === "ai-models") { void aiLoadModels(); return; }
  else if (act === "ai-test") { void aiTest(); return; }
  else if (act === "ai-forget") {
    for (const s of [aiView.settings, aiView.edit]) { for (const c of Object.values(s.cfg)) if (c) c.key = ""; s.remember = false; }
    saveAi(storage, aiView.settings); aiView.ready = aiReady(aiView.settings); aiView.showSettings = true; aiView.status = { kind: "ok", text: "Keys forgotten on this device." };
  }
  else if (act === "ai-preview") { const red = redactorFor(D(), aiView.edit.standIns);
    aiView.preview = red.out(JSON.stringify(designSummary(D(), ctx.result()), null, 1)); }
  else if (act === "ai-clear") { aiHistory = []; aiView.turns = []; aiView.suggestions = []; }
  else if (act === "ai-send") { void aiAsk(aiView.input); return; }
  else if (act === "ai-example") { void aiAsk(b.textContent || ""); return; }
  else if (act === "ai-stop") { aiAbort?.abort(); return; }
  else if (act === "ai-apply") { aiApply(b.dataset.sid || ""); return; }
  else if (act === "ai-dismiss") { const s = aiView.suggestions.find(x => x.id === b.dataset.sid); if (s) s.status = "dismissed"; }
  else if (act === "ai-draft") { const t = b.dataset.target                   ; if (NARRATIVE_TARGETS.includes(t)) void aiDraft(t); return; }
  else if (act === "ai-undraft") { const t = b.dataset.target                   ; const n = { ...D().narrative }; delete n[t]; ctx.commit({ source: "ai-writer", ops: [{ op: "set", path: ["narrative"], value: n }] }); return; }
  ctx.render();
});
document.addEventListener("input", ev => {
  const el = ev.target                    ;
  if (el.id === "ai-input") aiView.input = el.value;
  else if (["ai-key", "ai-base", "ai-model"].includes(el.id)) aiField(el.id, el.value);
});
document.addEventListener("keydown", ev => {
  const el = ev.target               ;
  if (el.id === "ai-input" && ev.key === "Enter" && !ev.shiftKey) { ev.preventDefault(); void aiAsk(aiView.input); }
});
document.addEventListener("change", ev => {
  const x = ev.target                    ;
  if (x.id === "ai-provider") { aiView.edit.provider = x.value              ; aiView.status = { kind: "", text: "" }; aiView.preview = ""; ctx.render(); return; }
  if (x.id === "ai-remember" || x.id === "ai-standins") { aiField(x.id, x.checked); return; }
  const el = ev.target                       , t = el.dataset?.narr                               ;
  if (!t || !D().narrative[t]) return;
  if (el.value.trim() === D().narrative[t] .text.trim()) return;
  ctx.commit({ source: "edit", ops: [{ op: "set", path: ["narrative"], value: { ...D().narrative, [t]: { ...D().narrative[t] , text: el.value, edited: true } } }] });
});

ctx.render();
}
