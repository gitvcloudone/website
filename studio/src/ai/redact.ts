// Stand-in names: before anything goes to the AI, names that could identify the customer are swapped for
// neutral ones, and swapped back in what comes back. Addresses and other customer facts are summarised
// ("entered" / "not entered") rather than sent. No DOM; tested.
import type { Design } from "../../../engine/src/index.ts";

export interface Redactor { on: boolean; out(s: string): string; back(s: string): string; pairs: [real: string, stand: string][] }

const escRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The swaps for a design. With `on` false, nothing is swapped. */
export function redactorFor(d: Design, on: boolean): Redactor {
  const pairs: [string, string][] = [];
  const add = (real: unknown, stand: string) => { const r = String(real ?? "").trim(); if (r.length >= 3 && !pairs.some(p => p[0].toLowerCase() === r.toLowerCase())) pairs.push([r, stand]); };
  if (on) {
    add(d.project.customer, "Customer A");
    add(d.project.site, "Site A");
    d.workload.groups.forEach((g, i) => add(g.name, `Workload group ${i + 1}`));
    let vm = 0; for (const g of d.workload.groups) for (const b of (g.meta?.big || []) as { name: string }[]) add(b.name, `VM-${++vm}`);
    add(d.network.domain, "example.internal");
    d.identity.roles.forEach((r, i) => add(r.group, `IdP group ${i + 1}`));
    add(d.identity.breakGlass.holder, "the named holder");
    add(d.identity.breakGlass.vault, "the named vault");
  }
  // longest first, so "Acme Bank Trust" goes before "Acme Bank"
  const outs = [...pairs].sort((a, b) => b[0].length - a[0].length), backs = [...pairs].sort((a, b) => b[1].length - a[1].length);
  // going out, real names match whatever their capitals ("ACME BANK", "acme bank"); coming back, stand-ins match exactly
  const swap = (s: string, list: [string, string][], from: 0 | 1) => list.reduce((t, p) => t.replace(new RegExp(escRe(p[from]), from === 0 ? "gi" : "g"), p[1 - from]), s);
  return { on, pairs, out: s => (on ? swap(s, outs, 0) : s), back: s => (on ? swap(s, backs, 1) : s) };
}

/** Every string in a value, swapped back (for what the AI proposes). */
export function backDeep<T>(v: T, r: Redactor): T {
  if (typeof v === "string") return r.back(v) as T;
  if (Array.isArray(v)) return v.map(x => backDeep(x, r)) as T;
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, backDeep(x, r)])) as T;
  return v;
}
