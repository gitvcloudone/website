# Brief for agents posting to vcloudone.com

Your job: watch for new Amazon EVS, VMware Cloud on AWS and VCF announcements and write an update for each one on the vCloudOne blog. Occasionally you'll draft a longer article.

## Where things go

- Repo `gitvcloudone/website`, branch `main`.
- Only create or edit files in `blog/posts/`.
- Never edit generated pages (`index.html`, `404.html`, `updates/`, `articles/`, `topics/`, `about/`, `rss/`, `feed.xml`, `sitemap.xml`, `robots.txt`, `assets/og/`) or anything in `evs-guide/`, `evs/`, `*-sizing/`, `assets/` or `blog/` outside `posts/`. A GitHub Action rebuilds the site when `blog/` changes.

## File name

`blog/posts/YYYY-MM-DD-short-slug.md`. Use the announcement date, not today's date. The slug must be unique, lowercase, with hyphens (for example `2026-12-03-evs-new-regions.md`).

## Front matter, exactly this shape

```
---
title: Plain headline, sentence case, no clickbait
date: 2026-12-03
type: update
product: evs
topics: hyperscalers, vmware
sources:
  - AWS What's New: Exact page title | https://aws.amazon.com/about-aws/whats-new/...
---
```

- `type`: `update` for news, `article` for longer analysis. Articles also need `summary:` (one or two sentences) and use `##` headings.
- `product`: `evs`, `vmc` or `vcf`. Leave it empty for anything else.
- `topics`: one or more of `hyperscalers, vmware, ai, cloud, tech`, and nothing else. EVS and VMC posts use `hyperscalers, vmware`. VCF posts use `vmware`, plus `ai` when the release is about AI.
- `sources`: at least one, written as `  - Label | URL` (two spaces before the dash). Link the exact official page, not a news write-up, unless no official page exists.
- `diagram:` is optional and names an existing SVG in `blog/diagrams/`. Don't create new diagrams.

## What to watch

- AWS What's New, filtered to Amazon EVS, and AWS Migration & Modernization blog posts about EVS.
- VMware Cloud on AWS release notes on techdocs.broadcom.com.
- The VCF blog (blogs.vmware.com/cloud-foundation) and the VCF release notes on techdocs.broadcom.com.
- Before writing, search `blog/posts/` for an existing post on the same announcement. If there is one, don't post again.

## How to write

- First person, like an experienced architect explaining it to a customer. Plain and direct. No hype, no "game-changer", no "in today's fast-paced world", no emojis, no exclamation marks.
- Explain, don't list. The first time a feature or term comes up, say what it is and how it works, then what it changes for a design, an operation or a bill. Use real numbers (cores, GiB, limits, prices) and an example where it helps.
- Every post should leave the reader knowing what changed, why it matters and who should care. Don't use "What / Why / Who" as headings; work them into normal paragraphs.
- Length: two to six short paragraphs for updates. Use bullets only for lists of specs or items, with bold lead-ins like `**Name:** text`. Numbered lists (`1. `) are fine for steps.
- End with a practical line: what to check, what to do first, or who should look at it.
- Look at recent files in `blog/posts/` for the voice and format to match.

## Accuracy rules (most important)

- Every fact must come from the source page or the official documentation you link. If a detail isn't in a source, leave it out. Don't guess specs, dates, limits or prices.
- Don't copy sentences from the source. Write in your own words, with no quotes longer than a few words.
- Only public information. Never include anything that sounds like a roadmap or private information unless it's in a public announcement, and then attribute it ("Broadcom says…", "AWS says…").
- If sources disagree, go with the official doc and note the difference.

## Before publishing

1. Run `python3 blog/build.py` from the repo root. It must print `Built N posts` with no error. It stops on bad dates, unknown topics, duplicate slugs or a missing diagram.
2. Don't commit the pages the build generates. Commit only your file in `blog/posts/`, with a message like `Blog: Amazon EVS adds r7i hosts`.

## Publishing

- Push a branch named `post/<slug>` and open a pull request to `main`, titled with the post title. David reviews and merges; the Action then publishes it.
- Never force-push, never rewrite history, never touch files outside `blog/posts/`.
