// Built from TypeScript by studio/build.mjs. Edit the .ts source, then run npm run build.
// The studio's state: one design document, kept in this browser, changed only through proposals.
// No DOM here, so it is tested in Node (engine/test/studio.test.ts).
import { loadDesign, newDesign, serializeDesign, designToEngine, size, fixHw } from "../../engine/src/index.js";
                                                                      

export const KEY = "vcfStudio.design";               // this tool's autosave
export const SIZER_SESSION = "vcfSizer.session";      // the VCF Sizing page's autosave
export const SIZER_HOST_TYPES = "vcfSizer.hostTypes"; // the VCF Sizing page's host types

                                                                                                                                    

const read = (st             , k        ) => { try { return st.getItem(k); } catch { return null; } };
const readJson = (st             , k        ) => { try { const t = read(st, k); return t ? JSON.parse(t) : null; } catch { return null; } };

                                                                          

/** The design to open: this tool's last design; else the VCF Sizing page's last session (and its host types); else a new design. */
export function openSaved(st             )                                                      {
  const browserHostTypes = (readJson(st, SIZER_HOST_TYPES) || [])                             ;
  const own = read(st, KEY);
  if (own) {
    try { const r = loadDesign(own); if (r.kind === "design") return { design: r.design, origin: "saved", notes: r.notes }; }
    catch { /* unreadable: fall through to the other sources rather than lose the visit */ }
  }
  const sizer = read(st, SIZER_SESSION);
  if (sizer) {
    try {
      const r = loadDesign(sizer, { browserHostTypes });
      if (r.kind === "design") return { design: r.design, origin: "vcf-sizing", notes: ["Brought in your last sizing from the VCF Sizing page.", ...r.notes] };
    } catch { /* ignore */ }
  }
  const d = newDesign();
  if (Array.isArray(browserHostTypes) && browserHostTypes.length) {
    d.hostTypes = browserHostTypes.map((h, k) => fixHw({ ...h, id: `h${k + 1}` }));
    return { design: d, origin: "sizing-host-types", notes: [`Brought in ${d.hostTypes.length} host type${d.hostTypes.length > 1 ? "s" : ""} from the VCF Sizing page.`] };
  }
  return { design: d, origin: "new", notes: [] };
}

export function save(st             , d        )          { try { st.setItem(KEY, serializeDesign(d)); return true; } catch { return false; } }
export function forget(st             ) { try { st.removeItem(KEY); } catch { /* ignore */ } }

// ---------- proposals ----------
// Everything that changes the design (a form field, a guided step, the easy button, an RVTools import,
// later AI assist) sends a proposal. It is applied to a copy and checked before it replaces the design.
                                       
                
                                             
                                                                
                                 
                                                                        
                                                                                                   

function walk(root         , path      , create = false)                                                                     {
  if (!path.length) throw new Error("empty path");
  let cur = root                                    ;
  for (const k of path.slice(0, -1)) {
    const next = cur[k];
    if (next === null || typeof next !== "object") throw new Error(`no ${path.join(".")}`);
    cur = next                                    ;
  }
  const key = path[path.length - 1];
  if (!create && !(key in cur)) throw new Error(`no ${path.join(".")}`);
  return { parent: cur, key };
}

const kind = (v         ) => (v === null ? "null" : Array.isArray(v) ? "array" : typeof v);

export function apply(d        , ops      )         {
  const next = structuredClone(d);
  for (const o of ops) {
    if (o.op === "set") {
      const { parent, key } = walk(next, o.path);
      const was = parent[key];
      if (was !== undefined && was !== null && kind(was) !== kind(o.value)) throw new Error(`${o.path.join(".")} takes a ${kind(was)}, not a ${kind(o.value)}`);
      parent[key] = structuredClone(o.value);
    } else if (o.op === "insert") {
      const { parent, key } = walk(next, o.path), arr = parent[key];
      if (!Array.isArray(arr)) throw new Error(`${o.path.join(".")} is not a list`);
      arr.splice(o.index ?? arr.length, 0, structuredClone(o.value));
    } else if (o.op === "remove") {
      const { parent, key } = walk(next, o.path);
      if (Array.isArray(parent)) parent.splice(key          , 1); else delete parent[key];
    }
  }
  return next;
}

/** Apply a proposal to a copy, normalise it the way any saved design is loaded, and hand it back only if that works. */
export function propose(d        , p          )          {
  try {
    const next = apply(d, p.ops);
    const r = loadDesign(serializeDesign(next));
    if (r.kind !== "design") return { ok: false, error: "not a design" };
    // a single value that the engine would change on load (an unknown choice, say) is refused, not quietly altered
    for (const o of p.ops) if (o.op === "set" && (o.value === null || typeof o.value !== "object")) {
      let got         ;
      try { const w = walk(r.design, o.path); got = w.parent[w.key]; } catch { got = undefined; }
      if (got !== o.value) return { ok: false, error: `${JSON.stringify(o.value)} isn't a valid value for ${o.path.join(".")}` };
    }
    return { ok: true, design: r.design, notes: r.notes };
  } catch (e) { return { ok: false, error: (e         ).message }; }
}

export function sizeDesign(d        )               {
  const e = designToEngine(d);
  return size(e.s, e.topo, e.groups, e.hostTypes);
}
