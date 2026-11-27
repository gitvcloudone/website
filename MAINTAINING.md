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
| Change the page layout or styles | `vcf-design-studio/index.html`, `vcf-design-studio/studio.css` | Look at it on desktop and phone width |

## Golden tests

`engine/golden/` holds locked outputs, recorded from the live VCF Sizing page's engine. The live page's
engine, the TypeScript engine and the browser build must all reproduce them. When you change sizing on
purpose, re-record with `npm run golden:record`, and say in the commit which numbers moved and why.

Real customer RVTools exports never go in the repo: list them in `engine/test/private.local.json` and their
outputs land in `engine/golden-private/` (both git-ignored).

## Don't touch from here

The blog (`blog/`, see `blog/AGENTS.md`), and the EVS Sizing, VMC Sizing and VCF Sizing pages.
