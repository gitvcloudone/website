// The live page's own settings code (Copy settings / Load settings / startup), taken unchanged from
// the UI script of vcf-sizing/index.html and run with the rendering calls stubbed out. This is the
// reference the design-document loader must match.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { engineSource, NAMES } from "./legacy.mjs";

const PAGE = fileURLToPath(new URL("../../vcf-sizing/index.html", import.meta.url));

function slice(html, start, end, { includeEnd = false } = {}) {
  const a = html.indexOf(start); if (a < 0) throw new Error(`marker not found: ${start}`);
  const b = html.indexOf(end, a + start.length); if (b < 0) throw new Error(`marker not found: ${end}`);
  return html.slice(a, includeEnd ? b + end.length : b);
}

export function uiSource(html = readFileSync(PAGE, "utf8")) {
  return [
    slice(html, "const S = { ...DEFAULTS", "const $ = (id)"),                       // state, uid, scope
    slice(html, "const newOpts = ", "\n"),
    slice(html, "let hostTypes = [];", "const htById"),                              // startup host types + saveHt
    slice(html, "function newCluster(", "\nfunction index()"),                       // topology factories, topo, openSet
    slice(html, "function settingsJSON() {", '$("copyset")'),
    slice(html, "let osaSwitched = 0;", '$("dlgok")'),                               // loadTopo, applySettings
  ].join("\n");
}

const STUBS = `function renderFiles() {} function refreshForm() {} function renderHostTypes() {} function renderTopo() {} function renderGroups() {} function recalc() {}`;

// A fresh page as a browser would open it. browserHostTypes = what localStorage "vcfSizer.hostTypes" holds.
export function openPage(browserHostTypes = []) {
  const store = { "vcfSizer.hostTypes": JSON.stringify(browserHostTypes) };
  const ctx = vm.createContext({ localStorage: { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } } });
  vm.runInContext(`${engineSource()}\n;"use strict";\n${STUBS}\n${uiSource()}
;globalThis.__api = { ${NAMES.join(", ")} };
globalThis.__ui = {
  applySettings, settingsJSON,
  state: () => ({ S, hostTypes, topo, groups, scope }),
  set: (st) => { for (const k of Object.keys(S)) delete S[k]; Object.assign(S, st.S); hostTypes = st.hostTypes; topo = st.topo; groups = st.groups; Object.assign(scope, st.scope || {}); },
};`, ctx, { filename: "vcf-sizing/index.html#ui" });
  return { api: ctx.__api, ui: ctx.__ui };
}
