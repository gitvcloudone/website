# Security and quality fixes to do

> **For Claude Code, before you start:** CLAUDE.md's rule "Describe before you change" applies.
> Explain each change below to David in chat and wait for his go-ahead before editing any file.
> Every fix also needs a test that would have caught it ("Every fix comes with a test").
> This file is documentation only. Nothing here has been changed yet.

Found in a read-only review of PRs #3, #4 and #5 (VCF Design Studio), 27-28 Nov 2026.
Line numbers are from `main` at commit `82c0738`; re-check them before editing.

## 1. Excel library loaded from cdnjs with no integrity hash (SRI)

The SheetJS (xlsx) library is loaded as a plain third-party script with no `integrity` or `crossorigin` attribute:

```html
<script src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"></script>
```

Version: **xlsx 0.18.5** (`package.json` devDependency also pins `0.18.5`). It appears in five pages:

| Page | File | Line |
|---|---|---|
| VCF Design Studio (classic) | `vcf-design-studio/index.html` | 142 |
| VCF Design Studio (AI-powered) | `vcf-design-studio-ai/index.html` | 142 |
| VCF Sizing | `vcf-sizing/index.html` | 23 |
| EVS Sizing | `evs-sizing/index.html` | 23 |
| VMC Sizing | `vmc-sizing/index.html` | 23 |

No `<script>` in any HTML file in the repo has an `integrity` attribute. The studio uses the global `XLSX` in `studio/src/main.ts` (declared at line 277, used from line 285) to read RVTools exports.

## 2. Why it matters

- The script runs on the same origin as everything else on vcloudone.com, with full access to the page.
- On `/vcf-design-studio-ai/`, a user can tick "Remember keys on this device". The AI provider key is then stored in `localStorage` (see `studio/src/ai/providers.ts`, saved by `saveAi`; `studio/src/ai/page.ts` uses `localStorage`).
- If the CDN copy of xlsx were compromised or altered, it could read that key from `localStorage` (or from the key field while typing) and send it anywhere. It could also read the saved design (`vcfStudio.design`).
- The service worker (`vcf-design-studio/sw.js`, `vcf-design-studio-ai/sw.js`) caches only same-origin GET requests (`url.origin !== self.location.origin` returns early). It does not cover or protect the cdnjs script, so it does not mitigate this.
- The classic page and the three older sizing pages hold no API key, but they run the same third-party script on the same origin and share `localStorage` with the AI page, so fix all five.

## 3. Recommended fix

**Option A (smallest change): add SRI.** Change all five tags to:

```html
<script src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"
        integrity="sha384-vtjasyidUo0kW94K5MXDXntzOJpQgBKXmE7e2Ga4LG0skTTLeBi97eFAXsqewJjw"
        crossorigin="anonymous"></script>
```

Hash computed on 2026-11-27 from the exact URL above (881,727 bytes):

```
sha384-vtjasyidUo0kW94K5MXDXntzOJpQgBKXmE7e2Ga4LG0skTTLeBi97eFAXsqewJjw
```

Re-verify before committing:

```
curl -sSfL https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js \
  | openssl dgst -sha384 -binary | openssl base64 -A
```

The output must equal the part after `sha384-`. As a cross-check, the file's sha512 matches the value cdnjs publishes at `https://api.cdnjs.com/libraries/xlsx/0.18.5?fields=sri`:
`sha512-r22gChDnGvBylk90+2e/ycr3RVrDi8DIOkIGNhJlKfuyQM4tIRAI062MaV8sfjQKYVGjOBaZBOA87z+IhZE9DA==`.
cdnjs sends `access-control-allow-origin: *`, so `crossorigin="anonymous"` works.

**Option B (better long term): self-host.** Download that exact file into `vcf-design-studio/` (for example `vcf-design-studio/vendor/xlsx.full.min.js`), reference it from both studio pages, and let the service worker cache it as a same-origin file. This removes the third-party dependency and offline use then works. The three older sizing pages can point at the same file.

**Optional: Content-Security-Policy.** GitHub Pages cannot set headers, but a `<meta http-equiv="Content-Security-Policy">` can limit `script-src` to `'self'` plus the one CDN host (or `'self'` only if self-hosted) and `connect-src` to the AI provider hosts in `studio/src/ai/providers.ts`. Test it with every provider before shipping, since the provider list is long and includes user-entered local addresses.

**Test idea** (in `engine/test/`, next to the existing page tests such as "pages: the AI-powered page uses the shared app..." in `ai.test.ts`): read every `*.html` file in the repo and fail if any `<script src="http(s)://...">` lacks an `integrity="sha384-..."` attribute plus `crossorigin`. If self-hosting, assert instead that no external `<script src>` remains. A second assertion can compare the hash in the HTML with the hash of the vendored file.

## 4. Quick win: check the HLD writer's numbers against the engine

`studio/src/ai/writer.ts` tells the model "Every number must appear in the facts exactly; never compute or estimate new ones" (inside `WRITER_SYSTEM`, line 24). `draft()` (line 39) then stores whatever text comes back (lines 43-46). Nothing checks it. A wrong host count or core count could end up in a customer's HLD under an "AI draft" label, which CLAUDE.md's "never change a customer's number by accident" rule is meant to prevent.

Recommended post-check, run inside `draft()` before returning:

1. Build the allowed set of numbers from the same facts sent to the model (`writerFacts(d)`: hosts, physical and licensed cores, vSAN add-on TiB, per-cluster hosts, counts of instances, domains and clusters, versions, dates).
2. Extract every number from the drafted text (integers, decimals, thousands separators, "TiB" and "%" values). Ignore list numbers and years that appear in the facts.
3. If a number is not in the allowed set, mark the draft. For example, store a `check` field on the narrative with the unmatched numbers, show them next to the draft in the writer panel (`studio/src/ai/panel.ts`, writer section), and either block exporting that section or print a clear warning label in the HLD (`aiBlock` in `studio/src/hld.ts`).
4. Show the difference: "The draft says 14 hosts; the engine says 12."

**Test idea:** in `engine/test/ai.test.ts`, use the stand-in connector the existing tests use. Make it return a draft that says a wrong host count, assert the draft is flagged with that number and that a correct draft is not flagged. Also test that numbers inside stand-in names do not cause false positives.

## Other findings (lower priority)

- **No tests for the installable-app pieces.** Nothing tests `manifest.webmanifest`, the icons in `vcf-design-studio/icons/`, or the AI page's privacy line text (the only related test keeps the two `sw.js` files identical).
- **`fixedHosts` and `maxHosts` are in the AI whitelist.** `studio/src/ai/catalog.ts` builds its list from `clusterFields` in `studio/src/fields.ts` (lines 154-155), so the AI can propose a fixed host count. It only applies when David clicks apply, and the engine still computes the results, but decide whether host-count overrides should be AI-changeable.
- **Stand-in names use limited, case-sensitive matching.** `studio/src/ai/redact.ts` replaces exact, case-sensitive text for a fixed set of fields (customer, site, workload group and VM names, DNS domain, identity groups, break-glass holder and vault) and skips strings shorter than 3 characters. Free text, hostnames and other spellings of a name are not covered.
