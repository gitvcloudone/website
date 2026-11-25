#!/usr/bin/env python3
"""Build the vCloudOne blog.

Reads blog/posts/*.md and writes, at the repo root:
  index.html, updates/, articles/, articles/<slug>/, topics/<topic>/, about/, 404.html,
  feed.xml (+ feed.xsl), sitemap.xml, robots.txt and share images in assets/og/.
It also keeps the shared menu and footer in sync on the guide, EVS overview and sizer pages.

Run from anywhere:  python3 blog/build.py
Standard library only. See blog/README.md for how to write a post.
"""
import hashlib
import html
import math
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
STREAM_ON_HOME = 12
STATIC_PAGES = ["evs-guide/index.html", "evs/index.html", "evs-sizing/index.html", "vmc-sizing/index.html", "vcf-sizing/index.html"]


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


def slugify(s):
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")[:60]


def blocks(md, h2="h2", h3="h3"):
    out, para, items = [], [], []
    kind = ["ul"]

    def flush():
        if para:
            out.append("<p>" + inline(" ".join(para)) + "</p>")
            para.clear()
        if items:
            out.append(f"<{kind[0]}>" + "".join(f"<li>{inline(i)}</li>" for i in items) + f"</{kind[0]}>")
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
            flush(); out.append(f'<{h2} id="{slugify(s[3:])}">{inline(s[3:])}</{h2}>'); continue
        m = re.match(r"([-*]|\d+\.) +", s)
        if m:
            k = "ol" if m.group(1)[0].isdigit() else "ul"
            if para or (items and kind[0] != k):
                flush()
            kind[0] = k
            items.append(s[m.end():])
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
    """Update bodies: plain paragraphs; an optional '## Heading' becomes a small subheading."""
    parts = re.split(r"^## +(.+)$", md, flags=re.M)
    out = blocks(parts[0]) if parts[0].strip() else ""
    for i in range(1, len(parts), 2):
        out += f"<h4>{inline(parts[i].strip())}</h4>{blocks(parts[i + 1])}"
    return out




# ── helpers ──────────────────────────────────────────────────────────────────
def nice(d):
    return d.strftime("%b %-d, %Y")


def url_of(p):
    return f"/articles/{p['slug']}/" if p["type"] == "article" else f"/updates/#{p['slug']}"


def plain(md):
    t = re.sub(r"\{\{[^}]*\}\}", " ", md)
    t = re.sub(r"(?m)^\s*([-*]|\d+\.) +", "", t)
    t = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", t)
    t = re.sub(r"[*`#>]", "", t)
    return re.sub(r"\s+", " ", t).strip()


def clip(text, n):
    if len(text) <= n:
        return text
    cut = text[:n].rsplit(" ", 1)[0].rstrip(",;:.-–—")
    return cut + "…"


def excerpt(p, n=200):
    if p["summary"]:
        return p["summary"]
    return clip(plain(p["body"]), n)


def minutes(p):
    return max(1, math.ceil(len(plain(p["body"]).split()) / 220))


def chip(p):
    return f'<span class="chip {p["product"]}">{PRODUCTS[p["product"]]}</span>' if p["product"] in PRODUCTS else ""


def topic_links(p, cls="topic"):
    return '<span class="sep"> · </span>'.join(f'<a class="{cls}" href="/topics/{t}/">{TOPICS[t][0]}</a>' for t in p["topics"])


def src_list(p):
    if not p["sources"]:
        return ""
    word = "Read more" if p["product"] == "site" else ("Source" if len(p["sources"]) == 1 else "Sources")
    lis = "".join(f"<li>{link(u, esc(l))}</li>" for l, u in p["sources"])
    return f'<div class="src"><b>{word}</b><ul>{lis}</ul></div>'


def first_diagram(p):
    if p["diagram"]:
        return p["diagram"]
    m = re.search(r"\{\{\s*diagram:\s*([\w-]+)\s*\}\}", p["body"])
    return m.group(1) if m else ""


# ── building blocks ──────────────────────────────────────────────────────────
def card(p):
    """A full update on /updates/."""
    body = sections(p["body"])
    if p["diagram"]:
        d = diagram(p["diagram"])
        i = body.find("</p>")
        body = body[: i + 4] + d + body[i + 4:] if i >= 0 else body + d
    return (
        f'<article class="post {p["product"]}" id="{p["slug"]}" data-product="{p["product"]}">'
        f'<div class="meta"><time datetime="{p["date"]}">{nice(p["date"])}</time>{chip(p)}{topic_links(p)}</div>'
        f'<h3>{inline(p["title"])}<a class="perma" href="#{p["slug"]}" aria-label="Link to this update">#</a></h3>'
        f"{body}{src_list(p)}</article>"
    )


def acard(p):
    return (
        f'<a class="acard" href="{url_of(p)}"><span class="kind">Article</span>'
        f'<h3>{inline(p["title"])}</h3><p>{inline(excerpt(p))}</p>'
        f'<div class="meta"><time datetime="{p["date"]}">{nice(p["date"])}</time><span class="sep">·</span>'
        f'<span>{minutes(p)} min read</span></div></a>'
    )


def urow(p):
    return (
        f'<a class="urow" href="{url_of(p)}"><time datetime="{p["date"]}">{p["date"].strftime("%b %-d")}</time>'
        f'<span><b>{inline(p["title"])}</b><span class="ex">{esc(excerpt(p, 170))}</span>{chip(p)}</span></a>'
    )


def stream(items):
    out, run = [], []
    for p in items:
        if p["type"] == "update":
            run.append(urow(p))
            continue
        if run:
            out.append(f'<div class="ulist">{"".join(run)}</div>'); run = []
        out.append(acard(p))
    if run:
        out.append(f'<div class="ulist">{"".join(run)}</div>')
    return f'<div class="stream">{"".join(out)}</div>'


def hero(p):
    d = first_diagram(p)
    pic = ""
    if d:
        svg = re.sub(r'<figure class="diag">|</figure>|<figcaption>.*?</figcaption>', "", diagram(d))
        pic = f'<div class="art-pic">{svg}</div>'
    return (
        f'<a class="hero" href="{url_of(p)}"><div class="txt"><span class="badge">Featured</span>'
        f'<div class="meta"><time datetime="{p["date"]}">{nice(p["date"])}</time><span class="sep">·</span><span>{minutes(p)} min read</span></div>'
        f'<h2>{inline(p["title"])}</h2><p>{inline(excerpt(p))}</p><span class="more">Read the article &rarr;</span></div>{pic}</a>'
    )


SIDEBAR = """<aside class="side">
  <div class="box">
    <div class="me"><div class="avatar">DC</div><div><b>David Chung</b><small>Cloud solutions architect</small></div></div>
    <p>I help customers run VMware workloads on AWS, mostly on Amazon EVS and VMware Cloud on AWS. Here I write about that, and about cloud, AI and tech. <a href="/about/">More about me</a></p>
  </div>
  <div class="box">
    <h4>Tools</h4>
    <a class="item" href="/evs-sizing/"><span><b>EVS Sizing</b><small>Hosts and clusters for Amazon EVS</small></span><i>&rarr;</i></a>
    <a class="item" href="/vmc-sizing/"><span><b>VMC Sizing</b><small>SDDCs and hosts for VMware Cloud on AWS</small></span><i>&rarr;</i></a>
    <a class="item" href="/vcf-sizing/"><span><b>VCF Sizing</b><small>Fleets and clusters on your own hardware</small></span><i>&rarr;</i></a>
    <a class="item" href="/evs-guide/"><span><b>EVS deployment guide</b><small>Prerequisites, Terraform, validator</small></span><i>&rarr;</i></a>
  </div>
  <div class="box">
    <h4>Follow</h4>
    <a class="item" href="https://www.linkedin.com/in/vdchung/" target="_blank" rel="noopener"><span><b>LinkedIn</b><small>linkedin.com/in/vdchung</small></span><i>&nearr;</i></a>
    <a class="item" href="https://x.com/dchung615" target="_blank" rel="noopener"><span><b>X</b><small>@dchung615</small></span><i>&nearr;</i></a>
    <a class="item" href="/rss/"><span><b>RSS feed</b><small>New posts in your feed reader</small></span><i>&rarr;</i></a>
  </div>
</aside>"""


def topic_tabs(posts, active=""):
    counts = {k: sum(1 for p in posts if k in p["topics"]) for k in TOPICS}
    tabs = [f'<a href="/"{" class=on" if not active else ""}>All <span class="n">{len(posts)}</span></a>']
    tabs += [f'<a href="/topics/{k}/"{" class=on" if k == active else ""}>{v[0]} <span class="n">{counts[k]}</span></a>'
             for k, v in TOPICS.items() if counts[k] or k == active]
    return '<div class="tabs">' + "".join(tabs) + "</div>"


def band(inner, cls=""):
    return f'<header class="band {cls}"><div class="wrap">{inner}</div></header>'


# ── page shell ───────────────────────────────────────────────────────────────
def read(rel):
    return open(os.path.join(HERE, rel), encoding="utf-8").read()


SHELL = read("shell.html")
NAV = read("partials/nav.html")
THEMEHEAD = read("partials/theme-head.html").strip()
FOOTER = read("partials/footer.html").replace("{{YEAR}}", str(date.today().year))
VER = hashlib.sha1(b"".join(open(os.path.join(ROOT, "assets", f), "rb").read() for f in ("site.css", "blog.css", "site.js", "theme-sizer.css", "theme-guide.css"))).hexdigest()[:8]


def nav_html(posts, active=""):
    present = [k for k in TOPICS if any(k in p["topics"] for p in posts)]
    menu = "\n".join(f'          <a href="/topics/{k}/">{TOPICS[k][0]}</a>' for k in present)
    out = NAV.replace("{{TOPICS_MENU}}", menu)
    for k in ("articles", "updates", "about"):
        out = out.replace("{{ON_%s}}" % k, ' class="on" aria-current="page"' if k == active else "")
    for k in ("topics", "tools"):
        out = out.replace("{{ON_%s}}" % k, " on" if k == active else "")
    return out


def page(posts, path, title, desc, main, active="", ogtype="website", image="/assets/og/default.png", head="", script=""):
    url = SITE + path
    rep = {
        "{{TITLE}}": esc(title), "{{OGTITLE}}": esc(title.split(" | ")[0]), "{{DESC}}": esc(desc), "{{URL}}": url,
        "{{OGTYPE}}": ogtype, "{{THEMEHEAD}}": THEMEHEAD, "{{IMAGE}}": SITE + image, "{{VER}}": VER, "{{HEAD}}": head,
        "{{NAV}}": nav_html(posts, active), "{{FOOTER}}": FOOTER, "{{SCRIPT}}": script, "{{MAIN}}": main,
    }
    out = SHELL
    for k, v in rep.items():
        out = out.replace(k, v)
    return out


WRITTEN = []


def write(rel, text, sitemap=True):
    path = os.path.join(ROOT, rel)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        f.write(text)
    if sitemap and rel.endswith("index.html"):
        WRITTEN.append("/" + rel[: -len("index.html")])


# ── pages ────────────────────────────────────────────────────────────────────
def build_home(posts):
    arts = [p for p in posts if p["type"] == "article"]
    featured = next((p for p in arts if p["featured"]), arts[0] if arts else None)
    rest = [p for p in posts if p is not featured][:STREAM_ON_HOME]
    col = (hero(featured) if featured else "")
    col += f'<div class="sec-h"><h2>Latest</h2><a href="/updates/">All updates &rarr;</a></div>{stream(rest)}'
    top = band('<p class="eyebrow">vCloudOne &middot; by David Chung</p>'
               '<h1>Notes on <em>cloud</em>, VMware and AI</h1>'
               '<p class="lede">Articles when there&rsquo;s something worth explaining, and short updates on Amazon EVS, VMware Cloud on AWS and VCF as they ship.</p>'
               + topic_tabs(posts), "home")
    main = top + f'<main class="wrap main lift"><div class="col">{col}</div>{SIDEBAR}</main>'
    write("index.html", page(posts, "/", "vCloudOne | Notes on cloud, VMware and AI",
                             "David Chung on Amazon EVS, VMware Cloud on AWS, VCF, cloud and AI: articles, product updates and sizing tools.", main))


def build_updates(posts):
    ups = [p for p in posts if p["type"] == "update"]
    counts = {k: sum(1 for p in ups if p["product"] == k) for k in PRODUCTS}
    btns = f'<button class="on" data-f="all">All <span class="n">{len(ups)}</span></button>' + "".join(
        f'<button data-f="{k}"><span class="dot" style="background:var(--{k})"></span>{v} <span class="n">{counts[k]}</span></button>'
        for k, v in PRODUCTS.items() if counts[k])
    feed, month, run = "", None, []

    def flush():
        nonlocal feed
        if run:
            feed += f'<div class="tl">{"".join(run)}</div>'
            run.clear()

    for p in ups:
        m = p["date"].strftime("%B %Y")
        if m != month:
            flush()
            feed += f'<h2 class="month">{m}</h2>'
            month = m
        run.append(card(p))
    flush()
    script = """<script>
(function () {
  var btns = document.querySelectorAll('.tabs button');
  function apply(f) {
    btns.forEach(function (b) { b.classList.toggle('on', b.dataset.f === f); });
    document.querySelectorAll('.post').forEach(function (p) { p.classList.toggle('hidden', f !== 'all' && p.dataset.product !== f); });
    document.querySelectorAll('.tl').forEach(function (t) {
      var any = t.querySelector('.post:not(.hidden)');
      t.classList.toggle('hidden', !any); t.previousElementSibling.classList.toggle('hidden', !any);
    });
  }
  btns.forEach(function (b) { b.addEventListener('click', function () { apply(b.dataset.f); }); });
})();
</script>"""
    top = band('<p class="eyebrow">Updates</p><h1>What shipped, and why it matters</h1>'
               '<p class="lede">Short notes on Amazon EVS, VMware Cloud on AWS and VCF releases, each with a link to the source.</p>'
               f'<div class="tabs">{btns}</div>', "slim")
    main = top + f'<main class="wrap main"><div class="col">{feed}</div>{SIDEBAR}</main>'
    write("updates/index.html", page(posts, "/updates/", "Updates | vCloudOne",
                                     "Amazon EVS, VMware Cloud on AWS and VCF updates, explained, with sources.", main, "updates", script=script))


def build_articles(posts):
    arts = [p for p in posts if p["type"] == "article"]
    grid = stream(arts) if arts else '<div class="box empty">No articles yet.</div>'
    top = band('<p class="eyebrow">Articles</p><h1>Longer reads</h1>'
               '<p class="lede">When something needs more than a quick update: how it works, what it changes and what I&rsquo;d do about it.</p>', "slim")
    write("articles/index.html", page(posts, "/articles/", "Articles | vCloudOne", "Articles on cloud, VMware, AI and tech by David Chung.",
                                      top + f'<main class="wrap main"><div class="col">{grid}</div>{SIDEBAR}</main>', "articles"))
    for i, p in enumerate(arts):
        body = blocks(p["body"])
        if p["diagram"] and "{{diagram" not in p["body"]:
            body = diagram(p["diagram"]) + body
        heads = re.findall(r'<h2 id="([^"]+)">(.*?)</h2>', body)
        toc = ('<aside><nav class="toc" aria-label="On this page"><b>On this page</b>'
               + "".join(f'<a href="#{h}">{t}</a>' for h, t in heads) + "</nav></aside>") if len(heads) >= 3 else "<aside></aside>"
        newer = arts[i - 1] if i > 0 else None
        older = arts[i + 1] if i + 1 < len(arts) else None
        pn = ""
        if newer or older:
            pn = '<div class="pn">' + (f'<a href="{url_of(older)}"><small>&larr; Older</small>{inline(older["title"])}</a>' if older else "<span></span>") \
                 + (f'<a class="next" href="{url_of(newer)}"><small>Newer &rarr;</small>{inline(newer["title"])}</a>' if newer else "") + "</div>"
        end = (f'<div class="endbox">{src_list(p)}<div class="author" style="margin-top:24px"><div class="avatar">DC</div>'
               f'<p><b>David Chung</b> helps customers run VMware workloads on AWS. '
               f'<a href="https://www.linkedin.com/in/vdchung/" target="_blank" rel="noopener">Connect on LinkedIn</a> or '
               f'<a href="/rss/">follow the RSS feed</a>.</p></div>{pn}</div>')
        top = band(f'<p class="eyebrow">{topic_links(p)}</p><h1>{inline(p["title"])}</h1>'
                   + (f'<p class="lede">{inline(p["summary"])}</p>' if p["summary"] else "")
                   + f'<div class="meta">David Chung<span class="sep">·</span><time datetime="{p["date"]}">{nice(p["date"])}</time>'
                   f'<span class="sep">·</span>{minutes(p)} min read</div>', "slim art-head")
        main = top + f'<div class="wrap art-grid"><article class="prose">{body}{end}</article>{toc}</div>'
        img = f"/assets/og/{p['slug']}.png" if os.path.exists(os.path.join(ROOT, "assets", "og", p["slug"] + ".png")) else "/assets/og/default.png"
        head = (f'<meta property="article:published_time" content="{p["date"]}">'
                f'<script type="application/ld+json">{{"@context":"https://schema.org","@type":"Article","headline":{json_str(p["title"])},'
                f'"datePublished":"{p["date"]}","author":{{"@type":"Person","name":"David Chung","url":"https://www.linkedin.com/in/vdchung/"}},'
                f'"image":"{SITE}{img}","mainEntityOfPage":"{SITE}{url_of(p)}"}}</script>')
        script = """<script>
(function () {
  var links = document.querySelectorAll('.toc a'); if (!links.length || !('IntersectionObserver' in window)) return;
  var map = {}; links.forEach(function (a) { map[a.getAttribute('href').slice(1)] = a; });
  var io = new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) { links.forEach(function (a) { a.classList.remove('on'); }); map[e.target.id].classList.add('on'); } }); }, { rootMargin: '-80px 0px -70% 0px' });
  Object.keys(map).forEach(function (id) { var h = document.getElementById(id); if (h) io.observe(h); });
})();
</script>"""
        write(f"articles/{p['slug']}/index.html", page(posts, url_of(p), f"{p['title']} | vCloudOne", p["summary"] or excerpt(p, 160),
                                                         main, "articles", "article", img, head, script))


def json_str(s):
    import json
    return json.dumps(s)


def build_topics(posts):
    for k, (name, blurb) in TOPICS.items():
        tp = [p for p in posts if k in p["topics"]]
        body = stream(tp) if tp else '<div class="box empty">Nothing here yet. Posts on this topic are on the way.</div>'
        top = band(f'<p class="eyebrow">Topic</p><h1>{name}</h1><p class="lede">{blurb}</p>' + topic_tabs(posts, k), "slim")
        write(f"topics/{k}/index.html", page(posts, f"/topics/{k}/", f"{name} | vCloudOne", f"{name} posts on vCloudOne. {blurb}",
                                             top + f'<main class="wrap main"><div class="col">{body}</div>{SIDEBAR}</main>', "topics"),
              sitemap=bool(tp))


def build_about(posts):
    md = read("about.md")
    top = band('<div class="me" style="margin-bottom:18px"><div class="avatar" style="width:72px;height:72px;font-size:26px">DC</div></div>'
               '<p class="eyebrow">About</p><h1>Hi, I&rsquo;m David.</h1>'
               '<p class="lede">Cloud solutions architect. I work on VMware workloads on AWS, and I write about cloud, VMware and AI.</p>', "slim")
    main = top + f'<main class="wrap main"><div class="col"><div class="page-card prose">{blocks(md)}</div></div>{SIDEBAR}</main>'
    write("about/index.html", page(posts, "/about/", "About | vCloudOne", "About David Chung and vCloudOne.", main, "about"))


def build_404(posts):
    top = band('<p class="eyebrow">404</p><h1>That page isn&rsquo;t here.</h1>'
               '<p class="lede">It may have moved when the site was reorganised. The EVS deployment guide now lives at /evs-guide/.</p>'
               '<div class="cta-row"><a class="btn" href="/">Go to the front page</a><a class="btn ghost" href="/evs-guide/">EVS deployment guide</a></div>', "slim")
    main = top + f'<main class="wrap main"><div class="col"><div class="sec-h"><h2>Latest</h2></div>{stream(posts[:6])}</div>{SIDEBAR}</main>'
    out = page(posts, "/404.html", "Page not found | vCloudOne", "This page could not be found.", main)
    write("404.html", out.replace('<link rel="canonical" href="https://vcloudone.com/404.html">', '<meta name="robots" content="noindex">'), sitemap=False)


def build_feed(posts):
    items = ""
    for p in posts[:30]:
        u = SITE + url_of(p)
        dt = datetime(p["date"].year, p["date"].month, p["date"].day, 12, tzinfo=timezone.utc)
        cats = "".join(f"<category>{esc(TOPICS[t][0])}</category>" for t in p["topics"])
        items += (f"  <item>\n    <title>{esc(p['title'])}</title>\n    <link>{esc(u)}</link>\n    <guid isPermaLink=\"true\">{esc(u)}</guid>\n"
                  f"    <pubDate>{format_datetime(dt)}</pubDate>\n    {cats}\n    <description>{esc(excerpt(p, 300))}</description>\n  </item>\n")
    last = format_datetime(datetime(posts[0]["date"].year, posts[0]["date"].month, posts[0]["date"].day, 12, tzinfo=timezone.utc))
    write("feed.xml", f"""<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
  <title>vCloudOne</title>
  <link>{SITE}/</link>
  <atom:link href="{SITE}/feed.xml" rel="self" type="application/rss+xml"/>
  <description>David Chung on cloud, VMware and AI</description>
  <language>en-us</language>
  <lastBuildDate>{last}</lastBuildDate>
  <image><url>{SITE}/vcloudone_button.png</url><title>vCloudOne</title><link>{SITE}/</link></image>
{items}</channel>
</rss>
""", sitemap=False)


def build_rss_page(posts):
    rows = "".join(urow(p) for p in posts[:10])
    top = band('<p class="eyebrow">RSS feed</p><h1>Follow along in your feed reader</h1>'
               '<p class="lede">Add the address below to Feedly, Inoreader, NetNewsWire, Outlook or any other feed reader, and new articles and updates will show up there as they&rsquo;re posted.</p>'
               '<div class="feedbox"><code>https://vcloudone.com/feed.xml</code>'
               '<button type="button" class="btn" id="copy">Copy address</button>'
               '<a class="btn ghost" href="/feed.xml">Open the raw feed</a></div>', "slim")
    script = """<script>
document.getElementById('copy').addEventListener('click', function () {
  var b = this; navigator.clipboard.writeText('https://vcloudone.com/feed.xml').then(function () { b.textContent = 'Copied'; setTimeout(function () { b.textContent = 'Copy address'; }, 1800); });
});
</script>"""
    main = top + f'<main class="wrap main"><div class="col"><div class="sec-h"><h2>Latest in the feed</h2></div><div class="stream"><div class="ulist">{rows}</div></div></div>{SIDEBAR}</main>'
    write("rss/index.html", page(posts, "/rss/", "RSS feed | vCloudOne", "Subscribe to vCloudOne articles and updates in any feed reader.", main, script=script))


def build_sitemap(posts):
    extra = ["/evs-guide/", "/evs/", "/evs-sizing/", "/vmc-sizing/", "/vcf-sizing/"]
    urls = sorted(set(WRITTEN + extra), key=lambda u: (u != "/", u))
    body = "".join(f"  <url><loc>{SITE}{u}</loc></url>\n" for u in urls)
    write("sitemap.xml", f'<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n{body}</urlset>\n', sitemap=False)
    write("robots.txt", f"User-agent: *\nAllow: /\n\nSitemap: {SITE}/sitemap.xml\n", sitemap=False)


# ── share images (needs Pillow; skipped quietly if it isn't installed) ───────
def build_og(posts):
    try:
        from PIL import Image, ImageDraw, ImageFont
    except ImportError:
        print("Pillow not installed: share images not regenerated.")
        return
    og = os.path.join(ROOT, "assets", "og")
    os.makedirs(og, exist_ok=True)
    F = lambda n, s: ImageFont.truetype(os.path.join(HERE, "og", n), s)
    logo = Image.open(os.path.join(ROOT, "vcloudone_button.png")).convert("RGBA").resize((64, 64))

    def wrap(d, text, font, width):
        words, lines, cur = text.split(), [], ""
        for w in words:
            t = (cur + " " + w).strip()
            if d.textlength(t, font=font) <= width:
                cur = t
            else:
                lines.append(cur); cur = w
        lines.append(cur)
        return lines

    def make(path, kicker, title, sub):
        stamp = hashlib.sha1(f"{kicker}|{title}|{sub}".encode()).hexdigest()[:10]
        mark = path + ".txt"
        if os.path.exists(path) and os.path.exists(mark) and open(mark).read().strip() == stamp:
            return
        with open(mark, "w") as f:
            f.write(stamp + "\n")
        im = Image.new("RGB", (1200, 630), "#111a26")
        d = ImageDraw.Draw(im)
        for x in range(0, 1200, 44):
            d.line([(x, 0), (x, 630)], fill="#18222f")
        for y in range(0, 630, 44):
            d.line([(0, y), (1200, y)], fill="#18222f")
        glow = Image.new("RGBA", (1200, 630), (0, 0, 0, 0))
        gd = ImageDraw.Draw(glow)
        for r in range(380, 0, -8):
            gd.ellipse([1050 - r, -60 - r, 1050 + r, -60 + r], fill=(255, 153, 0, int(26 * (1 - r / 380))))
        im.paste(glow, (0, 0), glow)
        d = ImageDraw.Draw(im)
        im.paste(logo, (72, 64), logo)
        d.text((152, 76), "vCloud", font=F("inter-700.ttf", 34), fill="#ffffff")
        d.text((152 + d.textlength("vCloud", font=F("inter-700.ttf", 34)), 76), "One", font=F("inter-700.ttf", 34), fill="#ff9900")
        d.text((72, 196), kicker.upper(), font=F("inter-700.ttf", 24), fill="#ff9900")
        size = 76
        while size > 44:
            tf = F("fraunces-600.ttf", size)
            lines = wrap(d, title, tf, 1040)
            if len(lines) <= 3:
                break
            size -= 6
        y = 240
        for ln in lines:
            d.text((72, y), ln, font=tf, fill="#ffffff")
            y += int(size * 1.15)
        d.text((72, 548), sub, font=F("inter-500.ttf", 26), fill="#9aa6b5")
        im.save(path, optimize=True)

    make(os.path.join(og, "default.png"), "David Chung", "Notes on cloud, VMware and AI", "vcloudone.com · articles, updates and sizing tools")
    for p in posts:
        if p["type"] == "article":
            make(os.path.join(og, p["slug"] + ".png"), " · ".join(TOPICS[t][0] for t in p["topics"]) or "Article", p["title"],
                 f"David Chung · {nice(p['date'])} · vcloudone.com")


# ── keep the shared menu and footer in sync on the hand-built pages ──────────
def sync_static(posts):
    for rel in STATIC_PAGES:
        path = os.path.join(ROOT, rel)
        if not os.path.exists(path):
            continue
        raw = open(path, encoding="utf-8", newline="").read()
        crlf = "\r\n" in raw
        s = raw.replace("\r\n", "\n")
        nav = "<!-- vc:nav -->\n" + nav_html(posts, "tools").rstrip() + "\n<!-- /vc:nav -->"
        foot = "<!-- vc:footer -->\n" + FOOTER.rstrip() + "\n<!-- /vc:footer -->"
        s = re.sub(r"<!-- vc:nav -->.*?<!-- /vc:nav -->", lambda m: nav, s, count=1, flags=re.S)
        s = re.sub(r"<!-- vc:footer -->.*?<!-- /vc:footer -->", lambda m: foot, s, count=1, flags=re.S)
        s = re.sub(r"<!-- vc:theme -->.*?<!-- /vc:theme -->", lambda m: "<!-- vc:theme -->\n" + THEMEHEAD + "\n<!-- /vc:theme -->", s, count=1, flags=re.S)
        s = re.sub(r"/assets/(site|theme-sizer|theme-guide)\.(css|js)\?v=\w+", lambda m: f"/assets/{m.group(1)}.{m.group(2)}?v={VER}", s)
        if crlf:
            s = s.replace("\n", "\r\n")
        if s != raw:
            open(path, "w", encoding="utf-8", newline="").write(s)


def main():
    posts = load()
    build_og(posts)
    build_home(posts)
    build_updates(posts)
    build_articles(posts)
    build_topics(posts)
    build_about(posts)
    build_404(posts)
    build_feed(posts)
    build_rss_page(posts)
    build_sitemap(posts)
    sync_static(posts)
    a = sum(1 for p in posts if p["type"] == "article")
    print(f"Built {len(posts)} posts ({a} articles, {len(posts) - a} updates).")


if __name__ == "__main__":
    main()
