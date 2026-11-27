// Builds VCF Design Studio for the browser with no dependencies: Node strips the TypeScript types
// (positions kept, so browser errors point at the same line as the source), ".ts" imports become
// ".js", and the knowledge JSON is copied. Output: vcf-design-studio/app/ (committed; served as is).
//   npm run build          write the output
//   npm run build -- --to <dir>   write somewhere else (the up-to-date test uses this)
import { stripTypeScriptTypes } from "node:module";
import { readdirSync, readFileSync, writeFileSync, mkdirSync, rmSync, statSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SOURCES = ["engine/src", "engine/knowledge", "studio/src"];
const BANNER = "// Built from TypeScript by studio/build.mjs. Edit the .ts source, then run npm run build.\n";

const walk = (d) => readdirSync(d).flatMap(f => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : [p]; });

export function build(out = join(ROOT, "vcf-design-studio/app")) {
  rmSync(out, { recursive: true, force: true });
  const written = [];
  for (const src of SOURCES) for (const file of walk(join(ROOT, src))) {
    const rel = relative(ROOT, file);
    let target = join(out, rel), text = readFileSync(file, "utf8");
    if (file.endsWith(".ts")) {
      target = target.replace(/\.ts$/, ".js");
      text = BANNER + stripTypeScriptTypes(text, { mode: "strip" })
        .replace(/(\bfrom\s*["'])(\.{1,2}\/[^"']+)\.ts(["'])/g, "$1$2.js$3")
        .replace(/(\bimport\s*\(\s*["'])(\.{1,2}\/[^"']+)\.ts(["']\s*\))/g, "$1$2.js$3");
    } else if (!file.endsWith(".json")) continue;
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, text);
    written.push(relative(out, target));
  }
  return written.sort();
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const i = process.argv.indexOf("--to");
  const files = build(i > 0 ? process.argv[i + 1] : undefined);
  console.log(`built ${files.length} files`);
}
