// Built from TypeScript by studio/build.mjs. Edit the .ts source, then run npm run build.
// Expert view: every setting on one page, in the order of the guided steps, beside the live summary.
// Topology is a tree; the selected instance, domain or cluster opens its settings next to it.
// A pure function of the design → HTML (no DOM), so tests can render it. Inputs carry data-edit
// (what they change); buttons carry data-xact (a structural change); main.ts turns both into proposals.
import { PROFILES, IDENTITY, NETWORK, workloadTotals, hostCfg, maxFor, tierMax, settingsFromDesign, clusterReason, hwText, HOST_LCPU_MAX } from "../../engine/src/index.js";
                                                                                                        
import { projectFields, policyFields, fleetFields, addonFields, identityFields, breakGlassFields, ACCESS, fleetNetFields, clusterNetFields, NIC_COUNTS, hostTypeFields, domainFields, domainNsxFields, edgeSizes, clusterFields, STORAGE } from "./fields.js";
                                                 
import { locate, moveTo91 } from "./edit.js";
import { sizeDesign } from "./store.js";
import { allClusters, recommended, effective, networksOf, hostsByCluster, nicsOf } from "./hostnet.js";
import { overridden, estate } from "./rvimport.js";
                                                         

/** rv: RVTools files read during this visit (kept in memory only) and what the last rebuild reported. */
                                                                                                                                               

const esc = (s         ) => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] ));
const nf = (n        , d = 0) => (Number.isFinite(n) ? n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }) : "–");
const attr = (o         ) => esc(JSON.stringify(o));
const plural = (n        , w        ) => `${nf(n)} ${w}${n === 1 ? "" : "s"}`;

/** One field. `edit` says what it changes: {t:"sec",sec,key} | {t:"node",id,key} | {t:"ht",id,key} | {t:"grp",i,sub?,key}. */
export function fieldHtml(f       , value         , edit                         )         {
  const off = f.on === false, changed = f.def !== undefined && value !== f.def;
  const da = `data-edit="${attr({ ...edit, key: f.key })}" data-type="${f.type}"${off ? " disabled" : ""}`;
  const why = f.why ? ` <span class="why" tabindex="0" role="note" title="${esc(f.why)}" aria-label="${esc(f.why)}">?</span>` : "";
  const mark = changed ? ` <span class="chg" title="Changed from the default (${esc(String(f.def))})">changed</span>` : "";
  const cls = `f${off ? " dim" : ""}${changed ? " changed" : ""}`;
  if (f.type === "bool") return `<label class="toggle${off ? " dim" : ""}${changed ? " changed" : ""}"><input type="checkbox" ${value ? "checked" : ""} ${da}> ${esc(f.label)}${why}${mark}</label>`;
  let input        ;
  if (f.type === "select") {
    const num = (f.choices || []).some(c => typeof c[0] === "number");
    input = `<select ${da}${num ? ' data-num="1"' : ""}>${(f.choices || []).map(([v, l, dis]) => `<option value="${esc(v)}" ${String(v) === String(value) ? "selected" : ""} ${dis ? "disabled" : ""}>${esc(l)}</option>`).join("")}</select>`;
  } else if (f.type === "textarea") input = `<textarea rows="2" ${da} placeholder="${esc(f.placeholder || "")}">${esc(value)}</textarea>`;
  else if (f.type === "number") input = `<input type="number" value="${esc(value)}" ${f.min !== undefined ? `min="${f.min}"` : ""} ${f.max !== undefined ? `max="${f.max}"` : ""} step="${f.step ?? 1}" ${da}>`;
  else input = `<input type="text" value="${esc(value)}" placeholder="${esc(f.placeholder || "")}" ${da}>`;
  return `<label class="${cls}"><span class="lbl">${esc(f.label)}${why}${mark}</span>${input}</label>`;
}
export const fields = (fs         , obj                         , edit                         ) => fs.map(f => fieldHtml(f, obj[f.key], edit)).join("");
export const btn = (act        , label        , o                          = {}, cls = "link") => `<button type="button" class="${cls}" data-xact="${attr({ act, ...o })}">${esc(label)}</button>`;

function section(id        , title        , status        , body        , ui          , step         ) {
  return `<details class="card xsec" data-sec="${id}" ${ui.closed.has(id) ? "" : "open"}>
    <summary><h2>${esc(title)}</h2><span class="hint">${esc(status)}</span>${step ? `<a class="link step" href="#/step/${step}">guided</a>` : ""}</summary>
    <div class="xbody">${body}</div></details>`;
}

/** Every cluster in the design, labelled for pickers ("Instance 1 / WLD-01 / wld01-cl01"). */
export function clusterChoices(d        )           {
  const out           = [], many = d.topology.instances.length > 1;
  for (const i of d.topology.instances) for (const dm of [i.mgmt, ...i.wlds]) for (const c of dm.clusters) out.push([c.id, `${many ? i.name + " / " : ""}${dm.name} / ${c.name}`]);
  return out;
}

// ---------- sections ----------
function rvtoolsHtml(d        , ui          ) {
  const files = ui.rv?.files || [], b = ui.rv?.stats, sc = d.workload.rvtoolsScope                                      ;
  const drop = `<div class="drop" data-act="rv-open" tabindex="0" role="button" aria-label="Add RVTools exports"><strong>Drop RVTools exports here</strong> or click to choose (.xlsx / .xlsm, several at once).<br><span class="hint">Files are read in your browser and never uploaded. Only the groups built from them are kept in the design.</span></div>`;
  const earlier = !files.length && d.workload.groups.some(g => g.source === "rvtools")
    ? `<p class="hint">The RVTools groups below were read earlier. Add the same files again to change the scope or re-read them; your edits, placements and peaks are kept.</p>` : "";
  if (!files.length) return drop + earlier;
  const list = `<div class="tablewrap"><table class="files"><thead><tr><th>Use</th><th>File</th><th>vCenter</th><th class="n">VMs</th><th>Status</th><th></th></tr></thead><tbody>${files.map((f, i) => `<tr>
    <td><input type="checkbox" data-rvfile="${i}" ${f.include ? "checked" : ""} ${f.status !== "ok" ? "disabled" : ""} aria-label="Include ${esc(f.fileName)}"></td>
    <td title="${esc(f.fileName)}">${esc(f.fileName.length > 34 ? f.fileName.slice(0, 31) + "…" : f.fileName)}</td><td>${esc(f.vcenter || "")}</td><td class="n num">${nf(f.vms.length)}</td>
    <td>${f.status === "ok" ? (f.issues && f.issues.length ? `<span class="pill warn" title="${esc(f.issues.join(" "))}">read, ${plural(f.issues.length, "note")}</span>` : `<span class="pill good">read</span>`) : `<span class="pill crit">error</span> <span class="hint">${esc(f.error)}</span>`}</td>
    <td><button type="button" class="link" data-rvdel="${i}">Remove</button></td></tr>`).join("")}</tbody></table></div>`;
  const ed = { t: "scope" };
  const scope = `<div class="grid">${[
    fieldHtml({ key: "includeOff", label: "Include powered-off VMs", type: "bool", def: true }, sc.includeOff, ed),
    fieldHtml({ key: "templatesStorage", label: "Count templates (storage only)", type: "bool", def: true }, sc.templatesStorage, ed),
    fieldHtml({ key: "exVcls", label: "Exclude vCLS agent VMs", type: "bool", def: true }, sc.exVcls, ed),
    fieldHtml({ key: "groupBy", label: "Group by", type: "select", choices: [["file", "vCenter (file)"], ["cluster", "vSphere cluster"]], def: "file" }, sc.groupBy, ed),
    fieldHtml({ key: "patterns", label: "Exclude VMs whose name matches", type: "text", placeholder: "test-*, *-old", why: "Comma-separated, * = any characters, not case-sensitive. Examples: test-* · *-old · *temp* · APP01" }, sc.patterns, ed),
  ].join("")}</div>`;
  let stat = "";
  if (b) {
    const pct = (x        ) => `${Math.round(x * 100)}%`;
    const tip = (r                                                     ) => r.count ? `${r.label} matched ${plural(r.count, "VM")}, e.g. ${r.samples.join(", ")}${r.count > r.samples.length ? ` …and ${nf(r.count - r.samples.length)} more` : ""}` : `${r.label} didn't match any VM. Check the spelling, or remove it.`;
    const big = b.rules.filter(r => b.considered > 0 && r.count / b.considered > 0.5);
    stat = `<p class="statusline">${b.rules.length ? `Excluded: ${b.rules.map(r => `<span title="${esc(tip(r))}" class="excl">${esc(r.label)} ${nf(r.count)}${r.count ? "" : " ⚠"}</span>`).join(" · ")} · ${nf(b.excluded)} VMs in total` : "No VMs excluded by name."}
      ${big.map(r => `<br><span class="pill warn">⚠ ${esc(r.label)} excludes ${pct(r.count / b.considered)} of the VMs. Check it's what you meant.</span>`).join("")}<br>
      ${nf(b.dups)} duplicates removed · ${nf(b.templates)} templates (${sc.templatesStorage ? "storage only" : "not counted"})${sc.includeOff ? "" : ` · ${nf(b.offExcluded)} powered-off VMs left out`}</p>`;
  }
  const e = estate(files);
  const vcpu = workloadTotals(d.workload.groups.filter(g => g.source === "rvtools")                      ).vcpu;
  const est = e ? `<p class="note"><b>Current estate (from vHost):</b> ${nf(e.hosts)} hosts · ${nf(e.cores)} cores · ${nf(e.ramGiB)} GiB RAM · ${nf(vcpu / e.cores, 2)} vCPU per core (VMs in scope)<br>${e.models.map(([m, c]) => `${esc(m)} × ${c}`).join(" · ")}</p>` : "";
  return drop + list + scope + stat + est;
}

export function workloadHtml(d        , ui          ) {
  const gs = d.workload.groups, cl = clusterChoices(d);
  const COLS                             = [["vms", "VMs", 0], ["vcpu", "vCPU", 0], ["vramGiB", "vRAM GiB", 0], ["usedTiB", "Used TiB", 1], ["allocTiB", "Allocated TiB", 1], ["templTiB", "Templates TiB", 1]];
  const sel = (i        , key        , v        , opts          ) => `<select data-edit="${attr({ t: "grp", i, sub: "opts", key })}" data-type="select" aria-label="${key}">${opts.map(([k, l]) => `<option value="${esc(k)}" ${String(k) === String(v) ? "selected" : ""}>${esc(l)}</option>`).join("")}</select>`;
  const pct = (i        , key        , v        ) => `<input type="number" min="0" max="100" step="1" value="${v || ""}" placeholder="ratio" data-edit="${attr({ t: "grp", i, sub: "opts", key })}" data-type="number" data-blank="0" aria-label="${key}">`;
  const rows = gs.map((g, i) => {
    const o = g.opts || {}, over = overridden(g), rv = g.source === "rvtools";
    const snap = rv && g.meta && (g.meta                                                                                      ).snap;
    const p = (x               ) => (x === null || x === undefined ? "–" : Math.round(x * 100) + "%");
    return `<tr>
      <td><input type="checkbox" ${g.include ? "checked" : ""} data-edit="${attr({ t: "grp", i, key: "include" })}" data-type="bool" aria-label="Include ${esc(g.name)}"></td>
      <td>${rv ? `${esc(g.name)} <span class="pill">RVTools</span>${snap ? `<br><span class="hint" title="Point-in-time values from the RVTools export (powered-on VMs). Reference only.">snapshot: CPU ${p(snap.cpuPct)} · RAM active ${p(snap.actPct)}</span>` : ""}`
        : `<input type="text" value="${esc(g.name)}" data-edit="${attr({ t: "grp", i, key: "name" })}" data-type="text" aria-label="Group name">`}</td>
      ${COLS.map(([k, , dp]) => `<td class="n"><input type="number" min="0" step="${dp ? 0.1 : 1}" value="${+Number(g.values[k] || 0).toFixed(dp)}" class="${over.includes(k) ? "ov" : ""}" ${over.includes(k) ? `title="Read from RVTools: ${nf(Number(g.parsed [k]), dp)}"` : ""} data-edit="${attr({ t: "grp", i, sub: "values", key: k })}" data-type="number" aria-label="${k}"></td>`).join("")}
      <td>${sel(i, "place", o.place || "auto", [["auto", "Auto"], ...cl])}</td>
      <td>${pct(i, "cpuPeak", o.cpuPeak || 0)}</td><td>${pct(i, "ramPeak", o.ramPeak || 0)}</td>
      <td>${sel(i, "drTo", o.drTo || "", [["", "None"], ...cl])}${o.drTo ? sel(i, "drMode", o.drMode || "storage", [["storage", "Replica storage only"], ["full", "Storage + failover compute"]]) : ""}</td>
      <td>${rv ? (over.length ? btn("resetGroup", "Reset", { index: i }) : "") : btn("delGroup", "Remove", { index: i })}</td></tr>`;
  }).join("");
  const t                         = workloadTotals(gs                      );
  const tot = gs.length ? `<tr class="tot"><td></td><td>Total in scope</td>${COLS.map(([k, , dp]) => `<td class="n num">${nf(t[k], dp)}</td>`).join("")}<td colspan="5"></td></tr>` : "";
  return rvtoolsHtml(d, ui) + `${gs.length ? `<div class="tablewrap"><table class="groups"><thead><tr><th>Use</th><th>Group</th>${COLS.map(c => `<th class="n">${c[1]}</th>`).join("")}<th>Place in</th><th title="Size on measured peak instead of the ratio: cores = vCPU × peak ÷ 80%">Peak CPU %</th><th>Peak RAM %</th><th>Protect to</th><th></th></tr></thead><tbody>${rows}${tot}</tbody></table></div>` : `<p class="hint">No workload yet.</p>`}
    <div class="row">${btn("addGroup", "Add manual group", {}, "ghost")}<span class="hint">Amber values are edited by hand (Reset goes back to RVTools). Place in: Auto spreads a group over clusters that take auto workloads. Peak CPU % / RAM % (from monitoring) size a group on use instead of the ratios.</span></div>`;
}

export function hostTypesHtml(d        ) {
  const users = (id        ) => d.topology.instances.flatMap(i => [i.mgmt, ...i.wlds].flatMap(dm => dm.clusters.filter(c => c.hostType === id).map(c => c.name)));
  return d.hostTypes.map(h => {
    const u = users(h.id), cores = h.sockets * h.cores, thr = h.ht ? cores * 2 : cores;
    return `<div class="ht"><div class="dh"><b>${esc(h.name)}</b><span class="hint">${esc(hwText(h))}</span>
      ${btn("dupHt", "Duplicate", { id: h.id })}${u.length ? `<span class="hint">used by ${esc(u.join(", "))}</span>` : btn("delHt", "Remove", { id: h.id })}</div>
      <div class="grid">${fields(hostTypeFields(h), h                                      , { t: "ht", id: h.id })}</div>
      <p class="hint">${cores} cores, ${thr} threads${thr > HOST_LCPU_MAX ? ` <span class="pill warn">above vSphere's ${HOST_LCPU_MAX} per host</span>` : ""} · ${nf(h.sockets * Math.max(16, h.cores))} licensed cores · ${nf(h.ramGB)} GB RAM · NVMe ${nf(h.nvme * h.nvmeTB * 1e12 / 1024 ** 4, 2)} TiB raw</p></div>`;
  }).join("") + `<div class="row">${btn("addHt", "Add host type", {}, "ghost")}<span class="hint">Only real configurations are offered: current Xeon / EPYC core counts and balanced memory. A host types file opens with Open file.</span></div>`;
}

function treeHtml(d        , r              , sel        ) {
  const hosts = new Map                ();
  for (const c of r.clusters) hosts.set(c.c.id, (hosts.get(c.c.id) || 0) + c.total);
  const node = (id        , label        , hint        , cls        ) => `<button type="button" class="ghost node ${cls} ${id === sel ? "on" : ""}" data-sel="${esc(id)}" ${id === sel ? 'aria-current="true"' : ""}><span>${esc(label)}</span><span class="hint">${esc(hint)}</span></button>`;
  const dom = (dm        ) => `<li>${node(dm.id, dm.name, dm.kind === "mgmt" ? "management" : "workload domain", "dom")}
    <ul>${dm.clusters.map(c => `<li>${node(c.id, c.name, hosts.has(c.id) ? plural(hosts.get(c.id) , "host") : "", "clu")}</li>`).join("")}</ul></li>`;
  return `<ul class="tree">${d.topology.instances.map(i => `<li>${node(i.id, i.name, plural(1 + i.wlds.length, "domain"), "inst")}<ul>${[i.mgmt, ...i.wlds].map(dom).join("")}</ul></li>`).join("")}</ul>
    <div class="row">${btn("addInst", "Add instance", {}, "ghost")}</div>`;
}

function instPanel(d        , inst          ) {
  const ii = d.topology.instances.indexOf(inst);
  const prof        = ii === 0
    ? { key: "profile", label: "Deployment model", type: "select", choices: [["", `${d.fleet.profile} (the fleet model, under Fleet management)`]], on: false }
    : { key: "profile", label: "Deployment model", type: "select", choices: [["", `Same as fleet (${d.fleet.profile})`], ...Object.keys(PROFILES).map(k => [k, k]          )], why: "An additional instance can use a different model from the fleet, e.g. a smaller remote site." };
  return `<h3>${esc(inst.name)} <span class="hint">instance${ii === 0 ? " · fleet management runs here" : ""}</span></h3>
    <div class="grid">${fieldHtml({ key: "name", label: "Instance name", type: "text" }, inst.name, { t: "node", id: inst.id })}${fieldHtml(prof, ii === 0 ? "" : inst.profile || "", { t: "node", id: inst.id })}</div>
    <div class="row">${btn("addWld", "Add workload domain", { id: inst.id }, "ghost")}${btn("dupInst", "Duplicate instance", { id: inst.id })}${btn("delInst", "Remove instance", { id: inst.id })}</div>`;
}

function domPanel(d        , dm        , inst          ) {
  const ii = d.topology.instances.indexOf(inst), p = PROFILES[ii === 0 || !inst.profile ? d.fleet.profile : inst.profile] || PROFILES[d.fleet.profile];
  const mg = dm.kind === "mgmt", obj = dm                                      , ed = { t: "node", id: dm.id };
  const head = mg
    ? `<p class="hint">Management domain · vCenter ${esc(p.vc)} · NSX ${p.nsx[0]} × ${esc(p.nsx[1])} (set by the deployment model). Its first cluster runs the VCF management appliances and every workload domain's vCenter and NSX Managers.</p>`
    : `<div class="grid">${fields(domainFields(), obj, ed)}${dm.nsx === "dedicated" ? fields(domainNsxFields(), obj, ed) : ""}</div>`;
  const onOpts           = [...dm.clusters.map(c => [c.id, `on ${c.name}`]          ), ["bm", "bare-metal servers"]];
  const edges = dm.edges.map(e => {
    const eo = e                                      , ee = { t: "node", id: e.id };
    return `<tr><td>${fieldHtml({ key: "name", label: "Name", type: "text" }, e.name, ee)}</td>
      <td>${fieldHtml({ key: "nodes", label: "Nodes", type: "number", min: 1, max: 16 }, e.nodes, ee)}</td>
      <td>${fieldHtml({ key: "size", label: "Size", type: "select", choices: edgeSizes(), on: e.on !== "bm" }, e.size, ee)}</td>
      <td>${fieldHtml({ key: "on", label: "Runs", type: "select", choices: onOpts }, dm.clusters.some(c => c.id === e.on) || e.on === "bm" ? e.on : (dm.clusters[0] || {}           ).id, ee)}</td>
      <td>${e.on === "bm" ? fieldHtml({ key: "bmCores", label: "Cores each", type: "number", min: 8, max: 128 }, eo.bmCores, ee) : ""}</td>
      <td>${btn("delEdge", "Remove", { id: e.id })}</td></tr>`;
  }).join("");
  return `<h3>${esc(dm.name)} <span class="hint">${mg ? "management domain" : "workload domain"}</span></h3>${head}
    <div class="row">${btn("addClu", "Add cluster", { id: dm.id }, "ghost")}${mg ? "" : btn("delDom", "Remove domain", { id: dm.id })}${d.hostTypes.length ? "" : '<span class="hint">Add a host type first.</span>'}</div>
    <h4>NSX Edge clusters</h4>
    ${dm.edges.length ? `<div class="tablewrap"><table class="edges"><tbody>${edges}</tbody></table></div>` : `<p class="hint">None. Add one for north-south routing or services in this domain.</p>`}
    <div class="row">${btn("addEdge", "Add edge cluster", { id: dm.id })}</div>`;
}

function cluPanel(d        , c         , dm        , r              , omit                    = []) {
  const hw = d.hostTypes.find(h => h.id === c.hostType) || d.hostTypes[0];
  if (!hw) return `<p class="hint">Add a host type for this cluster.</p>`;
  const S = settingsFromDesign(d), hc = hostCfg({ ...c, hw }, S), vs = c.storage === "esa", tMax = tierMax(c, hw);
  const res = r.clusters.filter(x => x.c.id === c.id);
  const isMgmtDefault = dm.kind === "mgmt" && dm.clusters[0] === c;
  return `<h3>${esc(c.name)} <span class="hint">cluster in ${esc(dm.name)}</span>${isMgmtDefault ? ' <span class="pill warn">management appliances</span>' : ""}</h3>
    ${res.length ? `<p class="reason">${res.map(x => esc((x.c.name !== c.name ? x.c.name + ": " : "") + clusterReason(x))).join("<br>")}</p>` : ""}
    <div class="grid">${fields(clusterFields(c, hw, d, maxFor(c), tMax).filter(f => !omit.includes(f.key)), c                                      , { t: "node", id: c.id })}</div>
    <p class="hint">${esc(hw.name)} · ${esc(STORAGE[c.storage] || c.storage)} · per host: ${hc.cores} cores · ${nf(hc.licCores)} licensed · ${vs ? `${nf(hc.rawTiB, 2)} TiB raw vSAN · ` : ""}${nf(hc.ramUsable)} GiB usable RAM after reserves${hc.tiering ? ` · ${nf(hc.tierGiB)} GiB memory tier` : ""}</p>
    <div class="row">${btn("dupClu", "Duplicate cluster", { id: c.id })}${btn("delClu", "Remove cluster", { id: c.id })}</div>`;
}

/** omit: cluster fields to leave out (the guided Topology step leaves storage to its own step). */
export function topologyHtml(d        , r              , ui          , omit                    = []) {
  if (!d.topology.instances.length) return `<p class="hint">No instances yet. Add one, then clusters in its management domain and any workload domains.</p><div class="row">${btn("addInst", "Add instance", {}, "ghost")}</div>`;
  const at = locate(d, ui.sel) || locate(d, d.topology.instances[0].id) ;
  const panel = at.kind === "inst" ? instPanel(d, at.inst) : at.kind === "dom" ? domPanel(d, at.dom , at.inst)
    : at.kind === "clu" ? cluPanel(d, at.obj                      , at.dom , r, omit) : domPanel(d, at.dom , at.inst);
  const sel = at.kind === "edge" ? at.dom .id : (at.obj                  ).id;
  return `<div class="topo2"><nav class="treecol" aria-label="Instances, domains and clusters">${treeHtml(d, r, sel)}</nav><div class="panel">${panel}</div></div>`;
}

/** Where a role applies: the whole fleet, an instance, or a domain. */
export function scopeChoices(d        )           {
  const out           = [["fleet", "Whole fleet"]];
  for (const i of d.topology.instances) { out.push([i.id, `${i.name} (instance)`]); for (const dm of [i.mgmt, ...i.wlds]) out.push([dm.id, `${i.name} / ${dm.name}`]); }
  return out;
}

export function identityHtml(d        ) {
  const x = d.identity, sc = scopeChoices(d);
  const sel = (i        , key        , v        , opts          ) => `<select data-edit="${attr({ t: "role", i, key })}" data-type="select" aria-label="${key}">${opts.map(([k, l]) => `<option value="${esc(k)}" ${String(k) === v ? "selected" : ""}>${esc(l)}</option>`).join("")}</select>`;
  const rows = x.roles.map((r, i) => `<tr>
    <td><input type="text" value="${esc(r.group)}" placeholder="IdP group name" data-edit="${attr({ t: "role", i, key: "group" })}" data-type="text" aria-label="Group"></td>
    <td>${sel(i, "scope", r.scope, r.scope ? sc : [["", "Removed: choose a scope"], ...sc])}</td>
    <td>${sel(i, "access", r.access, ACCESS)}</td>
    <td>${btn("delRole", "Remove", { index: i })}</td></tr>`).join("");
  return `<div class="grid">${fields(identityFields(x), x                                      , { t: "sec", sec: "identity" })}</div>
    <h4>Role matrix</h4>
    <p class="hint">Which identity-provider group gets which access, and where. Access levels are design intent; the design document maps each to the components' own roles.</p>
    ${x.roles.length ? `<div class="tablewrap"><table class="roles"><thead><tr><th>Group</th><th>Scope</th><th>Access</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>` : ""}
    <div class="row">${btn("addRole", "Add role", {}, "ghost")}${x.roles.length ? "" : btn("suggestRoles", "Start from suggested roles", {}, "link")}</div>
    <h4>Break-glass access</h4>
    <div class="grid">${fields(breakGlassFields(), x.breakGlass                                      , { t: "sec", sec: "identity.breakGlass" })}</div>`;
}

/** Project fields, and for a design brought in at VCF 9.0 the move to 9.1 with what it would change. */
export function projectHtml(d        ) {
  let note = "";
  if (d.project.version === "9.0") {
    const m = moveTo91(d, sizeDesign);
    const what = m.clusters.length || m.hosts[0] !== m.hosts[1] || m.licCores[0] !== m.licCores[1]
      ? `Moving changes: ${m.clusters.map(c => `${esc(c.name)} ${c.before} → ${c.after} hosts`).join(", ")}${m.clusters.length ? "; " : ""}total ${nf(m.hosts[0])} → ${nf(m.hosts[1])} hosts, ${nf(m.licCores[0])} → ${nf(m.licCores[1])} VCF cores.`
      : "Moving changes no numbers in this design.";
    note = `<div class="choicebar st-skipped"><div><b>This design is for VCF 9.0.</b> <span class="hint">VCF Design Studio designs for 9.1 and later. It stays at 9.0, with its numbers unchanged, until you move it.</span></div>
      <p class="hint">${what}</p><div class="row"><button type="button" data-xact="${attr({ act: "moveTo91" })}">Move to VCF 9.1</button></div></div>`;
  }
  return note + `<div class="grid">${fields(projectFields(d.project.version), d.project                                      , { t: "sec", sec: "project" })}</div>`;
}

/** Host networking: fleet DNS / NTP, NICs per host type, and per cluster the switch model, speed, MTU, TEP addressing and the networks that follow. */
export function hostnetHtml(d        , r              ) {
  const hosts = hostsByCluster(r), multi = d.topology.instances.length > 1;
  const nics = d.hostTypes.map(h => `<tr><td>${esc(h.name)}</td><td><select data-edit="${attr({ t: "nics", ht: h.id })}" data-type="select" aria-label="NICs per host, ${esc(h.name)}">${NIC_COUNTS.map(([k, l]) => `<option value="${k}" ${k === nicsOf(d, h.id) ? "selected" : ""}>${l}</option>`).join("")}</select></td></tr>`).join("");
  const cards = allClusters(d).map(({ inst, dm, c }) => {
    const rec = recommended(d, c), v = effective(d, c), n = hosts.get(c.id) || 0;
    const rows = networksOf(d, c, n).map(x => `<tr><td>${esc(x.net)}</td><td class="n">0${x.vds}</td><td class="n num">${x.mtu}</td><td>${esc(x.addr)}</td><td class="n num">${nf(x.ips)}</td></tr>`).join("");
    return `<div class="addon"><h4>${esc(c.name)} <span class="hint">${esc((multi ? inst.name + " / " : "") + dm.name)} · ${plural(n, "host")}</span></h4>
      <div class="grid">${fields(clusterNetFields(rec), v                                      , { t: "net", cid: c.id })}</div>
      <div class="tablewrap"><table class="nets"><thead><tr><th>Network</th><th class="n">vDS</th><th class="n">MTU</th><th>Addressing</th><th class="n">IPs</th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
  }).join("");
  return `<h4>DNS and NTP</h4><div class="grid">${fields(fleetNetFields(), d.network                                      , { t: "sec", sec: "network" })}</div>
    <h4>NICs per host for VCF traffic</h4>
    <p class="hint">Hosts with 4 or more NICs get storage separation recommended on vSAN clusters (two distributed switches).</p>
    ${d.hostTypes.length ? `<div class="tablewrap"><table class="nics"><tbody>${nics}</tbody></table></div>` : `<p class="hint">Add host types first.</p>`}
    <h4>Clusters</h4>
    ${cards ? `<div class="addons">${cards}</div>` : `<p class="hint">No clusters yet. Add them in Topology.</p>`}
    <p class="hint">Addresses are per network at today's host count, with no room for growth. VCF can't change an infrastructure subnet's mask later, so the IP plan sizes subnets with headroom. VLAN IDs and subnets come with that plan.</p>`;
}

export function addonsHtml(d        ) {
  const S = d.addons                                      ;
  return `<div class="addons">${addonFields(d.addons, clusterChoices(d)).map(g => `<div class="addon"><h4>${esc(g.title)}</h4><div class="grid">${fields(g.fields, S, { t: "sec", sec: "addons" })}</div><p class="hint">${esc(g.note)}</p></div>`).join("")}</div>`;
}

// ---------- the page ----------
export function expertHtml(d        , r              , ui          )         {
  const nClu = d.topology.instances.reduce((a, i) => a + [i.mgmt, ...i.wlds].reduce((b, dm) => b + dm.clusters.length, 0), 0);
  const t                         = workloadTotals(d.workload.groups                      );
  const addOns = (["vdefend", "vlrOn", "aviOn", "hcxOn", "dsmOn"]         ).filter(k => k === "vdefend" ? d.addons.vdefend !== "off" : d.addons[k]).length;
  return [
    `<section class="card xhead"><header><h2>Expert view</h2><span class="hint">Every setting on one page, on the same design as the guided steps. Hover <span class="why">?</span> for why a default was chosen; changed values are marked.</span></header></section>`,
    section("project", "Project", d.project.customer || "Untitled", projectHtml(d), ui, "project"),
    section("workload", "Workload", `${plural(d.workload.groups.length, "group")}${d.workload.groups.length ? ` · ${nf(t.vcpu)} vCPU · ${nf(t.vramGiB)} GiB vRAM` : ""}`, workloadHtml(d, ui), ui, "workload"),
    section("policy", "Sizing policy", `${d.policy.cpuRatio}:1 CPU · RAM ${d.policy.ramRatio}:1 · fill ${d.policy.memFill}%`, `<div class="grid">${fields(policyFields(), d.policy                                      , { t: "sec", sec: "policy" })}</div>`, ui, "policy"),
    section("fleet", "Fleet management", d.fleet.profile, `<div class="grid">${fields(fleetFields(d.fleet), d.fleet                                      , { t: "sec", sec: "fleet" })}</div>`, ui, "fleet"),
    section("identity", "Identity & access", d.identity.mode ? (d.identity.mode === "instance" ? "Instance mode" : "Embedded mode") + (d.identity.idp ? " · " + IDENTITY.providers[d.identity.idp].label : "") : "not decided", identityHtml(d), ui, "identity"),
    section("hosts", "Host types", plural(d.hostTypes.length, "host type"), hostTypesHtml(d), ui, "hosts"),
    section("topology", "Topology", `${plural(d.topology.instances.length, "instance")} · ${plural(nClu, "cluster")}`, topologyHtml(d, r, ui), ui, "topology"),
    section("hostnet", "Host networking", d.network.domain || "DNS domain not set", hostnetHtml(d, r), ui, "hostnet"),
    section("addons", "Add-ons", addOns ? `${addOns} on` : "none", addonsHtml(d), ui, "addons"),
  ].join("");
}
