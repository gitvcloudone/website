// Section numbers ("3", "3.2") for the HLD, the same in every format.
import type { Hld, Section } from "../hld.ts";

export function numbered(h: Hld): { s: Section; depth: number; n: string }[] {
  const out: { s: Section; depth: number; n: string }[] = [];
  h.sections.forEach((s, i) => {
    out.push({ s, depth: 1, n: `${i + 1}` });
    (s.sub || []).forEach((x, j) => out.push({ s: x, depth: 2, n: `${i + 1}.${j + 1}` }));
  });
  return out;
}
