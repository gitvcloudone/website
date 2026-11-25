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

- Every post should leave the reader knowing what changed, why it matters and who it's for. Work that into the writing; don't label it.
- Updates are usually two or three short paragraphs. A `##` heading is fine if one gets long.
- Articles use any `##` and `###` headings.
- Markdown supported: paragraphs, `- ` bullets, `**bold**`, `*italic*`, `` `code` ``, `[links](https://...)`.
- Put a diagram anywhere in an article on its own line: `{{diagram:memory-tiering}}`.
- New diagrams go in `blog/diagrams/` as SVG. The first line can be `<!-- caption: Your caption -->`.

## How the site fits together

- `blog/shell.html` is the page frame. `blog/partials/nav.html` and `blog/partials/footer.html` are the top menu and footer.
- The build also copies that menu and footer into the guide, the EVS overview and the three sizers (between the `<!-- vc:nav -->` and `<!-- vc:footer -->` markers), so every page stays the same.
- Styles live in `assets/site.css` (fonts, menu, footer: every page) and `assets/blog.css` (blog pages).
- Share images for link previews are made in `assets/og/` when Pillow is installed (the GitHub Action installs it).
- `/feed.xml` is the RSS feed; `/rss/` explains how to subscribe.
