// Built from TypeScript by studio/build.mjs. Edit the .ts source, then run npm run build.
// VCF Design Studio: page shell. Step rail, live summary, start screen, autosave.
// All changes go through store.propose(); views only read the design and the sizing result.
import { loadDesign, newDesign, serializeDesign, mergeHostTypes, clusterReason, summaryLine, FORMAT_VERSION } from "../../engine/src/index.js";
                                                                      
import { openSaved, save, forget, propose, sizeDesign } from "./store.js";
                                           
import { STEPS, stepById } from "./flow.js";
import { expertHtml } from "./expert.js";
                                            
import { fieldOps, hostTypeOps, actionOps, identityOps } from "./edit.js";
import { netOps, nicsOps } from "./hostnet.js";
import { nsxOps } from "./nsx.js";
import { planOps, proposePlan } from "./ip.js";
import { evaluate, scorecard, deviationOps } from "./rules.js";
import { easyOptions, applyOptionOps, snapOf } from "./easy.js";
                                                        
import { easyHtml } from "./guided.js";
import { readExport, rebuild, SHEETS } from "./rvimport.js";
import { stepHtml, stateTag } from "./guided.js";
import { stepState, recommendOps, skipOps, reopenOps } from "./steps.js";
                                                
                                        

const $ = (id        ) => document.getElementById(id) ;
const esc = (s         ) => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] ));
const nf = (n        , d = 0) => (Number.isFinite(n) ? n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }) : "–");

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
  if (h[0] === "expert") return { view: "expert" };
  if (h[0] === "easy") return { view: "easy" };
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
  <a class="expert ${r.view === "easy" ? "on" : ""}" href="#/easy">Easy button <span class="hint">three complete options</span></a>
  <a class="expert ${r.view === "expert" ? "on" : ""}" href="#/expert">Expert view <span class="hint">all settings on one page</span></a>`;
}

function summaryHtml() {
  const r = result, crit = r.warnings.filter(w => w.lvl === "crit"), warn = r.warnings.filter(w => w.lvl === "warn");
  const tiles = [["Hosts", nf(r.hosts)], ["VCF cores", nf(r.licCores)], ["vSAN add-on", `${nf(r.lic.addOnTiB)} TiB`], ["Clusters", nf(r.clusters.length)]];
  return `<section class="card summary" aria-live="polite">
    <header><h2>Live summary</h2></header>
    <p class="line">${esc(summaryLine(r))}</p>
    <div class="tiles">${tiles.map(([k, v]) => `<div class="tile"><span class="k">${k}</span><span class="big num">${v}</span></div>`).join("")}</div>
    ${r.clusters.length ? `<ul class="reasons">${r.clusters.slice(0, 8).map(c => `<li><b>${esc(c.c.name)}</b> ${esc(clusterReason(c))}</li>`).join("")}${r.clusters.length > 8 ? `<li class="hint">…and ${r.clusters.length - 8} more clusters</li>` : ""}</ul>` : ""}
    ${(sc => `<p class="hint bp">Best practices: ${sc.reduce((a, p) => a + p.open, 0)} not met, ${sc.reduce((a, p) => a + p.accepted, 0)} accepted as deviations${sc.some(p => p.atRisk) ? ` · <span class="pill crit">At risk: ${esc(sc.filter(p => p.atRisk).map(p => p.label).join(", "))}</span>` : ""}. <a href="#/step/review">Scorecard</a></p>`)(scorecard(design, evaluate(design, r)))}
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
  $("summary").innerHTML = summaryHtml();
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
});
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

$("ver").textContent = `design format ${FORMAT_VERSION}`;
render();
