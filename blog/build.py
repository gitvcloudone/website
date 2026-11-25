#!/usr/bin/env python3
"""Build the vCloudOne blog.

Reads blog/posts/*.md and writes, at the repo root:
  index.html, updates/, articles/, articles/<slug>/, topics/<topic>/, about/, feed.xml

Run from anywhere:  python3 blog/build.py
Standard library only. See blog/README.md for how to write a post.
"""
import html
import os
import re
import sys
from datetime import date, datetime, timezone
from email.utils import format_datetime

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SITE = "https://vcloudone.com"

PRODUCTS = {"evs": "Amazon EVS", "vmc": "VMware Cloud on AWS", "vcf": "VCF", "site": "vCloudOne"}
TOPICS = {
    "hyperscalers": ("Hyperscalers", "AWS, Azure, Google Cloud and the VMware services that run on them."),
    "vmware": ("VMware", "VMware Cloud Foundation, vSphere, NSX, vSAN and the services built on them."),
    "ai": ("AI", "AI infrastructure, private AI and how AI tools change the work."),
    "cloud": ("Cloud", "Cloud architecture, migration and operations."),
    "tech": ("Tech", "Everything else in technology worth writing about."),
}
QUICK_ON_HOME = 8


# ── reading posts ────────────────────────────────────────────────────────────
def parse(path):
    text = open(path, encoding="utf-8").read()
    m = re.match(r"^---\n(.*?)\n---\n(.*)$", text, re.S)
    if not m:
        sys.exit(f"{path}: missing front matter (--- ... ---)")
    meta, body = {}, m.group(2).strip()
    key = None
    for line in m.group(1).splitlines():
        if not line.strip():
            continue
        if line.startswith("  - ") and key:
            meta.setdefault(key, []).append(line[4:].strip())
            continue
        k, _, v = line.partition(":")
        key = k.strip()
        v = v.strip()
        meta[key] = v if v else []
    name = os.path.splitext(os.path.basename(path))[0]
    p = {
        "file": os.path.basename(path),
        "slug": re.sub(r"^\d{4}-\d{2}-\d{2}-", "", name),
        "title": meta.get("title") or sys.exit(f"{path}: title missing"),
        "type": (meta.get("type") or "update").lower(),
        "product": (meta.get("product") or "").lower() if isinstance(meta.get("product"), str) else "",
        "topics": [t.strip().lower() for t in (meta.get("topics") or "").split(",") if t.strip()] if isinstance(meta.get("topics"), str) else [],
        "featured": str(meta.get("featured", "")).lower() == "true",
        "summary": meta.get("summary") if isinstance(meta.get("summary"), str) else "",
        "diagram": meta.get("diagram") if isinstance(meta.get("diagram"), str) else "",
        "body": body,
        "sources": [],
    }
    try:
        p["date"] = date.fromisoformat(str(meta.get("date")))
    except ValueError:
        sys.exit(f"{path}: date must look like 2026-12-01")
    for t in p["topics"]:
        if t not in TOPICS:
            sys.exit(f"{path}: unknown topic '{t}'. Use: {', '.join(TOPICS)}")
    if p["type"] not in ("update", "article"):
        sys.exit(f"{path}: type must be update or article")
    for s in meta.get("sources") or []:
        label, _, url = s.rpartition("|")
        p["sources"].append((label.strip() or url.strip(), url.strip()))
    return p


def load():
    d = os.path.join(HERE, "posts")
    posts = [parse(os.path.join(d, f)) for f in sorted(os.listdir(d)) if f.endswith(".md")]
    posts.sort(key=lambda p: (p["date"], p["file"]), reverse=True)
    seen = set()
    for p in posts:
        if p["slug"] in seen:
            sys.exit(f"{p['file']}: another post already uses the slug '{p['slug']}'")
        seen.add(p["slug"])
    return posts


# ── markdown (the small subset we use) ───────────────────────────────────────
def esc(s):
    return html.escape(s, quote=True)


def ext(url):
    return url.startswith("http")


def link(url, label):
    t = ' target="_blank" rel="noopener"' if ext(url) else ""
    return f'<a href="{esc(url)}"{t}>{label}</a>'


def inline(s):
    s = esc(s)
    s = re.sub(r"`([^`]+)`", r"<code>\1</code>", s)
    s = re.sub(r"\*\*([^*]+)\*\*", r"<strong>\1</strong>", s)
    s = re.sub(r"(?<![\w*])\*([^*\n]+)\*(?!\w)", r"<em>\1</em>", s)
    s = re.sub(r"\[([^\]]+)\]\(([^)\s]+)\)", lambda m: link(html.unescape(m.group(2)), m.group(1)), s)
    return s


def diagram(name):
    path = os.path.join(HERE, "diagrams", name + ".svg")
    if not os.path.exists(path):
        sys.exit(f"diagram '{name}' not found in blog/diagrams/")
    svg = open(path, encoding="utf-8").read().strip()
    cap = ""
    m = re.match(r"<!--\s*caption:\s*(.*?)\s*-->\s*", svg, re.S)
    if m:
        cap, svg = m.group(1), svg[m.end():]
    fc = f"<figcaption>{inline(cap)}</figcaption>" if cap else ""
    return f'<figure class="diag">{svg}{fc}</figure>'


def blocks(md, h2="h2", h3="h3"):
    out, para, items = [], [], []

    def flush():
        if para:
            out.append("<p>" + inline(" ".join(para)) + "</p>")
            para.clear()
        if items:
            out.append("<ul>" + "".join(f"<li>{inline(i)}</li>" for i in items) + "</ul>")
            items.clear()

    for raw in md.splitlines():
        line = raw.rstrip()
        s = line.strip()
        if not s:
            flush()
            continue
        m = re.fullmatch(r"\{\{\s*diagram:\s*([\w-]+)\s*\}\}", s)
        if m:
            flush(); out.append(diagram(m.group(1))); continue
        if s.startswith("### "):
            flush(); out.append(f"<{h3}>{inline(s[4:])}</{h3}>"); continue
        if s.startswith("## "):
            flush(); out.append(f"<{h2}>{inline(s[3:])}</{h2}>"); continue
        if re.match(r"[-*] ", s):
            if para:
                flush()
            items.append(s[2:])
            continue
        if items and raw.startswith("  "):
            items[-1] += " " + s
            continue
        if items:
            flush()
        para.append(s)
    flush()
    return "".join(out)


def sections(md):
    """Update bodies: '## What' etc. become small labelled sections."""
    parts = re.split(r"^## +(.+)$", md, flags=re.M)
    out = blocks(parts[0]) if parts[0].strip() else ""
    for i in range(1, len(parts), 2):
        out += f'<div class="sec"><h4>{inline(parts[i].strip())}</h4>{blocks(parts[i + 1])}</div>'
    return out


# ── bits of html ─────────────────────────────────────────────────────────────
def nice(d):
    return d.strftime("%b %-d, %Y")


def url_of(p):
    return f"/articles/{p['slug']}/" if p["type"] == "article" else f"/updates/#{p['slug']}"


def chip(p):
    return f'<span class="chip {p["product"]}">{PRODUCTS[p["product"]]}</span>' if p["product"] in PRODUCTS else ""


def topic_links(p):
    return "".join(f'<a class="topic" href="/topics/{t}/">{TOPICS[t][0]}</a>' for t in p["topics"])


def src_list(p, word=None):
    if not p["sources"]:
        return ""
    word = word or ("Read more" if p["product"] == "site" else ("Source" if len(p["sources"]) == 1 else "Sources"))
    lis = "".join(f"<li>{link(u, esc(l))}</li>" for l, u in p["sources"])
    return f'<div class="post-src"><b>{word}</b><ul>{lis}</ul></div>'


def card(p):
    """A full update card, used on /updates/."""
    body = sections(p["body"])
    if p["diagram"]:
        d = diagram(p["diagram"])
        i = body.find("</div>")
        body = body[: i + 6] + d + body[i + 6:] if i >= 0 else body + d
    first = p["sources"][0][1] if p["sources"] else f"#{p['slug']}"
    t = ' target="_blank" rel="noopener"' if ext(first) else ""
    return (
        f'<article class="post {p["product"]}" id="{p["slug"]}" data-product="{p["product"]}">'
        f'<div class="post-meta"><time datetime="{p["date"]}">{nice(p["date"])}</time>{chip(p)}{topic_links(p)}</div>'
        f'<h3><a href="{esc(first)}"{t}>{inline(p["title"])}</a><a class="perma" href="#{p["slug"]}" title="Link to this post">#</a></h3>'
        f"{body}{src_list(p)}</article>"
    )


def acard(p):
    return (
        f'<a class="acard" href="{url_of(p)}"><div class="tags"><time>{nice(p["date"])}</time>'
        + "".join(f'<span class="topic">{TOPICS[t][0]}</span>' for t in p["topics"])
        + f'</div><h3>{inline(p["title"])}</h3><p>{inline(p["summary"])}</p></a>'
    )


def qrow(p):
    return (
        f'<a class="qrow" href="{url_of(p)}"><time datetime="{p["date"]}">{nice(p["date"])}</time>'
        f'<span><b>{inline(p["title"])}</b>{chip(p)}</span></a>'
    )


def feat(p):
    first_diag = re.search(r"\{\{\s*diagram:\s*([\w-]+)\s*\}\}", p["body"])
    d = diagram(p["diagram"] or first_diag.group(1)) if (p["diagram"] or first_diag) else ""
    return (
        f'<a class="feat" href="{url_of(p)}">{d}<div class="tags"><span>Featured</span><time>{nice(p["date"])}</time>'
        + "".join(f'<span class="topic">{TOPICS[t][0]}</span>' for t in p["topics"])
        + f'</div><h2>{inline(p["title"])}</h2><p>{inline(p["summary"])}</p><span class="more">Read the article &rarr;</span></a>'
    )


SIDEBAR = """
<aside class="side">
  <div class="box">
    <h4>About</h4>
    <p class="note">I'm David Chung. I work with customers moving VMware workloads to AWS, mostly on Amazon EVS and VMware Cloud on AWS. This is where I write about that, and about cloud, AI and tech in general. <a href="/about/">More</a></p>
  </div>
  <div class="box">
    <h4>Tools</h4>
    <a class="item" href="/evs-sizing/"><b>EVS Sizing</b><small>Hosts and clusters for Amazon EVS</small></a>
    <a class="item" href="/vmc-sizing/"><b>VMC Sizing</b><small>SDDCs, clusters and hosts for VMware Cloud on AWS</small></a>
    <a class="item" href="/vcf-sizing/"><b>VCF Sizing</b><small>Fleets, domains and clusters on your own hardware</small></a>
  </div>
  <div class="box">
    <h4>Guides</h4>
    <a class="item" href="/evs-guide/"><b>Amazon EVS deployment guide</b><small>Prerequisites, Terraform and validation</small></a>
    <a class="item" href="/evs/"><b>Amazon EVS overview</b><small>What EVS is and how it fits</small></a>
  </div>
  <div class="box">
    <h4>Follow</h4>
    <a class="item" href="https://www.linkedin.com/in/vdchung/" target="_blank" rel="noopener"><b>LinkedIn</b><small>linkedin.com/in/vdchung</small></a>
    <a class="item" href="https://x.com/dchung615" target="_blank" rel="noopener"><b>X</b><small>@dchung615</small></a>
    <a class="item" href="/feed.xml"><b>RSS</b><small>New posts in your feed reader</small></a>
  </div>
</aside>"""


def topic_tabs(active=""):
    tabs = [("", "All", "/")] + [(k, v[0], f"/topics/{k}/") for k, v in TOPICS.items()]
    return '<div class="filters">' + "".join(
        f'<a href="{u}"{" class=on" if k == active else ""}>{n}</a>' for k, n, u in tabs) + "</div>"


def head(title, text, extra=""):
    return f'<header class="bloghead"><div class="bloghead-inner"><h1>{title}</h1><p>{text}</p>{extra}</div></header>'


SHELL = open(os.path.join(HERE, "shell.html"), encoding="utf-8").read()


def page(title, desc, main, active="", script=""):
    out = SHELL.replace("{{TITLE}}", esc(title)).replace("{{DESC}}", esc(desc))
    for k in ("articles", "updates", "topics", "tools", "about"):
        on = k == active
        out = out.replace("{{A_%s}}" % k, (" active" if on else "") if k in ("topics", "tools") else (' class="active"' if on else ""))
    out = re.sub(r"<!-- Shared page shell.*?-->\n", "<!-- Generated by blog/build.py. Edit blog/posts/*.md, not this file. -->\n", out, count=1)
    return out.replace("{{MAIN}}", main).replace("{{SCRIPT}}", script)


def write(rel, text):
    path = os.path.join(ROOT, rel)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        f.write(text)


# ── pages ────────────────────────────────────────────────────────────────────
def build_home(posts):
    arts = [p for p in posts if p["type"] == "article"]
    ups = [p for p in posts if p["type"] == "update"]
    featured = next((p for p in arts if p["featured"]), arts[0] if arts else None)
    rest = [p for p in arts if p is not featured][:4]
    feed = ""
    if featured:
        feed += feat(featured)
    if rest:
        feed += f'<div class="lbl-row"><p class="lbl">Latest articles</p><a href="/articles/">All articles &rarr;</a></div><div class="acards">{"".join(acard(p) for p in rest)}</div>'
    feed += f'<div class="lbl-row"><p class="lbl">Quick updates</p><a href="/updates/">All updates &rarr;</a></div>'
    feed += f'<div class="qlist">{"".join(qrow(p) for p in ups[:QUICK_ON_HOME])}</div>'
    main = head("Notes on <em>cloud, VMware and AI</em>",
                "By David Chung. Longer articles when there's something worth explaining, and short updates on Amazon EVS, VMware Cloud on AWS and VCF as they ship.",
                topic_tabs()) + f'<main class="blog"><div class="feed">{feed}</div>{SIDEBAR}</main>'
    write("index.html", page("vCloudOne | Notes on cloud, VMware and AI",
                             "David Chung on Amazon EVS, VMware Cloud on AWS, VCF, cloud and AI: articles, product updates and sizing tools.", main))


def build_updates(posts):
    ups = [p for p in posts if p["type"] == "update"]
    counts = {k: sum(1 for p in ups if p["product"] == k) for k in PRODUCTS}
    btns = f'<button class="on" data-f="all">All<span class="n">{len(ups)}</span></button>' + "".join(
        f'<button data-f="{k}">{v}<span class="n">{counts[k]}</span></button>' for k, v in PRODUCTS.items() if counts[k])
    feed, month = "", None
    for p in ups:
        m = p["date"].strftime("%B %Y")
        if m != month:
            feed += f'<h2 class="month">{m}</h2>'
            month = m
        feed += card(p)
    script = """
(function () {
  var btns = document.querySelectorAll('.filters button');
  function apply(f) {
    btns.forEach(function (b) { b.classList.toggle('on', b.dataset.f === f); });
    document.querySelectorAll('.post').forEach(function (p) { p.classList.toggle('hidden', f !== 'all' && p.dataset.product !== f); });
    document.querySelectorAll('.month').forEach(function (h) {
      var n = h.nextElementSibling, any = false;
      while (n && !n.classList.contains('month')) { if (!n.classList.contains('hidden')) any = true; n = n.nextElementSibling; }
      h.classList.toggle('hidden', !any);
    });
  }
  btns.forEach(function (b) { b.addEventListener('click', function () { apply(b.dataset.f); }); });
})();"""
    main = head("Updates", "Short notes on what shipped for Amazon EVS, VMware Cloud on AWS and VCF, with a link to the source for each.",
                f'<div class="filters">{btns}</div>') + f'<main class="blog"><div class="feed">{feed}</div>{SIDEBAR}</main>'
    write("updates/index.html", page("Updates | vCloudOne", "Amazon EVS, VMware Cloud on AWS and VCF updates, with sources.", main, "updates", script))


def build_articles(posts):
    arts = [p for p in posts if p["type"] == "article"]
    grid = f'<div class="acards">{"".join(acard(p) for p in arts)}</div>' if arts else '<p class="lbl">No articles yet.</p>'
    main = head("Articles", "Longer pieces on cloud, VMware, AI and tech.") + f'<main class="blog"><div class="feed">{grid}</div>{SIDEBAR}</main>'
    write("articles/index.html", page("Articles | vCloudOne", "Articles on cloud, VMware, AI and tech by David Chung.", main, "articles"))
    for p in arts:
        body = blocks(p["body"])
        if p["diagram"] and "{{diagram" not in p["body"]:
            body = diagram(p["diagram"]) + body
        art = (
            f'<article class="art"><div class="tags">{topic_links(p)}</div>'
            f'<h1>{inline(p["title"])}</h1>'
            + (f'<p class="dek">{inline(p["summary"])}</p>' if p["summary"] else "")
            + f'<p class="byline">David Chung &middot; <time datetime="{p["date"]}">{nice(p["date"])}</time></p>'
            f'{body}{src_list(p, "Sources" if len(p["sources"]) > 1 else "Source")}</article>'
        )
        main = f'<main class="blog"><div class="feed">{art}</div>{SIDEBAR}</main>'
        write(f"articles/{p['slug']}/index.html", page(f"{p['title']} | vCloudOne", p["summary"] or p["title"], main, "articles"))


def build_topics(posts):
    for k, (name, blurb) in TOPICS.items():
        tp = [p for p in posts if k in p["topics"]]
        arts = [p for p in tp if p["type"] == "article"]
        ups = [p for p in tp if p["type"] == "update"]
        feed = ""
        if arts:
            feed += f'<p class="lbl">Articles</p><div class="acards">{"".join(acard(p) for p in arts)}</div>'
        if ups:
            feed += f'<div class="lbl-row"><p class="lbl">Updates</p><a href="/updates/">All updates &rarr;</a></div><div class="qlist">{"".join(qrow(p) for p in ups)}</div>'
        if not tp:
            feed = '<div class="qlist"><p class="note" style="padding:.8rem 0;color:var(--muted)">Nothing here yet. Posts on this topic are on the way.</p></div>'
        main = head(name, blurb, topic_tabs(k)) + f'<main class="blog"><div class="feed">{feed}</div>{SIDEBAR}</main>'
        write(f"topics/{k}/index.html", page(f"{name} | vCloudOne", f"{name} posts on vCloudOne. {blurb}", main, "topics"))


def build_about():
    md = open(os.path.join(HERE, "about.md"), encoding="utf-8").read()
    art = f'<article class="art"><div class="about-photo">DC</div><h1>About</h1>{blocks(md)}</article>'
    main = f'<main class="blog"><div class="feed">{art}</div>{SIDEBAR}</main>'
    write("about/index.html", page("About | vCloudOne", "About David Chung and vCloudOne.", main, "about"))


def build_feed(posts):
    items = ""
    for p in posts[:30]:
        u = SITE + url_of(p)
        text = p["summary"] or re.sub(r"<[^>]+>", " ", sections(p["body"]))
        text = re.sub(r"\s+", " ", html.unescape(text)).strip()[:400]
        dt = datetime(p["date"].year, p["date"].month, p["date"].day, 12, tzinfo=timezone.utc)
        items += (f"<item><title>{esc(p['title'])}</title><link>{esc(u)}</link><guid>{esc(u)}</guid>"
                  f"<pubDate>{format_datetime(dt)}</pubDate><description>{esc(text)}</description></item>\n")
    write("feed.xml", f"""<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
<title>vCloudOne</title><link>{SITE}/</link>
<description>David Chung on cloud, VMware and AI</description><language>en-us</language>
{items}</channel></rss>
""")


def main():
    posts = load()
    build_home(posts)
    build_updates(posts)
    build_articles(posts)
    build_topics(posts)
    build_about()
    build_feed(posts)
    a = sum(1 for p in posts if p["type"] == "article")
    print(f"Built {len(posts)} posts ({a} articles, {len(posts) - a} updates).")


if __name__ == "__main__":
    main()
