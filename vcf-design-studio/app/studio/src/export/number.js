// Built from TypeScript by studio/build.mjs. Edit the .ts source, then run npm run build.
// Section numbers ("3", "3.2") for the HLD, the same in every format.
                                              

export function numbered(h     )                                             {
  const out                                             = [];
  h.sections.forEach((s, i) => {
    out.push({ s, depth: 1, n: `${i + 1}` });
    (s.sub || []).forEach((x, j) => out.push({ s: x, depth: 2, n: `${i + 1}.${j + 1}` }));
  });
  return out;
}
