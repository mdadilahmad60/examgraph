#!/usr/bin/env python3
"""Technical SEO audit of the built site. Exit code 1 on any failure.  python3 scripts/seo_audit.py"""
import glob, json, os, re, sys, collections
from html import unescape
from urllib.parse import urlparse
from datetime import date
os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
with open("scripts/pages.json", encoding="utf8") as source:
    D = json.load(source)["site"]["domain"].rstrip("/")
fails = []
def bad(page, msg): fails.append("%s: %s" % (page, msg))

files = sorted(glob.glob("**/index.html", recursive=True) + glob.glob("legal/*.html") + ["404.html"])
url_of = lambda f: D + "/" + ("" if f == "index.html" else f[:-10] if f.endswith("/index.html") else f)
indexable, inbound, titles, descs = {}, collections.Counter(), {}, {}
for f in files:
    s = open(f, encoding="utf8").read()
    noindex = 'name="robots" content="noindex"' in s
    if not noindex: indexable[url_of(f)] = f
    t = re.search(r"<title>(.*?)</title>", s); d = re.search(r'name="description" content="(.*?)"', s)
    if not t or not 0 < len(unescape(t.group(1))) < 60: bad(f, "title must be under 60 characters")
    if not d or not 0 < len(unescape(d.group(1))) < 160: bad(f, "description must be under 160 characters")
    meta = {k: unescape(v) for k, v in re.findall(r'<meta (?:name|property)="([^"]+)" content="([^"]*)"', s)}
    for prefix in ("og:", "twitter:"):
        for key, expected in (("title", unescape(t.group(1)) if t else ""), ("description", unescape(d.group(1)) if d else "")):
            if meta.get(prefix + key) != expected: bad(f, prefix + key + " must match page metadata")
        image = meta.get(prefix + "image", "")
        if not image.startswith(D + "/") or not os.path.isfile(urlparse(image).path.lstrip("/")):
            bad(f, prefix + "image must use the site domain and an existing image")
        if not meta.get(prefix + "image:alt"): bad(f, "missing " + prefix + "image:alt")
    if meta.get("twitter:card") != "summary_large_image": bad(f, "missing large Twitter card")
    if not noindex and meta.get("og:url") != url_of(f): bad(f, "og:url != own URL")
    if noindex: continue
    if t: titles.setdefault(t.group(1), []).append(f)
    if d: descs.setdefault(d.group(1), []).append(f)
    if len(re.findall(r"<h1[ >]", s)) != 1: bad(f, "needs exactly one h1")
    m = re.search(r'rel="canonical" href="(.*?)"', s)
    if not m or m.group(1) != url_of(f): bad(f, "canonical != own URL (%s)" % (m and m.group(1)))
    for k in ("og:title", "og:description", "og:image", "og:url", "og:locale", "twitter:card"):
        if k not in s: bad(f, "missing " + k)
    if 'name="robots" content="index,follow' not in s: bad(f, "missing robots meta")
    if 'hreflang="x-default"' not in s: bad(f, "missing hreflang")
    if re.search(r"<img(?![^>]*\balt=)", s): bad(f, "img without alt")
    lds = re.findall(r'<script type="application/ld\+json">(.*?)</script>', s, re.S)
    if not lds: bad(f, "no JSON-LD")
    for j in lds:
        try: json.loads(j.replace("<\\/", "</"))
        except Exception as e: bad(f, "invalid JSON-LD: %s" % e)
    # inbound internal links
    base = os.path.dirname(f)
    for h in re.findall(r'href="([^"#?]+)', s):
        if h.startswith(("http", "mailto", "tel", "data:", "javascript", "//")): continue
        p = os.path.normpath(os.path.join(base, h)) if not h.startswith("/") else h.lstrip("/")
        if os.path.isdir(p): p += "/index.html"
        inbound[os.path.normpath(p)] += 1
        if not os.path.exists(p): bad(f, "broken link " + h)
for k, v in list(titles.items()) + list(descs.items()):
    if len(v) > 1: bad(",".join(v[:3]), "duplicate title/description")
# sitemap <-> indexable
sm = open("sitemap.xml").read()
locs = re.findall(r"<loc>(.*?)</loc>", sm)
for u in locs:
    if u not in indexable: bad("sitemap.xml", "URL not an indexable page: " + u)
for u in indexable:
    if u not in locs and not u.endswith("/404.html"): bad("sitemap.xml", "missing " + u)
for d in re.findall(r"<lastmod>(.*?)</lastmod>", sm): date.fromisoformat(d)
if len(set(re.findall(r"<lastmod>(.*?)</lastmod>", sm))) < 1: bad("sitemap.xml", "no lastmod")
# orphans / thin internal linking
for u, f in indexable.items():
    if f != "index.html" and inbound[os.path.normpath(f)] < 3: bad(f, "only %d inbound internal links" % inbound[os.path.normpath(f)])
# redirects target exist
for t in re.findall(r'to = "(/[^"]+/)"', open("netlify.toml").read()):
    if t != "/404.html" and not os.path.exists(t.lstrip("/") + "index.html"): bad("netlify.toml", "redirect target missing " + t)
for f in ("robots.txt", "llms.txt", "manifest.webmanifest"):
    if not os.path.exists(f): bad(f, "missing")
print("%d pages audited, %d indexable, %d sitemap URLs" % (len(files), len(indexable), len(locs)))
print("\n".join(fails) if fails else "SEO audit: all checks passed")
sys.exit(1 if fails else 0)
