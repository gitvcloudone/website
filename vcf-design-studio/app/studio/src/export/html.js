// Built from TypeScript by studio/build.mjs. Edit the .ts source, then run npm run build.
// The HLD as HTML: shown on the Design output page, and printed from there to PDF (print styles in
// studio.css show only this). Diagrams come in as SVG markup. A pure function → HTML string; tested.
                                            
import { numbered } from "./number.js";

const esc = (s         ) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function block(b       , svgs                                 )         {
  switch (b.t) {
    case "p": return `<p>${esc(b.text)}</p>`;
    case "list": return `<ul>${b.items.map(t => `<li>${esc(t)}</li>`).join("")}</ul>`;
    case "tbd": return `<p class="hld-tbd">${esc(b.text)}</p>`;
    case "table": return `<div class="tablewrap"><table class="hld-table"><thead><tr>${b.head.map((h, i) => `<th${b.num?.includes(i) ? ` class="n"` : ""}>${esc(h)}</th>`).join("")}</tr></thead>` +
      `<tbody>${b.rows.map(r => `<tr>${r.map((c, i) => `<td${b.num?.includes(i) ? ` class="n num"` : ""}>${esc(c)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
    case "ai": return `<div class="hld-ai"><p class="hld-ai-label">${esc(b.label)}${b.stale ? ` · <span class="hld-ai-stale">the design changed after this was drafted</span>` : ""}</p>${b.paras.map(x => `<p>${esc(x)}</p>`).join("")}</div>`;
    case "diagram": return `<figure class="hld-fig">${svgs[b.id] || ""}<figcaption>${esc(b.caption)}</figcaption></figure>`;
  }
}

/** The HLD document: cover, contents, numbered sections. */
export function hldHtml(h     , svgs                                                  = {})         {
  const secs = numbered(h);
  return `<article class="hld">
    <header class="hld-cover"><p class="hld-kicker">${esc(h.title)}</p><h2>${esc(h.customer)}</h2>
      <dl><dt>Site</dt><dd>${esc(h.site || "–")}</dd><dt>VCF version</dt><dd>${esc(h.version)}</dd><dt>Date</dt><dd>${esc(h.date)}</dd><dt>Status</dt><dd>${esc(h.status)}</dd></dl>
      <p class="hint">Prepared with VCF Design Studio by vCloudOne, an independent tool not affiliated with or endorsed by Broadcom. Sizing and licence figures are estimates to confirm before ordering.</p></header>
    <nav class="hld-toc"><h3>Contents</h3><ol>${secs.filter(x => x.depth === 1).map(x => `<li>${esc(x.s.title)}</li>`).join("")}</ol></nav>
    ${secs.map(({ s, depth, n }) => `<section class="hld-sec d${depth}" id="hld-${s.id}"><${depth === 1 ? "h3" : "h4"}>${n} ${esc(s.title)}</${depth === 1 ? "h3" : "h4"}>${s.blocks.map(b => block(b, svgs)).join("")}</section>`).join("")}
  </article>`;
}
