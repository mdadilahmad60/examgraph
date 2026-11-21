#!/usr/bin/env python3
"""
SEO check for the generated tool pages (run after scripts/build.py).

    python3 scripts/seo_check.py              # report all pages, enforce limits on the current phase
    python3 scripts/seo_check.py --phase 2    # enforce limits on another phase's pages
    python3 scripts/seo_check.py --all        # enforce limits on every page
    python3 scripts/seo_check.py --all --meta # same, but only title / description / og:image count as failures (not unique text)

Also checks title (< 60) and description (120-155) on the home page, category hubs, legal pages and the cheat sheet.

Per page it prints: title length, description length, whether og:image is set (and the file exists),
and "unique %": the share of 6-word shingles in the page's content sections (link text excluded)
that appear on no other tool page.

Exits non-zero if any enforced page has unique text under 45%, a title of 60 or more characters,
or a description outside 120-155 characters.
"""
import html
import json
import os
import re
import sys
from html.parser import HTMLParser

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
DATA = json.load(open(os.path.join(ROOT, "scripts", "pages.json"), encoding="utf8"))

PHASES = {
    1: ("functions/", "trigonometry/"),
    2: ("calculus/", "exam-prep/", "data/", "compare/", "statistics/"),
}
CURRENT_PHASE = 1
MIN_UNIQUE, MAX_TITLE, DESC_RANGE = 45.0, 59, (120, 155)
SHINGLE = 6
SKIP_HEADINGS = ("More graphing tools",)   # the related-links grid is navigation, not content


class Content(HTMLParser):
    """Collects text inside <div class="page"> <section class="doc"> blocks, skipping <a>, forms and the related grid."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.sections, self.cur = [], None
        self.depth = 0          # section nesting depth while inside a doc section
        self.skip = 0           # inside <a>, <form>, <script>, <style>
        self.meta = {}
        self.title = ""
        self._in_title = False

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == "meta":
            k = a.get("property") or a.get("name")
            if k:
                self.meta[k] = a.get("content", "")
        if tag == "title":
            self._in_title = True
        if tag == "section":
            if self.cur is None and "doc" in (a.get("class") or "").split():
                self.cur, self.depth = [], 1
                return
            if self.cur is not None:
                self.depth += 1
        if self.cur is not None and tag in ("a", "form", "script", "style"):
            self.skip += 1

    def handle_endtag(self, tag):
        if tag == "title":
            self._in_title = False
        if self.cur is None:
            return
        if tag in ("a", "form", "script", "style") and self.skip:
            self.skip -= 1
        if tag == "section":
            self.depth -= 1
            if self.depth == 0:
                text = " ".join(self.cur)
                if not any(text.strip().startswith(h) for h in SKIP_HEADINGS):
                    self.sections.append(text)
                self.cur = None

    def handle_data(self, data):
        if self._in_title:
            self.title += data
        if self.cur is not None and not self.skip:
            self.cur.append(data)


def words(text):
    return re.findall(r"[a-z0-9]+(?:'[a-z]+)?", html.unescape(text).lower())


def shingles(ws):
    return {" ".join(ws[i:i + SHINGLE]) for i in range(len(ws) - SHINGLE + 1)}


def analyse(path):
    f = os.path.join(ROOT, path, "index.html")
    c = Content()
    c.feed(open(f, encoding="utf8").read())
    og = c.meta.get("og:image", "")
    og_ok = bool(og) and os.path.isfile(os.path.join(ROOT, re.sub(r"^https?://[^/]+/", "", og)))
    ws = words(" ".join(c.sections))
    return {"path": path, "title": c.title, "desc": c.meta.get("description", ""), "og": og_ok,
            "words": len(ws), "sh": shingles(ws)}


def other_pages_check():
    """Home, category hubs, legal pages and the cheat sheet: title < 60, description 120-155, og:image present."""
    files = ["index.html"] + [os.path.join(h, "index.html") for h in ("exam-prep", "functions", "trigonometry", "calculus", "data", "statistics", "guides", "cheat-sheet")] + \
            [os.path.join("legal", l["slug"] + ".html") for l in DATA["legal"]]
    bad = 0
    print("\nOther pages")
    for f in files:
        path = os.path.join(ROOT, f)
        if not os.path.isfile(path):
            continue
        c = Content()
        c.feed(open(path, encoding="utf8").read())
        tl, dl = len(c.title), len(c.meta.get("description", ""))
        probs = []
        if tl > MAX_TITLE:
            probs.append("title>%d" % MAX_TITLE)
        if not DESC_RANGE[0] <= dl <= DESC_RANGE[1]:
            probs.append("desc not %d-%d" % DESC_RANGE)
        if not c.meta.get("og:image"):
            probs.append("no og:image")
        bad += 1 if probs else 0
        print("%-40s %5d %5d  %s" % (f, tl, dl, "FAIL: " + ", ".join(probs) if probs else "ok"))
    return bad


def main(argv):
    enforce = None
    if "--all" in argv:
        enforce = tuple(p["path"] for p in DATA["pages"])
    else:
        n = int(argv[argv.index("--phase") + 1]) if "--phase" in argv else CURRENT_PHASE
        enforce = PHASES[n]

    rows = [analyse(p["path"]) for p in DATA["pages"]]
    count = {}
    for r in rows:
        for s in r["sh"]:
            count[s] = count.get(s, 0) + 1

    fails = []
    print("%-58s %5s %5s %3s %6s %7s" % ("page", "title", "desc", "og", "words", "unique"))
    for r in rows:
        uniq = 100.0 * sum(1 for s in r["sh"] if count[s] == 1) / len(r["sh"]) if r["sh"] else 0.0
        tl, dl = len(r["title"]), len(r["desc"])
        checked = r["path"].startswith(enforce)
        problems = []
        if checked:
            if uniq < MIN_UNIQUE:
                problems.append("unique<%d%%" % MIN_UNIQUE)
            if tl > MAX_TITLE:
                problems.append("title>%d" % MAX_TITLE)
            if not DESC_RANGE[0] <= dl <= DESC_RANGE[1]:
                problems.append("desc not %d-%d" % DESC_RANGE)
            if not r["og"]:
                problems.append("no og:image")
        if problems:
            fails.append(r["path"])
        print("%-58s %5d %5d %3s %6d %6.1f%% %s%s" % (r["path"], tl, dl, "yes" if r["og"] else "NO", r["words"], uniq,
                                                       "*" if checked else " ", "  FAIL: " + ", ".join(problems) if problems else ""))
    print("\n* = enforced in this run. %d enforced page(s) failing." % len(fails))
    meta_fails = other_pages_check()
    print("Title/description/og:image failures: %d on tool pages, %d on other pages." % (
        sum(1 for r in rows if r["path"].startswith(enforce) and (len(r["title"]) > MAX_TITLE or not DESC_RANGE[0] <= len(r["desc"]) <= DESC_RANGE[1] or not r["og"])), meta_fails))
    if "--meta" in argv:
        fails = [r["path"] for r in rows if r["path"].startswith(enforce) and (len(r["title"]) > MAX_TITLE or not DESC_RANGE[0] <= len(r["desc"]) <= DESC_RANGE[1] or not r["og"])]
        fails += ["other"] * meta_fails
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
