// Built from TypeScript by studio/build.mjs. Edit the .ts source, then run npm run build.
// VCF Design Studio (both editions): page shell. Step rail, live summary, start screen, autosave.
// All changes go through store.propose(); views only read the design and the sizing result.
import { loadDesign, newDesign, serializeDesign, mergeHostTypes, clusterReason, summaryLine } from "../../engine/src/index.js";
                                                                      
import { openSaved, save, forget, propose, sizeDesign } from "./store.js";
                                           
import { STEPS, stepById } from "./flow.js";
import { expertHtml } from "./expert.js";
                                            
import { fieldOps, hostTypeOps, actionOps, identityOps } from "./edit.js";
import { netOps, nicsOps } from "./hostnet.js";
import { nsxOps } from "./nsx.js";
import { planOps, proposePlan } from "./ip.js";
import { evaluate, scorecard, deviationOps, scorable } from "./rules.js";
import { enabled, setEdition } from "./flags.js";
                                          
import { EXPORTERS } from "./export/index.js";
                                                
                                                 
import { diagrams, toSvg } from "./diagram.js";
import { easyOptions, applyOptionOps, snapOf } from "./easy.js";
                                                        
import { easyHtml } from "./guided.js";
import { readExport, rebuild, SHEETS } from "./rvimport.js";
import { stepHtml, stateTag } from "./guided.js";
import { stepState, recommendOps, skipOps, reopenOps } from "./steps.js";
                                                
                                        
import { aiView, copilotHtml } from "./ai/panel.js";
                                                   
import { loadAi, saveAi, aiReady, connectorFor, modelOf, listModels, testConnection, problem, provider } from "./ai/providers.js";
                                                                 
import { redactorFor } from "./ai/redact.js";
import { ask } from "./ai/copilot.js";
import { draft } from "./ai/writer.js";
import { designSummary, changesToOps } from "./ai/tools.js";
import { NARRATIVE_TARGETS } from "../../engine/src/index.js";
                                                                 

const $ = (id        ) => document.getElementById(id) ;
const esc = (s         ) => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] ));
const nf = (n        , d = 0) => (Number.isFinite(n) ? n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }) : "–");

// ---------- edition: the page says which app this is (classic, or AI-powered) ----------
setEdition((document.documentElement.dataset.edition || "classic")           );

// ---------- state ----------
const opened = openSaved(localStorage);
let design         = opened.design;
let result               = sizeDesign(design);
let flash                                                    = opened.notes.map(text => ({ text, lvl: "info"          }));
let saveTimer = 0;
if (opened.origin === "vcf-sizing" || opened.origin === "sizing-host-types") save(localStorage, design);   // adopt it once, so later visits open this design

// easy button: inputs for this visit, options cached per design and inputs, one-step undo
const easyIn             = { source: "generic", vendor: "either", layout: "standard" };
let easyCache                                             = null, undoEasy                = null;
function commit(p          ) {
  if (p.source !== "easy-button") undoEasy = null;   // undo only right after the easy button, never over later edits
  const o = propose(design, p);
  if (!o.ok) { flash = [{ text: `That change wasn't applied: ${o.error}`, lvl: "crit" }]; render(); return false; }
  design = o.design; result = sizeDesign(design);
  flash = o.notes.map(text => ({ text, lvl: "info"          }));   // older notices no longer apply
  clearTimeout(saveTimer); saveTimer = window.setTimeout(() => { if (!save(localStorage, design)) flash = [{ text: "This browser isn't keeping your design (storage full or blocked). Use Save design file.", lvl: "warn" }]; }, 300);
  render();
  return true;
}
function replace(d        , notes          ) {
  design = d; result = sizeDesign(design); save(localStorage, design);
  flash = notes.map(text => ({ text, lvl: "info" }));
}

// ---------- routing: #/start, #/step/<id>, #/expert ----------
                                                                                                      
function route()        {
  const h = location.hash.replace(/^#\/?/, "").split("/");
  if (h[0] === "step" && stepById(h[1] || "")) return h[1] === "start" ? { view: "start" } : { view: "step", id: h[1] };
  if (h[0] === "expert" && enabled("expertView")) return { view: "expert" };
  if (h[0] === "easy" && enabled("easyButton")) return { view: "easy" };
  return { view: "start" };
}
const go = (hash        ) => { if (location.hash === hash) render(); else location.hash = hash; };

// ---------- views ----------
const isEmpty = (d        ) => !d.topology.instances.length && !d.workload.groups.length && !d.hostTypes.length && !d.project.customer;

function railHtml(r       ) {
  const cur = r.view === "start" ? "start" : r.view === "step" ? r.id : "";
  return `<ol class="rail">${STEPS.map(s => {
    const coming = s.kind === "coming";
    const badge = stateTag(stepState(design, s.id).state) || (s.kind === "required" ? `<span class="tag">Required</span>` : "");
    const inner = `<span class="n">${s.n}</span><span class="t">${esc(s.title)}</span>${badge}`;
    return `<li class="${s.id === cur ? "on" : ""} ${coming ? "coming" : ""}">${coming ? `<span class="item" aria-disabled="true">${inner}</span>` : `<a class="item" href="#/step/${s.id}" ${s.id === cur ? 'aria-current="step"' : ""}>${inner}</a>`}</li>`;
  }).join("")}</ol>
  ${enabled("easyButton") ? `<a class="expert ${r.view === "easy" ? "on" : ""}" href="#/easy">Easy button <span class="hint">three complete options</span></a>` : ""}
  ${enabled("expertView") ? `<a class="expert ${r.view === "expert" ? "on" : ""}" href="#/expert">Expert view <span class="hint">all settings on one page</span></a>` : ""}`;
}

function summaryHtml() {
  const r = result, crit = r.warnings.filter(w => w.lvl === "crit"), warn = r.warnings.filter(w => w.lvl === "warn");
  const tiles = [["Hosts", nf(r.hosts)], ["VCF cores", nf(r.licCores)], ["vSAN add-on", `${nf(r.lic.addOnTiB)} TiB`], ["Clusters", nf(r.clusters.length)]];
  return `<section class="card summary" aria-live="polite">
    <header><h2>Live summary</h2></header>
    <p class="line">${esc(summaryLine(r))}</p>
    <div class="tiles">${tiles.map(([k, v]) => `<div class="tile"><span class="k">${k}</span><span class="big num">${v}</span></div>`).join("")}</div>
    ${r.clusters.length ? `<ul class="reasons">${r.clusters.slice(0, 8).map(c => `<li><b>${esc(c.c.name)}</b> ${esc(clusterReason(c))}</li>`).join("")}${r.clusters.length > 8 ? `<li class="hint">…and ${r.clusters.length - 8} more clusters</li>` : ""}</ul>` : ""}
    ${!scorable(design, r) ? "" : (sc => `<p class="hint bp">Best practices: ${sc.reduce((a, p) => a + p.open, 0)} not met, ${sc.reduce((a, p) => a + p.accepted, 0)} accepted as deviations${sc.some(p => p.atRisk) ? ` · <span class="pill crit">At risk: ${esc(sc.filter(p => p.atRisk).map(p => p.label).join(", "))}</span>` : ""}. <a href="#/step/review">Scorecard</a></p>`)(scorecard(design, evaluate(design, r)))}
    ${crit.length || warn.length ? `<p class="hint">${crit.length ? `<span class="pill crit">${crit.length} to fix</span> ` : ""}${warn.length ? `<span class="pill warn">${warn.length} to check</span>` : ""}</p>
      <ul class="warns">${[...crit, ...warn].slice(0, 3).map(w => `<li class="${w.lvl}">${esc(w.t)}</li>`).join("")}</ul>` : ""}
  </section>`;
}

function startHtml() {
  const has = !isEmpty(design);
  return `<section class="card">
    <header><h2>Start</h2></header>
    ${has ? `<div class="choice">
      <div><h3>Continue your design</h3><p class="hint">${esc(design.project.customer || "Untitled design")} · ${design.topology.instances.length} instance${design.topology.instances.length === 1 ? "" : "s"} · ${design.workload.groups.length} workload group${design.workload.groups.length === 1 ? "" : "s"}. Kept in this browser as you work.</p></div>
      <div class="row"><a class="btn" href="#/step/project">Guided</a><a class="btn ghost" href="#/expert">Expert view</a></div></div>` : ""}
    <div class="choice">
      <div><h3>New design</h3><p class="hint">Guided walks you through each decision and explains the defaults. Expert view puts every setting on one page. Both work on the same design and you can switch at any time.</p></div>
      <div class="row"><button type="button" data-act="new-guided">${has ? "Start over, guided" : "Guided"}</button><button type="button" class="ghost" data-act="new-expert">${has ? "Start over, expert" : "Expert view"}</button></div>
      ${has ? `<p class="hint" id="newwarn">Starting over replaces the design kept in this browser. Save a design file first if you want to keep it.</p>` : ""}
    </div>
    <div class="choice">
      <div><h3>Open a file</h3><p class="hint">A design file from this tool, or settings copied from the VCF Sizing page, or a host types file. Files are read in your browser and never uploaded.</p></div>
      <div class="row"><button type="button" class="ghost" data-act="open-file">Choose file</button><button type="button" class="link" data-act="paste">Paste text instead</button></div>
      <div id="pastebox" class="hidden"><textarea id="pastetext" rows="6" placeholder="Paste a design or VCF Sizing settings here"></textarea><div class="row"><button type="button" data-act="paste-apply">Open</button></div></div>
    </div>
  </section>`;
}


const rv                                                                             = { files: [], stats: null };   // this visit only, never saved
const ui           = { sel: "", closed: new Set(), rv };

// re-rendering replaces the form, so keep focus (and the caret) on the same control
const focusKey = (el                ) => el instanceof HTMLElement ? el.dataset.edit || el.dataset.xact || el.dataset.sel || "" : "";
function render() {
  const r = route(), fk = focusKey(document.activeElement);
  const caret = document.activeElement instanceof HTMLInputElement && document.activeElement.type === "text" ? document.activeElement.selectionStart : null;
  $("rail").innerHTML = railHtml(r);
  $("main").innerHTML = (flash.length ? `<ul class="warns flash">${flash.map(f => `<li class="${f.lvl}">${esc(f.text)}</li>`).join("")}</ul>` : "")
    + (undoEasy ? `<p class="flash-undo">Easy button applied. <button type="button" class="link" data-undo-easy="1">Undo</button></p>` : "")
    + (r.view === "start" ? startHtml() : r.view === "expert" ? expertHtml(design, result, ui) : r.view === "easy" ? easyHtml(design, easyIn, easyOpts()) : stepHtml(design, result, ui, r.id));
  const aiFocus = document.activeElement && (document.activeElement               ).id === "ai-input";
  $("summary").innerHTML = summaryHtml() + copilotHtml();
  const log = document.getElementById("ai-log"); if (log) log.scrollTop = log.scrollHeight;
  if (aiFocus) { const a = document.getElementById("ai-input")                              ; if (a && !a.disabled) { a.focus({ preventScroll: true }); a.setSelectionRange(a.value.length, a.value.length); } }
  if (fk) {
    const el = [...document.querySelectorAll             ("[data-edit],[data-xact],[data-sel]")].find(x => focusKey(x) === fk);
    if (el) { el.focus({ preventScroll: true }); if (caret !== null && el instanceof HTMLInputElement && el.type === "text") el.setSelectionRange(caret, caret); }
  }
}

// ---------- actions ----------
function openText(text        ) {
  try {
    const r = loadDesign(text, { browserHostTypes: [] });
    if (r.kind === "hostTypes") {
      // a host types file joins the current design's host types (same names replaced)
      const ok = commit({ source: "import-host-types", ops: [{ op: "set", path: ["hostTypes"], value: mergeHostTypes(design.hostTypes, r.hostTypes) }] });
      if (ok) flash = [{ text: `${r.hostTypes.length} host type${r.hostTypes.length > 1 ? "s" : ""} added (same names replaced).`, lvl: "info" }];
    } else {
      replace(r.design, [r.from === "vcf-sizing" ? "Opened VCF Sizing settings." : "Design opened.", ...r.notes]);
      go("#/step/project");
    }
  } catch (e) { flash = [{ text: (e         ).message, lvl: "crit" }]; }
  render();
}

document.addEventListener("click", e => {
  const b = (e.target               ).closest             ("[data-act]"); if (!b) return;
  const act = b.dataset.act;
  if (act === "new-guided" || act === "new-expert") {
    if (!isEmpty(design) && b.dataset.armed !== "1") { b.dataset.armed = "1"; b.textContent = "Click again to replace it"; return; }
    forget(localStorage); replace(newDesign(), []); go(act === "new-guided" ? "#/step/project" : "#/expert");
  }
  else if (act === "open-file") ($("file")                    ).click();
  else if (act === "rv-open") ($("rvfile")                    ).click();
  else if (act === "paste") $("pastebox").classList.toggle("hidden");
  else if (act === "paste-apply") openText(($("pastetext")                       ).value);
  else if (act === "save-file") {
    const name = (design.project.customer || "vcf-design").trim().replace(/[^\w.-]+/g, "-").toLowerCase();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([serializeDesign(design)], { type: "application/json" }));
    a.download = `${name}.vcf-design.json`; document.body.appendChild(a); a.click(); a.remove();
  }
  else if (act === "export") void runExport(b.dataset.export || "", b);
});

// ---------- design outputs (the exporters; this part only adds what needs the browser) ----------
function download(o        ) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([o.data            ], { type: o.mime })); a.download = o.name;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}
/** An SVG drawn on a canvas at 2× for a sharp PNG. */
async function svgToPng(svg        )                    {
  const img = new Image(), url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  await new Promise      ((ok, fail) => { img.onload = () => ok(); img.onerror = () => fail(new Error("The diagram couldn't be drawn.")); img.src = url; });
  const w = img.naturalWidth, h = img.naturalHeight, c = document.createElement("canvas"); c.width = w * 2; c.height = h * 2;
  const g = c.getContext("2d") ; g.scale(2, 2); g.drawImage(img, 0, 0); URL.revokeObjectURL(url);
  const blob = await new Promise      ((ok, fail) => c.toBlob(b => (b ? ok(b) : fail(new Error("The PNG couldn't be made."))), "image/png"));
  return { png: new Uint8Array(await blob.arrayBuffer()), w, h };
}
async function runExport(id        , b             ) {
  const x = EXPORTERS.find(e => e.id === id); if (!x || !enabled(x.feature)) return;
  const label = b.textContent; b.setAttribute("aria-busy", "true"); b.textContent = "Preparing…";
  try {
    const r = sizeDesign(design), date = new Date().toISOString().slice(0, 10), slugName = (design.project.customer.trim() || "vcf-design").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    if (x.how === "print") {
      document.body.classList.add("print-hld");
      const done = () => { document.body.classList.remove("print-hld"); window.removeEventListener("afterprint", done); };
      window.addEventListener("afterprint", done); window.print(); setTimeout(done, 1000);
    } else if (x.how === "png") {
      const g = diagrams(design, r).find(z => z.id === x.diagram); if (!g) return;
      const p = await svgToPng(toSvg(g));
      download({ data: p.png, mime: "image/png", name: `${slugName || "vcf-design"}-${g.id}.png` });
    } else if (x.build) {
      // the Word file embeds the diagrams, drawn here as PNGs first
      const images                                                    = {};
      if (x.id === "hld-docx") for (const g of diagrams(design, r)) { try { images[g.id] = await svgToPng(toSvg(g)); } catch { /* the document notes where to download it instead */ } }
      download(x.build(design, r, date, images));
    }
  } catch (e) { flash = [{ text: (e         ).message, lvl: "crit" }]; render(); }
  finally { b.removeAttribute("aria-busy"); b.textContent = label; }
}
// ---------- Expert view edits ----------
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 
function editOps(e      , v         ) {
  if (e.t === "scope") {   // a scope change rebuilds the RVTools groups in the same proposal
    const scope = { ...design.workload.rvtoolsScope, [e.key]: v }, rb = rebuild(design, rv.files, scope);
    rv.stats = rb.stats;
    return [{ op: "set"         , path: ["workload", "rvtoolsScope", e.key], value: v }, { op: "set"         , path: ["workload", "groups"], value: rb.groups }];
  }
  if (e.t === "sec" && e.sec === "identity") return identityOps(design, e.key, v);
  if (e.t === "sec") return [{ op: "set"         , path: [...e.sec.split("."), e.key], value: v }];
  if (e.t === "net") return netOps(design, e.cid, e.key, e.key === "nicGbps" ? Number(v) : v);
  if (e.t === "dev") return deviationOps(design, e.key, v);
  if (e.t === "plan") return planOps(design, e.key, e.f, v);
  if (e.t === "nsx") return nsxOps(design, e.did, e.key, v);
  if (e.t === "nics") return nicsOps(design, e.ht, Number(v));
  if (e.t === "role") return [{ op: "set"         , path: ["identity", "roles", e.i, e.key], value: v }];
  if (e.t === "node") return fieldOps(design, e.id, e.key, v);
  if (e.t === "ht") return hostTypeOps(design, e.id, e.key, v);
  return [{ op: "set"         , path: ["workload", "groups", e.i, ...(e.sub ? [e.sub] : []), e.key], value: v }];
}
document.addEventListener("change", ev => {
  const el = ev.target                                        ;
  if (!(el instanceof HTMLElement) || !el.dataset.edit) return;
  const e = JSON.parse(el.dataset.edit)        , type = el.dataset.type;
  let v          = type === "bool" ? (el                    ).checked : el.value;
  if (type === "number" || el.dataset.num) {
    v = el.value === "" && el.dataset.blank !== undefined ? Number(el.dataset.blank) : parseFloat(el.value);
    if (!Number.isFinite(v)) { render(); return; }
  }
  // after the event, so focus has already moved (Tab) and render() keeps it there
  setTimeout(() => {
    try { const ops = editOps(e, v); if (ops.length) commit({ source: "expert", ops }); else render(); }
    catch (err) { flash = [{ text: (err         ).message, lvl: "crit" }]; render(); }
  });
});
document.addEventListener("click", ev => {
  const t = ev.target               ;
  const x = t.closest             ("[data-xact]"), s = t.closest             ("[data-sel]");
  if (s) { ui.sel = s.dataset.sel ; render(); return; }
  if (!x) return;
  try {
    const { ops, select } = actionOps(design, JSON.parse(x.dataset.xact )          );
    if (select) ui.sel = select;
    if (ops.length) commit({ source: "expert", ops });
  } catch (err) { flash = [{ text: (err         ).message, lvl: "crit" }]; render(); }
});
document.addEventListener("click", ev => {
  const b = (ev.target               ).closest             ("[data-step]"); if (!b) return;
  const { act, id } = JSON.parse(b.dataset.step )                                                        ;
  const ops = act === "recommend" ? recommendOps(design, id) : act === "skip" ? skipOps(design, id) : reopenOps(design, id);
  commit({ source: `guided:${act}`, ops });
});
document.addEventListener("toggle", ev => {
  const el = ev.target               ; if (!(el instanceof HTMLDetailsElement) || !el.dataset.sec) return;
  if (el.open) ui.closed.delete(el.dataset.sec); else ui.closed.add(el.dataset.sec);
}, true);

// ---------- RVTools ----------
                                                                                                                                                                                     
function rebuildRv() {
  const rb = rebuild(design, rv.files, design.workload.rvtoolsScope);
  rv.stats = rb.stats;
  commit({ source: "rvtools-import", ops: [{ op: "set", path: ["workload", "groups"], value: rb.groups }] });
}
async function addRvFiles(list                          ) {
  const fs = Array.from(list || []); if (!fs.length) return;
  if (typeof XLSX === "undefined") { flash = [{ text: "The spreadsheet reader didn't load. Check your connection and reload the page.", lvl: "crit" }]; render(); return; }
  flash = [{ text: `Reading ${fs.length} file${fs.length > 1 ? "s" : ""}…`, lvl: "info" }]; render();
  await new Promise(r => setTimeout(r, 30));
  for (const f of fs) {
    try {
      const wb = XLSX.read(await f.arrayBuffer(), { type: "array", sheets: [...SHEETS], dense: true });
      rv.files.push(readExport(f.name, n => (wb.Sheets[n] ? XLSX .utils.sheet_to_json(wb.Sheets[n], { defval: null }) : null)));
    } catch (e) { rv.files.push({ fileName: f.name, vms: [], include: true, status: "error", error: `Couldn't read this file as an RVTools export (${(e         ).message}).` }); }
  }
  rebuildRv();
}
$("rvfile").addEventListener("change", e => { const inp = e.target                    ; addRvFiles(inp.files).finally(() => { inp.value = ""; }); });
document.addEventListener("change", e => {
  const el = e.target                    ; if (!el.dataset || el.dataset.rvfile === undefined) return;
  rv.files[+el.dataset.rvfile].include = el.checked; rebuildRv();
});
document.addEventListener("click", e => {
  const b = (e.target               ).closest             ("[data-rvdel]"); if (!b) return;
  rv.files.splice(+b.dataset.rvdel , 1); rebuildRv();
});
document.addEventListener("keydown", e => { const d = (e.target               ).closest?.(".drop"); if (d && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); $("rvfile").click(); } });
document.addEventListener("dragover", e => { const d = (e.target               ).closest?.(".drop"); if (d) { e.preventDefault(); d.classList.add("over"); } });
document.addEventListener("dragleave", e => { (e.target               ).closest?.(".drop")?.classList.remove("over"); });
document.addEventListener("drop", e => { const d = (e.target               ).closest?.(".drop"); if (d) { e.preventDefault(); d.classList.remove("over"); addRvFiles(e.dataTransfer && e.dataTransfer.files); } });

$("file").addEventListener("change", async e => {
  const inp = e.target                    , f = inp.files && inp.files[0]; inp.value = "";
  if (f) openText(await f.text());
});
window.addEventListener("hashchange", () => { flash = []; render(); window.scrollTo({ top: 0 }); });
window.addEventListener("storage", e => { if (e.key === "vcfStudio.design") $("main").insertAdjacentHTML("afterbegin", `<ul class="warns flash"><li class="warn">This design was changed in another tab. Reload to see it.</li></ul>`); });


// ---------- IP / VLAN plan: the proposer fills empty rows; Clear removes everything entered ----------
document.addEventListener("click", ev => {
  const b = (ev.target               ).closest             ("[data-plan]"); if (!b) return;
  try {
    if (b.dataset.plan === "propose") commit({ source: "plan-proposer", ops: proposePlan(design, result) });
    else if (confirm("Clear every VLAN, subnet and gateway in the plan?")) commit({ source: "expert", ops: [{ op: "set", path: ["plan", "rows"], value: {} }] });
  } catch (err) { flash = [{ text: (err         ).message, lvl: "crit" }]; render(); }
});

// ---------- easy button: inputs for this visit, options cached per design and inputs, one-step undo ----------
function easyOpts()                      {
  if (easyIn.source === "custom" && !design.hostTypes.length) easyIn.source = "generic";
  const key = snapOf([design.workload, design.project.version, design.hostTypes, easyIn]);
  if (!easyCache || easyCache.key !== key) easyCache = { key, opts: easyOptions(design, easyIn) };
  return easyCache.opts;
}
document.addEventListener("change", ev => {
  const el = ev.target                    ; if (!el.dataset || !el.dataset.easyin) return;
  (easyIn                                     )[el.dataset.easyin] = el.value; render();
});
document.addEventListener("click", ev => {
  const t = ev.target               , b = t.closest             ("[data-easy]"), u = t.closest             ("[data-undo-easy]");
  if (u && undoEasy) { const prev = undoEasy; undoEasy = null; replace(prev, ["Easy button undone: the design is as it was before."]); render(); return; }
  if (!b) return;
  const o = (easyOpts() || []).find(x => x.key === b.dataset.easy); if (!o) return;
  const has = design.hostTypes.length > 0 || design.topology.instances.some(i => i.mgmt.clusters.length || i.wlds.length);
  const many = design.topology.instances.length > 1 ? ` The design's ${design.topology.instances.length} instances become one.` : "";
  if (has && !confirm(`Replace the host types and topology with the "${o.label}" option, and set the other steps to their recommended values?${many} You can undo this right after.`)) return;
  const before = design;
  if (commit({ source: "easy-button", ops: applyOptionOps(design, easyIn, o) })) { undoEasy = before; go("#/step/review"); }
});

// ---------- AI: the copilot and the HLD drafts (the logic is in studio/src/ai; this is the page side) ----------
let aiHistory              = [], aiAbort                         = null, aiSeq = 0;
const today = () => new Date().toISOString().slice(0, 10);
const storage = (() => { try { return localStorage; } catch { return null; } })();
if (enabled("aiCopilot") || enabled("aiWriter")) {   // classic never reads AI settings
  aiView.settings = loadAi(storage); aiView.ready = aiReady(aiView.settings); aiView.edit = structuredClone(aiView.settings); aiView.origin = location.origin;
}
const aiConn = () => connectorFor(aiView.settings);
const redactor = () => redactorFor(design, aiView.settings.standIns);

async function aiAsk(q        ) {
  const conn = aiConn(); q = q.trim(); if (!conn || !q || aiView.busy) return;
  aiView.turns.push({ role: "user", text: q }); aiView.input = ""; aiView.busy = "Thinking"; render();
  aiAbort = new AbortController();
  try {
    const out = await ask(conn, modelOf(aiView.settings), design, redactor(), aiHistory, q, aiView.suggestions, () => `s${++aiSeq}`, aiAbort.signal,
      step => { aiView.busy = step; render(); });
    aiHistory = out.history; aiView.turns.push({ role: "assistant", text: out.reply, steps: out.steps });
  } catch (e) {
    aiView.turns.push({ role: "error", text: (e         ).name === "AbortError" ? "Stopped." : (e         ).message });
  } finally { aiView.busy = ""; aiAbort = null; render(); }
}

function aiApply(id        ) {
  const s = aiView.suggestions.find(x => x.id === id); if (!s || s.status !== "pending") return;
  // rebuilt against the design as it is now, through the same checks
  const c = changesToOps(design, s.changes.map(x => ({ setting: x.setting, value: x.to })), redactorFor(design, false));
  if (!c.ok) { aiView.turns.push({ role: "error", text: `That suggestion no longer fits the design: ${c.error}` }); render(); return; }
  const rec = { summary: s.summary, reason: s.reason, at: today(), paths: s.changes.map(x => x.setting) };
  if (commit({ source: "ai", ops: [...c.ops, { op: "set", path: ["decisions", "ai"], value: [...design.decisions.ai, rec] }] })) { s.status = "applied"; render(); }
}

async function aiDraft(t                 ) {
  const conn = aiConn(); if (!conn || aiView.drafting) return;
  aiView.drafting = t; render();
  try {
    const n = await draft(conn, modelOf(aiView.settings), design, redactor(), t, today());
    commit({ source: "ai-writer", ops: [{ op: "set", path: ["narrative"], value: { ...design.narrative, [t]: n } }] });
  } catch (e) { flash = [{ text: (e         ).message, lvl: "crit" }]; }
  finally { aiView.drafting = ""; render(); }
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
  aiView.showSettings = !aiView.ready; aiView.preview = ""; render();
}
async function aiLoadModels() {
  const id = editId(); aiView.status = { kind: "busy", text: "Loading models…" }; render();
  try { const m = await listModels(aiView.edit, id); aiView.models[id] = m;
    if (!aiView.edit.cfg[id]?.model && !provider(id) .models.length) aiField("ai-model", m[0][0]);   // pick the first if none chosen yet
    aiView.status = { kind: "ok", text: `Found ${m.length} model${m.length === 1 ? "" : "s"}.` }; }
  catch (e) { aiView.status = { kind: "err", text: (e         ).message }; }
  render();
}
async function aiTest() {
  aiView.status = { kind: "busy", text: "Testing…" }; render();
  try { aiView.status = { kind: "ok", text: await testConnection({ ...aiView.edit, provider: editId() }) }; }
  catch (e) { aiView.status = { kind: "err", text: (e         ).message }; }
  render();
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
  else if (act === "ai-preview") { const red = redactorFor(design, aiView.edit.standIns);
    aiView.preview = red.out(JSON.stringify(designSummary(design, result), null, 1)); }
  else if (act === "ai-clear") { aiHistory = []; aiView.turns = []; aiView.suggestions = []; }
  else if (act === "ai-send") { void aiAsk(aiView.input); return; }
  else if (act === "ai-example") { void aiAsk(b.textContent || ""); return; }
  else if (act === "ai-stop") { aiAbort?.abort(); return; }
  else if (act === "ai-apply") { aiApply(b.dataset.sid || ""); return; }
  else if (act === "ai-dismiss") { const s = aiView.suggestions.find(x => x.id === b.dataset.sid); if (s) s.status = "dismissed"; }
  else if (act === "ai-draft") { const t = b.dataset.target                   ; if (NARRATIVE_TARGETS.includes(t)) void aiDraft(t); return; }
  else if (act === "ai-undraft") { const t = b.dataset.target                   ; const n = { ...design.narrative }; delete n[t]; commit({ source: "ai-writer", ops: [{ op: "set", path: ["narrative"], value: n }] }); return; }
  render();
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
  if (x.id === "ai-provider") { aiView.edit.provider = x.value              ; aiView.status = { kind: "", text: "" }; aiView.preview = ""; render(); return; }
  if (x.id === "ai-remember" || x.id === "ai-standins") { aiField(x.id, x.checked); return; }
  const el = ev.target                       , t = el.dataset?.narr                               ;
  if (!t || !design.narrative[t]) return;
  if (el.value.trim() === design.narrative[t] .text.trim()) return;
  commit({ source: "edit", ops: [{ op: "set", path: ["narrative"], value: { ...design.narrative, [t]: { ...design.narrative[t] , text: el.value, edited: true } } }] });
});

render();
