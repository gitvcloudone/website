// Built from TypeScript by studio/build.mjs. Edit the .ts source, then run npm run build.
// Guided steps: one decision area per screen, built from the same pieces as the Expert view.
// Skippable steps offer Use recommended / Skip for now; Review lists every step, what changed from the
// recommendation and what is still open. A pure function of the design → HTML (no DOM); tested.
import { maxFor, tierMax } from "../../engine/src/index.js";
                                                                      
import { STEPS, stepById } from "./flow.js";
import { policyFields, fleetFields, clusterFields } from "./fields.js";
import { fields, btn, projectHtml, workloadHtml, hostTypesHtml, topologyHtml, addonsHtml, identityHtml } from "./expert.js";
                                            
import { stepState, changes, STORAGE_KEYS } from "./steps.js";
                                            

const attr = (o         ) => esc(JSON.stringify(o));
const esc = (s         ) => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] ));

export const STATE_LABEL                         = { done: "Done", todo: "To do", decided: "Decided", recommended: "Recommended", skipped: "Skipped", open: "Not reviewed", coming: "Coming next" };
export const stateTag = (s           ) => (s ? `<span class="tag st-${s}">${STATE_LABEL[s]}</span>` : "");

function storageHtml(d        ) {
  const out           = [];
  for (const inst of d.topology.instances) for (const dm of [inst.mgmt, ...inst.wlds]) for (const c of dm.clusters) {
    const hw = d.hostTypes.find(h => h.id === c.hostType) || d.hostTypes[0]; if (!hw) continue;
    const fs = clusterFields(c, hw, d, maxFor(c), tierMax(c, hw)).filter(f => (STORAGE_KEYS                     ).includes(f.key));
    out.push(`<div class="addon"><h4>${esc(c.name)} <span class="hint">${esc((d.topology.instances.length > 1 ? inst.name + " / " : "") + dm.name)} · ${esc(hw.name)}</span></h4>
      <div class="grid">${fields(fs, c                                      , { t: "node", id: c.id })}</div></div>`);
  }
  return out.length ? `<div class="addons">${out.join("")}</div>` : `<p class="hint">No clusters yet. Add them in Topology; each then gets its storage settings here.</p>`;
}

function choiceBar(d        , id        ) {
  const st = stepState(d, id), ch = changes(d, id);
  const rec = ch.length ? `Use recommended (resets ${ch.length} value${ch.length > 1 ? "s" : ""})` : "Use recommended";
  return `<div class="choicebar st-${st.state}">
    <div><b>${STATE_LABEL[st.state]}</b> <span class="hint">${esc(st.note)}</span></div>
    <div class="row">
      ${st.state === "recommended" ? "" : `<button type="button" data-step="${attr({ act: "recommend", id })}">${esc(rec)}</button>`}
      ${st.state === "decided" || st.state === "skipped" ? "" : `<button type="button" class="ghost" data-step="${attr({ act: "skip", id })}">Skip for now</button>`}
      ${st.state === "recommended" || st.state === "skipped" ? `<button type="button" class="link" data-step="${attr({ act: "reopen", id })}">Undo</button>` : ""}
    </div>
    <p class="hint">Use recommended records the defaults below as a decision. Skip for now leaves the step open: Review lists it, and the design document will mark it "to be defined".</p>
  </div>`;
}
function body(d        , r              , ui          , id        )         {
  switch (id) {
    case "project": return projectHtml(d);
    case "workload": return workloadHtml(d, ui);
    case "policy": return `<div class="grid">${fields(policyFields(), d.policy                                      , { t: "sec", sec: "policy" })}</div>`;
    case "fleet": return `<div class="grid">${fields(fleetFields(d.fleet), d.fleet                                      , { t: "sec", sec: "fleet" })}</div>`;
    case "identity": return identityHtml(d);
    case "hosts": return hostTypesHtml(d);
    case "topology": return topologyHtml(d, r, ui, STORAGE_KEYS) + `<p class="hint">vSAN policy, reserves and memory tiering for each cluster are in the next step, Cluster storage.</p>`;
    case "storage": return storageHtml(d);
    case "addons": return addonsHtml(d);
    default: return "";
  }
}

function reviewHtml(d        , r              ) {
  const rows = STEPS.filter(s => !["start", "review", "output"].includes(s.id)).map(s => {
    const st = stepState(d, s.id), ch = changes(d, s.id);
    const detail = ch.length ? `<ul class="changes">${ch.map(c => `<li>${c.where ? `<b>${esc(c.where)}</b> ` : ""}${esc(c.label)}: ${esc(c.value)} <span class="hint">(recommended ${esc(c.def)})</span></li>`).join("")}</ul>` : `<span class="hint">${esc(st.note)}</span>`;
    return `<tr><td>${s.n}</td><td>${s.kind === "coming" ? esc(s.title) : `<a href="#/step/${s.id}">${esc(s.title)}</a>`}</td><td>${stateTag(st.state)}</td><td>${detail}</td></tr>`;
  }).join("");
  const open = STEPS.flatMap(s => { const st = stepState(d, s.id);
    return ["todo", "skipped", "open"].includes(st.state) ? [{ s, t: st.note }] : (st.open || []).map(t => ({ s, t })); });
  const crit = r.warnings.filter(w => w.lvl === "crit"), warn = r.warnings.filter(w => w.lvl === "warn");
  return `<div class="tablewrap"><table class="review"><thead><tr><th>#</th><th>Step</th><th>Status</th><th>Decisions and open items</th></tr></thead><tbody>${rows}</tbody></table></div>
    <h4>Open items</h4>
    ${open.length ? `<ul>${open.map(o => `<li><a href="#/step/${o.s.id}">${esc(o.s.title)}</a>: ${esc(o.t)}</li>`).join("")}</ul>` : `<p class="hint">None.</p>`}
    <h4>Sizing checks</h4>
    ${crit.length || warn.length ? `<ul class="warns">${[...crit, ...warn].map(w => `<li class="${w.lvl}">${esc(w.t)}</li>`).join("")}</ul>` : `<p class="hint">No issues.</p>`}`;
}

function outputHtml() {
  return `<p>The design outputs come in a later build step: a high-level design document, architecture diagrams (SVG, PNG, draw.io), IP / VLAN / DNS tables and a prerequisites checklist.</p>
    <p class="hint">Until then, Save design file keeps everything decided so far; the outputs will be produced from that same file.</p>
    <div class="row"><button type="button" data-act="save-file">Save design file</button></div>`;
}

/** One guided step's screen. */
export function stepHtml(d        , r              , ui          , id        )         {
  const s = stepById(id) , i = STEPS.indexOf(s);
  const prev = STEPS.slice(0, i).reverse().find(x => x.kind !== "coming"), next = STEPS.slice(i + 1).find(x => x.kind !== "coming");
  const st = stepState(d, id);
  const content = s.kind === "coming" ? `<p class="hint">This step is designed and comes in a later stage of the build. Its choices will land in the same design file.</p>`
    : id === "review" ? reviewHtml(d, r) : id === "output" ? outputHtml() : body(d, r, ui, id);
  return `<section class="card step">
    <header><h2>${s.n}. ${esc(s.title)}</h2>${stateTag(st.state)}</header>
    <p>${esc(s.blurb)}</p>
    ${s.kind === "required" && st.state === "todo" ? `<p class="need">${esc(st.note)}</p>` : ""}
    ${s.kind === "skippable" ? choiceBar(d, id) : ""}
    <div class="xbody">${content}</div>
    <div class="row nav">${prev ? `<a class="btn ghost" href="#/step/${prev.id}">← ${esc(prev.title)}</a>` : ""}${next ? `<a class="btn" href="#/step/${next.id}">${esc(next.title)} →</a>` : ""}</div>
  </section>`;
}
