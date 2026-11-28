# Maintaining VCF Design Studio

Which file to edit for which kind of update. The page is `/vcf-design-studio/`; the old `/vcf-sizing/`
page stays as it is until the studio replaces it.

## Before and after any change

```bash
npm ci              # once, or after package.json changes
npm test            # golden, knowledge and studio tests
npm run typecheck
npm run build       # rebuilds vcf-design-studio/app/ (committed: the site has no build step)
```

CI runs the tests and the type check on every push. A test fails if `vcf-design-studio/app/` is out of
date with the source, so always run `npm run build` and commit its output with your change.

## Common updates

| You want to… | Edit | Then |
| --- | --- | --- |
| Change a VCF limit, appliance size or licensing rule | `engine/knowledge/*.json` (the table, its `source` and `verified` date) | Run the tests. If a golden test fails, the numbers moved: check it's intended, then re-record (below) |
| Add or change a best-practice rule | `engine/knowledge/rules.json` (text, level, pillar, source, url, verified) **and** its check in `studio/src/rules.ts` (`CHECKS`, same id) | Add a test in `engine/test/studio.test.ts`. Set `"input": "customer"` if only the customer can supply what it checks |
| Add a server CPU or memory option | `engine/knowledge/hardware.json` | Tests |
| Change a default (CPU ratio, reserves, cluster settings) | `engine/knowledge/defaults.json` | Golden tests will flag every sizing that moves |
| Change identity, network, NSX or IP-plan guidance | `identity.json`, `network.json`, `nsx.json`, `ipplan.json` in `engine/knowledge/` | Tests |
| Turn a feature on or off, or make it Pro | `studio/src/flags.ts` (`FEATURES`: the tiers that get each feature) | Tests |
| Change the easy button (options, vSAN floor) | `studio/src/easy.ts` | Its options must meet every Required and Recommended rule (tested) |
| Change a guided step's screen | `studio/src/guided.ts`, fields in `studio/src/fields.ts`, step list in `studio/src/flow.ts` | Tests, then look at the page |
| Change the Expert view | `studio/src/expert.ts` | Same |
| Change what the design file holds | `engine/src/design/document.ts`, with a migration in `engine/src/design/migrations.ts` and a bumped format version | Add a fixture in `engine/fixtures/designs/`; old files must still open |
| Change what the design document (HLD) says | `studio/src/hld.ts`: one content model that the page preview, Word and PDF all render | Tests check every section is there with no blanks; open the Word file to look |
| Change the prerequisite checklist | `studio/src/prereqs.ts` (items by owning team, and when each counts as Done) | Tests |
| Change the diagrams | `studio/src/diagram.ts` (layout once, then SVG and draw.io) | Tests check boxes don't overlap; look at the SVG |
| Add or remove a download | `studio/src/export/index.ts` (`EXPORTERS`, each with its feature flag) | Its button appears on the Design output page by itself |
| Change the Word, Excel or HTML rendering | `studio/src/export/docx.ts`, `xlsx.ts`, `html.ts` (no libraries: they write the file formats directly) | Open the result in Word or Excel |
| Change the PDF layout | The print rules at the end of `vcf-design-studio/studio.css` (the PDF is the browser printing the HLD preview) | Print from the Design output page |
| Change which edition has a feature, or an edition's name | `studio/src/flags.ts` (`EDITIONS`, and `editions` on a feature) | Tests check classic has no AI |
| Change how the AI panels attach to the page | `studio/src/ai/page.ts` (loaded only on the AI-powered page) and `studio/src/slots.ts` (the places it fills) | Tests check the classic page's imports never reach `studio/src/ai/` |
| Change the installable app (name, icons, offline) | `manifest.webmanifest` in each page's folder, `vcf-design-studio/icons/`, and `sw.js` (keep the two copies identical; bump `CACHE` to clear old copies) | Tests check icon sizes and that the two service workers match |
| Change the AI-powered page itself | `vcf-design-studio-ai/index.html` (it loads the shared app and styles from `vcf-design-studio/`) | Look at both pages |
| Change what the AI copilot can do | `studio/src/ai/tools.ts` (`TOOLS`: each tool's description, input and what it returns) and its instructions in `studio/src/ai/copilot.ts` | AI tests use a stand-in API; no key needed |
| Change what the AI may set | `studio/src/ai/catalog.ts` (design choices only; customer facts stay out) | Tests check no customer fact is settable |
| Change what's swapped for stand-in names | `studio/src/ai/redact.ts` | Tests check nothing identifying is sent |
| Change how HLD sections are drafted | `studio/src/ai/writer.ts` (the brief per section and the writing rules) | Tests |
| Add an AI provider, or change one's setup guide, address, key format or models | `studio/src/ai/providers.ts` (`PROVIDERS`: one entry each, with its `guide`) | Tests render every guide and send through every provider with a stand-in API |
| Change the Claude models, the OpenAI-format translation, or add the hosted backend | `studio/src/ai/connector.ts` (`MODELS`; `toOpenAi`/`fromOpenAi`; `hostedConnector` takes the same request as the Claude Messages API) | Tests |
| Update the spreadsheet reader (SheetJS) | Put the new official file in `assets/vendor/` (named with its version), update the five pages' script tags, `SHEETJS` in `engine/test/security.test.ts`, the URL in `.github/workflows/test.yml`, and the `xlsx` devDependency to the same version | CI downloads the official file and fails unless it matches; the tests read every sample RVTools row back through a real .xlsx file. No page may load a script from another site |
| Change how AI drafts are checked | `unmatchedNumbers` / `hldNumbers` in `studio/src/hld.ts` (numbers a draft may quote; hosts and cores against the engine's figures) | Tests flag a wrong host count and pass names like wld01-cl01 |
| Change the page layout or styles | `vcf-design-studio/index.html`, `vcf-design-studio/studio.css` | Look at it on desktop and phone width |

## Golden tests

`engine/golden/` holds locked outputs, recorded from the live VCF Sizing page's engine. The live page's
engine, the TypeScript engine and the browser build must all reproduce them. When you change sizing on
purpose, re-record with `npm run golden:record`, and say in the commit which numbers moved and why.

Real customer RVTools exports never go in the repo: list them in `engine/test/private.local.json` and their
outputs land in `engine/golden-private/` (both git-ignored).

## Don't touch from here

The blog (`blog/`, see `blog/AGENTS.md`), and the EVS Sizing, VMC Sizing and VCF Sizing pages.
