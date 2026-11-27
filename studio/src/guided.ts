// Guided steps: one decision area per screen, built from the same pieces as the Expert view.
// Skippable steps offer Use recommended / Skip for now; Review lists every step, what changed from the
// recommendation and what is still open. A pure function of the design → HTML (no DOM); tested.
import { maxFor, tierMax, hwText, clusterReason as clusterReasonText } from "../../engine/src/index.ts";
import type { Design, SizingResult } from "../../engine/src/index.ts";
import { STEPS, stepById } from "./flow.ts";
import { policyFields, fleetFields, clusterFields } from "./fields.ts";
import { fields, btn, projectHtml, workloadHtml, hostTypesHtml, topologyHtml, addonsHtml, identityHtml, hostnetHtml, nsxHtml, planHtml, rulesBox } from "./expert.ts";
import { evaluate, scorecard, decisionRegister, riskRegister, scorable } from "./rules.ts";
import type { EasyInputs, EasyOption } from "./easy.ts";
import { enabled } from "./flags.ts";
import type { ExpertUi } from "./expert.ts";
import { stepState, changes, STORAGE_KEYS } from "./steps.ts";
import type { StepState } from "./steps.ts";

const attr = (o: unknown) => esc(JSON.stringify(o));
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

export const STATE_LABEL: Record<string, string> = { done: "Done", todo: "To do", decided: "Decided", recommended: "Recommended", skipped: "Skipped", open: "Not reviewed", coming: "Coming next" };
export const stateTag = (s: StepState) => (s ? `<span class="tag st-${s}">${STATE_LABEL[s]}</span>` : "");

function storageHtml(d: Design) {
  const out: string[] = [];
  for (const inst of d.topology.instances) for (const dm of [inst.mgmt, ...inst.wlds]) for (const c of dm.clusters) {
    const hw = d.hostTypes.find(h => h.id === c.hostType) || d.hostTypes[0]; if (!hw) continue;
    const fs = clusterFields(c, hw, d, maxFor(c), tierMax(c, hw)).filter(f => (STORAGE_KEYS as readonly string[]).includes(f.key));
    out.push(`<div class="addon"><h4>${esc(c.name)} <span class="hint">${esc((d.topology.instances.length > 1 ? inst.name + " / " : "") + dm.name)} · ${esc(hw.name)}</span></h4>
      <div class="grid">${fields(fs, c as unknown as Record<string, unknown>, { t: "node", id: c.id })}</div></div>`);
  }
  return out.length ? `<div class="addons">${out.join("")}</div>` : `<p class="hint">No clusters yet. Add them in Topology; each then gets its storage settings here.</p>`;
}

function choiceBar(d: Design, id: string) {
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
function body(d: Design, r: SizingResult, ui: ExpertUi, id: string): string {
  switch (id) {
    case "project": return projectHtml(d);
    case "workload": return workloadHtml(d, ui) + (!enabled("easyButton") ? "" : `<section class="card"><div class="choice"><div><h3>Easy button</h3><p class="hint">Three complete designs from this workload (fewest hosts, lowest licensing, and the sweet spot between them), with recommended values for every step. Pick one and go straight to Review.</p></div><div class="row"><a class="btn" href="#/easy">Easy button</a></div></div></section>`);
    case "policy": return `<div class="grid">${fields(policyFields(), d.policy as unknown as Record<string, unknown>, { t: "sec", sec: "policy" })}</div>`;
    case "fleet": return `<div class="grid">${fields(fleetFields(d.fleet), d.fleet as unknown as Record<string, unknown>, { t: "sec", sec: "fleet" })}</div>`;
    case "identity": return identityHtml(d) + rulesBox(d, r, ["identity"]);
    case "hosts": return hostTypesHtml(d);
    case "topology": return topologyHtml(d, r, ui, STORAGE_KEYS) + `<p class="hint">vSAN policy, reserves and memory tiering for each cluster are in the next step, Cluster storage.</p>` + rulesBox(d, r, ["topology"]);
    case "storage": return storageHtml(d) + rulesBox(d, r, ["storage"]);
    case "hostnet": return hostnetHtml(d, r) + rulesBox(d, r, ["hostnet"]);
    case "nsx": return nsxHtml(d) + rulesBox(d, r, ["nsx"]);
    case "addons": return addonsHtml(d);
    default: return "";
  }
}

function reviewHtml(d: Design, r: SizingResult) {
  const rows = STEPS.filter(s => !["start", "review", "output"].includes(s.id)).map(s => {
    const st = stepState(d, s.id), ch = changes(d, s.id);
    const detail = ch.length ? `<ul class="changes">${ch.map(c => `<li>${c.where ? `<b>${esc(c.where)}</b> ` : ""}${esc(c.label)}: ${esc(c.value)} <span class="hint">(recommended ${esc(c.def)})</span></li>`).join("")}</ul>` : `<span class="hint">${esc(st.note)}</span>`;
    return `<tr><td>${s.n}</td><td>${s.kind === "coming" ? esc(s.title) : `<a href="#/step/${s.id}">${esc(s.title)}</a>`}</td><td>${stateTag(st.state)}</td><td>${detail}</td></tr>`;
  }).join("");
  const res = evaluate(d, r), score = scorecard(d, res), decs = decisionRegister(d, res), risks = riskRegister(res);
  const open = STEPS.flatMap(s => { const st = stepState(d, s.id);
    return [...(["todo", "skipped", "open"].includes(st.state) ? [{ s, t: st.note }] : []), ...(st.open || []).map(t => ({ s, t }))]; });
  const ready = scorable(d, r);
  const ruleOpen = !ready ? [] : res.filter(x => x.status === "open").flatMap(x => x.findings.filter(f => !f.reason).map(f => ({ x, f })));
  const stepLink = (id: string) => id === "plan" ? `<a href="#plan">IP / VLAN / DNS plan</a>` : `<a href="#/step/${id}">${esc(stepById(id)?.title || id)}</a>`;
  const KIND: Record<string, string> = { changed: "Changed from the recommendation", recommended: "Recommendation accepted", auto: "Auto-selected", deviation: "Deviation accepted" };
  const crit = r.warnings.filter(w => w.lvl === "crit"), warn = r.warnings.filter(w => w.lvl === "warn");
  return `<div class="tablewrap"><table class="review"><thead><tr><th>#</th><th>Step</th><th>Status</th><th>Decisions and open items</th></tr></thead><tbody>${rows}</tbody></table></div>
    <h4>Open items</h4>
    ${open.length || ruleOpen.length ? `<ul>${open.map(o => `<li><a href="#/step/${o.s.id}">${esc(o.s.title)}</a>: ${esc(o.t)}</li>`).join("")}${ruleOpen.map(o => `<li>${stepLink(o.x.rule.step)}: <span class="lvl lvl-${o.x.rule.level}">${o.x.rule.level === "required" ? "Required" : o.x.rule.level === "recommended" ? "Recommended" : "Consider"}</span> ${esc(o.x.rule.title)}: ${esc(o.f.where)}. Change the design, or accept it with a reason.</li>`).join("")}</ul>` : `<p class="hint">None.</p>`}
    <h4>Best-practice scorecard</h4>
    ${!ready ? `<p class="hint">Scores appear once the design has a workload and a topology to check.</p>` : `<div class="tablewrap"><table class="score"><thead><tr><th>Pillar</th><th class="n">Met</th><th class="n">Deviations accepted</th><th class="n">Not met</th><th>Status</th></tr></thead><tbody>
      ${score.map(p => `<tr><td>${esc(p.label)}</td><td class="n num">${p.met} of ${p.applicable}</td><td class="n num">${p.accepted}</td><td class="n num">${p.open}</td><td>${p.atRisk ? `<span class="pill crit">At risk</span> ` : ""}${p.incomplete.length ? `<span class="pill warn">Incomplete: ${esc(p.incomplete.join(", "))} skipped</span>` : ""}${!p.atRisk && !p.incomplete.length ? (p.open ? "Open items" : p.applicable ? "Good" : "Nothing to check yet") : ""}</td></tr>`).join("")}
    </tbody></table></div>`}
    <h4>Design decisions</h4>
    ${decs.length ? `<div class="tablewrap"><table class="decisions"><thead><tr><th>Step</th><th>Decision</th><th>Kind</th><th>Reason</th></tr></thead><tbody>${decs.map(x => `<tr><td>${esc(x.step)}</td><td>${esc(x.text)}</td><td>${KIND[x.kind]}</td><td>${esc(x.reason || "")}</td></tr>`).join("")}</tbody></table></div>` : `<p class="hint">None yet.</p>`}
    <h4>Risks</h4>
    ${risks.length ? `<div class="tablewrap"><table class="risks"><thead><tr><th>Risk</th><th>Where</th><th>Rule</th><th>Accepted because</th></tr></thead><tbody>${risks.map(x => `<tr class="${x.high ? "high" : ""}"><td>${x.high ? `<span class="pill crit">High</span> ` : ""}${esc(x.risk)}</td><td>${esc(x.where)}</td><td>${esc(x.rule.title)} <span class="hint">(${esc(x.rule.source)})</span></td><td>${esc(x.reason)}</td></tr>`).join("")}</tbody></table></div>` : `<p class="hint">None: every deviation accepted with a reason becomes a risk here.</p>`}
    <h4>Sizing checks</h4>
    ${crit.length || warn.length ? `<ul class="warns">${[...crit, ...warn].map(w => `<li class="${w.lvl}">${esc(w.t)}</li>`).join("")}</ul>` : `<p class="hint">No issues.</p>`}
    <h3 id="plan">IP / VLAN / DNS plan</h3>
    ${planHtml(d, r)}`;
}

function outputHtml() {
  return `<p>The design outputs come in a later build step: a high-level design document, architecture diagrams (SVG, PNG, draw.io), IP / VLAN / DNS tables and a prerequisites checklist.</p>
    <p class="hint">Until then, Save design file keeps everything decided so far; the outputs will be produced from that same file.</p>
    <div class="row"><button type="button" data-act="save-file">Save design file</button></div>`;
}

/** One guided step's screen. */
export function stepHtml(d: Design, r: SizingResult, ui: ExpertUi, id: string): string {
  const s = stepById(id)!, i = STEPS.indexOf(s);
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

// ---------- easy button ----------
const _nf = (n: number) => (Number.isFinite(n) ? n.toLocaleString("en-US", { maximumFractionDigits: 0 }) : "–");
const radio = (name: string, v: string, cur: string, label: string, dis = false) => `<label class="radio${dis ? " dim" : ""}"><input type="radio" name="${name}" value="${v}" data-easyin="${name}" ${v === cur ? "checked" : ""} ${dis ? "disabled" : ""}> ${esc(label)}</label>`;
/** The easy button: inputs, then three option cards to pick from. */
export function easyHtml(d: Design, inp: EasyInputs, opts: EasyOption[] | null) {
  const hasWork = d.workload.groups.some(g => g.include && ((Number(g.values.vcpu) || 0) > 0 || (Number(g.values.vramGiB) || 0) > 0));
  const custom = inp.source === "custom";
  const card = (o: EasyOption) => {
    const tiles = [["Hosts", _nf(o.hosts)], ["Licensed cores", _nf(o.licCores)], ["vSAN add-on", `${_nf(o.addOnTiB)} TiB`]];
    return `<div class="option"><h3>${esc(o.label)}</h3><p class="hint">${esc(o.why)}.${o.same.length ? ` Same design as ${esc(o.same.join(" and "))}.` : ""}</p>
      <p><b>${esc(custom ? o.hw.name + ": " : "")}${esc(hwText(o.hw))}</b>${o.tier ? `<br><span class="hint">NVMe memory tiering on where workloads run</span>` : ""}</p>
      <div class="tiles">${tiles.map(([k, v]) => `<div class="tile"><span class="k">${k}</span><span class="big num">${v}</span></div>`).join("")}</div>
      <ul class="reasons">${o.r.clusters.map(c => `<li><b>${esc(c.c.name)}</b> ${esc(clusterReasonText(c))}</li>`).join("")}</ul>
      ${o.raised.length ? `<ul class="reasons">${o.raised.map(t => `<li>${esc(t)}.</li>`).join("")}</ul>` : ""}
      ${o.issues.length
        ? `<p class="hint"><span class="pill warn">Below best practice</span> No option meets every best practice for this workload; this one accepts:</p><ul class="warns">${o.issues.map(i => `<li class="warn">${esc(i.text)}</li>`).join("")}</ul>`
        : `<p class="hint"><span class="pill good">Meets every design best practice</span></p>`}
      <p class="hint">Still yours to enter: DNS and NTP, identity provider and roles, break-glass, BGP ASNs and the IP plan.</p>
      <div class="row"><button type="button" data-easy="${esc(o.key)}">Use this option</button></div></div>`;
  };
  return `<section class="card step">
    <header><h2>Easy button</h2></header>
    <p>Three complete designs from your workload. Every automatic choice is recorded with its reason and can be changed afterwards like any other value. Customer details (DNS and NTP, identity provider and roles, break-glass, BGP ASNs, the IP plan) are left for you.</p>
    ${hasWork ? "" : `<p class="need">Add the workload first: RVTools exports or a manual group with vCPU or vRAM.</p>`}
    <div class="grid easyin">
      <fieldset><legend>Host types</legend>${radio("source", "generic", inp.source, "Generic, from the hardware catalogue")}${radio("source", "custom", inp.source, `My host types (${d.hostTypes.length})`, !d.hostTypes.length)}</fieldset>
      <fieldset><legend>CPU vendor</legend>${radio("vendor", "either", inp.vendor, "Either", custom)}${radio("vendor", "intel", inp.vendor, "Intel Xeon", custom)}${radio("vendor", "amd", inp.vendor, "AMD EPYC", custom)}</fieldset>
      <fieldset><legend>Layout</legend>${radio("layout", "standard", inp.layout, "Management domain + workload domain")}${radio("layout", "consolidated", inp.layout, "Consolidated (workloads in the management domain)")}</fieldset>
    </div>
    ${hasWork && opts ? (opts.length ? `<div class="options">${opts.map(card).join("")}</div>` : `<p class="need">No configuration fits this workload.</p>`) : ""}
    <p class="hint">Generic hosts: 2 sockets, every core count and balanced memory configuration in the catalogue, with the fewest 7.68 TB NVMe drives that keep the lowest host count. One instance; a 2-node large edge cluster where workloads run. Applying an option replaces the host types and topology.</p>
  </section>`;
}
