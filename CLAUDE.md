# VCF Design Studio — project guide for Claude Code

This repo is the vCloudOne site (vcloudone.com). This file covers **VCF Design Studio**, the rework of
the current VCF Sizing page (`/vcf-sizing/`) into a guided design tool. The blog has its own brief in
`blog/AGENTS.md`; leave the blog, the EVS Sizing page and the VMC Sizing page alone unless asked.

## Working rules (read first)

- **Describe before you change.** For any change to an existing file or page, explain the proposed
  change in chat first and wait for David's go-ahead before writing, rebuilding or deploying.
- **Verify it yourself.** When a fact, limit or result needs checking, check it (run tests, read the
  source, look up the doc). Don't hand verification back to David.
- **Never change a customer's number by accident.** When porting existing logic, outputs must match the
  live page exactly before the old code is removed. Any intended change in results must be called out.
- One focused task per session. Commit in small, reviewable steps.

## What we're building

A free, browser-only tool that walks an architect through designing a VMware Cloud Foundation (9.0/9.1)
deployment on their own hardware and produces a defensible design: sizing, network, identity,
prerequisites, a high-level design document (HLD) and architecture diagrams. Better than existing tools
(Broadcom's Planning and Preparation Workbook, VCF Designer, community fleet sizers) because it guides
the decisions, explains them and documents them — it doesn't just validate a finished design.

- Name: **VCF Design Studio**, tagline "by vCloudOne". Subtitle: "Guided design, sizing and
  architecture documentation for VMware Cloud Foundation."
- Show a short line: independent tool, not affiliated with or endorsed by Broadcom.
- Everything runs in the browser. RVTools files and designs never leave the user's machine.
- VCF and Amazon EVS stay **separate tools for now**. EVS may become a platform profile later.

## Architecture (keep it flexible — new layers are added as modules, never by editing the engine)

1. **Design document** — the core contract. One versioned JSON object holding every choice
   (requirements, workload, policy, host types, topology, storage, identity, network, add-ons,
   decisions). Every other part reads or writes this, never each other. Include a `formatVersion`
   and migrations from day one; the existing "Copy settings" JSON must still load.
2. **Engine** (TypeScript, pure functions, no DOM): design in → results, issues, scorecard out.
   Pipeline: workload totals → demand after ratios → management and add-on overhead → hosts by CPU,
   RAM and storage (take the max) → minimums and spares → licensing. Every result records its
   deciding factor and the reason ("8 hosts: memory-bound; CPU needs 5").
3. **Knowledge layer** (data files, not code): VCF limits, appliance sizes, licensing rules, host-type
   catalogue, best-practice rules, blueprints and easy-button tiers. Each rule carries its source
   (doc/KB link) and a last-verified date. Updating for a new VCF release should be a data edit.
4. **Proposers** — anything that fills in the design produces a set of proposed changes that the
   engine validates before they're applied: guided steps, easy button, RVTools import. Later:
   Planning Workbook import, AI assist (see "AI layer" below).
5. **Exporters** — registered in a list: HLD (Word/PDF), diagrams (SVG/PNG/draw.io), IP/VLAN/DNS
   tables, prerequisite checklist (Excel). Later: VCF Installer JSON, Planning Workbook.
6. **Platform profiles** — on-prem VCF now; EVS/VMC later as profiles.
7. **Feature flags / entitlements** — one place decides what's on. Everything is on and free today.
   Export and branding features sit behind flags so a Pro tier is a switch later.

## Guided flow (see the whiteboard: "VCF guided design flow")

1 Start (blueprint or load design; guided or expert view) → 2 Project → 3 Workload →
**Easy button** branch (auto-fills 4–12 with recommended choices, jumps to Review) →
4 Sizing policy → 5 Fleet management → 6 Identity & access → 7 Host types → 8 Topology →
9 Cluster storage → 10 Host networking → 11 NSX & connectivity → 12 Add-ons → 13 Review → 14 Design output

- **Skippable** (Skip for now / Use recommended): 4, 5, 6, 9, 10, 11, 12. "Use recommended" records
  a decision ("default accepted"); "Skip for now" leaves it open — Review lists it, the scorecard shows
  that pillar as incomplete, the HLD marks the section "To be defined" and adds an open item.
- Required: Project, Workload, Host types, Topology.
- On every screen: step rail, live summary (hosts, deciding factor, licensing), one-line "why" for
  each default, autosave, best-practice badges (Required / Recommended / Consider, each with its source).
- Keep today's one-page layout as an **Expert view** on the same engine and design file.
- Easy button offers 2–3 options (fewest hosts, lowest licensing, balanced); every auto choice is a
  decision marked "auto-selected" with its reason, and can be overridden.
- **Auto-designs must meet every Required and Recommended rule.** Required rules are a hard floor:
  never show an option that breaks one. "Fewest hosts" means the fewest that still pass the
  Recommended rules (e.g. 4-host vSAN clusters, rebuild capacity during maintenance). A deliberate
  exception is shown on the option card up front and recorded in the HLD as a decision with a risk.
  A test checks every easy-button option against Review for every golden workload.

## Two editions, one codebase

- **VCF Design Studio** (classic) at `/vcf-design-studio/`: no AI anywhere; it never shows, loads or calls AI.
- **VCF Design Studio: AI-powered** at `/vcf-design-studio-ai/`: the same app plus the AI layer.
- The page says which it is (`data-edition="ai"` on `<html>`); `studio/src/flags.ts` holds the editions,
  their names and which features each has. Both pages load the same built app and styles from
  `vcf-design-studio/`, so every fix lands in both. They share the design saved in the browser, so a
  design moves between them. Each names itself in the documents it makes.

## AI layer (build step 9)

- **The AI suggests and explains; the engine decides.** Every AI change arrives as a proposal through
  the same validation as the guided steps. Host counts, licensing, limits and rule results always come
  from the engine, never from the model. The AI may only touch whitelisted parts of the design
  (`studio/src/ai/catalog.ts`: policy, fleet, add-ons, host types, cluster settings, host networking,
  NSX choices, Identity Broker mode), never customer facts (workload, project, DNS and NTP, addresses,
  ASNs, identity provider, roles, break-glass, the IP plan) or decisions.
- **Labelled:** an applied AI suggestion is recorded in the design file (`decisions.ai`) and shows as
  "AI-suggested" in the decision register and the HLD. AI-drafted HLD text is stored per section
  (`narrative`), editable, marked as an AI draft, and flagged when the design changed since drafting.
- **Privacy:** off until the user sets up a provider; names where the design goes; shows exactly what will be sent; stand-in names on by
  default (customer, site, workload group and VM names, DNS domain, server addresses); nothing kept on
  a server. On real customer designs, the user's employer policy on AI services applies.
- **Bring any AI** (`studio/src/ai/providers.ts`): Claude, OpenAI, OpenRouter (Gemini and others),
  xAI, local models (Ollama, LM Studio) and any OpenAI-compatible service, each with its key, address
  and model, an in-app setup guide (steps, cost, links, caveats) and Load models / Test connection.
  Adding a provider is one entry in `PROVIDERS`. Keys stay in the browser unless the user asks to remember them.
- **One request shape** (`studio/src/ai/connector.ts`): the copilot and writer speak the Claude Messages
  shape; OpenAI-style APIs are translated there (`toOpenAi` / `fromOpenAi`). Later, a hosted backend
  that adds sign-in, usage limits and the key takes the same shape, so switching is configuration.
- **Tools in one list** (`studio/src/ai/tools.ts`): read the design, size a what-if, check the rules,
  explain a cluster, propose changes. New AI abilities are new tools.
- **Feature flags** `aiCopilot` and `aiWriter`. Tests use a stand-in API; CI never needs a key.

## Best practices

Pillars: Availability, Manageability, Performance, Recoverability, Security (AMPRS), plus Cost and
licensing efficiency. A deviation from a recommendation asks for a short reason and becomes a design
decision plus a risk in the HLD. Review shows a score per pillar. Don't show scores or "at risk"
badges until the design has a workload and topology to score.

## Design output

HLD: executive summary, requirements/assumptions/constraints/risks, fleet/instance/domain/cluster design,
host and storage design, identity and access (Identity Broker mode, IdP, role matrix, break-glass),
network (VDS, VLANs, IP plan, DNS records, NSX edges/T0/T1, BGP), add-ons, capacity analysis, BOM and
per-core licensing, prerequisites checklist by owning team, appendix with every formula and source.
Diagrams redraw live from the design and export to SVG, PNG and draw.io.

## Tech and quality

- TypeScript engine with unit tests per rule and **golden tests** (saved designs, including RVTools
  ones, with locked outputs). CI runs tests on every push; a failing test blocks deploy.
- The built files in `vcf-design-studio/app/` are committed because the site has no build step. A test
  rebuilds and fails if the committed build differs from the source; CI installs with `npm ci` from the
  committed `package-lock.json`.
- Feature flags and tiers live in `studio/src/flags.ts`; see `MAINTAINING.md` for where each kind of update goes.
- Every fix comes with a test that would have caught it.
- No internal jargon in the UI (e.g. "design format N"); that belongs in the design file, not on screen.
- Static site; no backend, accounts or payments yet (AI calls go from the browser with the user's own key). Mobile-friendly layouts and PWA-ready, so
  iPhone/Android apps (Capacitor) can follow later.
- Analytics, when added: cookieless, events only, never design content (no customer names, counts
  or RVTools data).
- Theme: local drafts use the original dark-capable theme; the published version uses the vCloudOne
  site theme. Don't put David's name against products in About/bio text.
- Add `MAINTAINING.md`: which file to edit for which kind of update.

## Build order

0. Explore the repo: how the site is built and hosted, where the VCF Sizing code lives, what tests
   exist. Report back before changing anything.
1. Extract the current VCF sizing logic into the TypeScript engine plus knowledge files, unchanged.
   Golden tests prove identical outputs to the live page.
2. Design document + migrations from the current settings format.
3. Guided flow and Expert view on the shared engine; skip/recommended behaviour.
4. Identity, host networking and NSX steps; IP/VLAN/DNS plan.
5. Best-practice rules, scorecard, decisions and risks.
6. Easy button with options.
6b. (Done 27 Nov.) Fixes from the 27 Nov review, before step 7: easy-button options meet the rules; no scores on an
   empty design; drop "design format N" from the banner; add the feature-flags module; add
   MAINTAINING.md and package-lock.json; CI build check. A test for each.
7. (Done 27 Nov.) Exporters: HLD, diagrams, draw.io, prerequisite checklist. The HLD is one content model
   (`studio/src/hld.ts`) rendered as the page preview, Word (.docx) and PDF (browser print); diagrams are
   SVG, PNG and draw.io; the prerequisites and IP / VLAN / DNS plan export to Excel. The IP plan moved
   from Review to Design output.
8. Ship at a new path (e.g. /vcf-design-studio/), with /vcf-sizing/ redirecting. (27 Nov: published at
   /vcf-design-studio/, unlinked and noindex, for testing. Menus, sitemap and the redirect come later.)
9. (Done 27 Nov, on the branch.) AI layer, in its own edition at /vcf-design-studio-ai/ (unlinked,
   noindex); the classic app stays AI-free. AI layer: copilot panel (explain, what-if, propose changes) and HLD
   writer (executive summary, design rationale, risk mitigations), with the user's own key first; a hosted
   backend later. Design format 10 adds `decisions.ai` and `narrative`. (27 Nov, later:) bring any AI —
   provider picker with setup guides; the first release's Claude-only settings still load.
