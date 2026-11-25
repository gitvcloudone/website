# vCloudOne blog

The front page, `/updates/`, `/articles/`, `/topics/*`, `/about/` and `/feed.xml` are generated from the Markdown files in `blog/posts/`. Don't edit those generated pages by hand.

## Add a post

1. Copy `blog/_template-update.md` (short news) or `blog/_template-article.md` (longer piece) into `blog/posts/`.
2. Name it `YYYY-MM-DD-short-slug.md`. The slug becomes the link: `/updates/#short-slug` or `/articles/short-slug/`.
3. Fill in the front matter and write the post.
4. Commit and push. The GitHub Action (`.github/workflows/blog.yml`) rebuilds the pages and commits them.

To build locally instead: `python3 blog/build.py` (Python 3, no packages needed).

## Front matter

| Field | Used for |
|---|---|
| `title` | Headline |
| `date` | `2026-12-01`. Newest posts show first |
| `type` | `update` or `article` |
| `product` | Optional: `evs`, `vmc`, `vcf` or `site`. Sets the colour chip and the Updates filter |
| `topics` | Comma list from `hyperscalers, vmware, ai, cloud, tech` |
| `featured` | Articles only. `true` puts it at the top of the front page (otherwise the newest article is used) |
| `summary` | Articles: the one or two lines shown on cards, in previews and in RSS |
| `diagram` | Optional name of an SVG in `blog/diagrams/` (without `.svg`) |
| `sources` | One per line: `  - Label | https://...` |

## Writing

- Updates use `## What`, `## Why it matters` and `## Who it's for`. Leave out a section if there's nothing to say.
- Articles use any `##` and `###` headings.
- Markdown supported: paragraphs, `- ` bullets, `**bold**`, `*italic*`, `` `code` ``, `[links](https://...)`.
- Put a diagram anywhere in an article on its own line: `{{diagram:memory-tiering}}`.
- New diagrams go in `blog/diagrams/` as SVG. The first line can be `<!-- caption: Your caption -->`.
