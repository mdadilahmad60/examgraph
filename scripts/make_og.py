#!/usr/bin/env python3
"""
Generates one 1200x630 share image per category into assets/img/og-<hub>.png (needs Playwright + Chromium).
    python3 scripts/make_og.py
build.py picks the image by category (OG_BY_CATEGORY). Re-run after changing titles or colors here.
"""
import os
from playwright.sync_api import sync_playwright

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
# slug, panel color, title, tagline, curves (JS expressions in math coords), kind
CATS = [
    ("default", "#0a6c66", "Free online graphing calculator", "Plot, explore and practice math", "algebra"),
    ("exam-prep", "#0a6c66", "US Exam Prep", "SAT, ACT, AP and state test practice", "lines"),
    ("functions", "#1d5f8a", "Algebra & Functions", "Lines, quadratics, exponentials and systems", "algebra"),
    ("trigonometry", "#7c3aed", "Trig & Conics", "Sine, cosine, unit circle and conic sections", "trig"),
    ("calculus", "#b4231f", "Calculus & 3D", "Derivatives, integrals, polar and parametric", "calculus"),
    ("data", "#b45309", "Data & Regression", "Line of best fit, regression and finance", "data"),
    ("statistics", "#0e7490", "Statistics", "Z-scores, t-tests, normal curves and more", "stats"),
    ("guides", "#475569", "Guides & Comparisons", "TI-84, Desmos and Chromebook options", "guides"),
]

HTML = """<!doctype html><html><head><meta charset="utf-8"><style>
*{box-sizing:border-box;margin:0}body{width:1200px;height:630px;font-family:'DejaVu Sans','Helvetica Neue',Arial,sans-serif;background:#f6f8fd;position:relative;overflow:hidden}
.l{position:absolute;left:0;top:0;width:600px;height:630px;background:%(c)s;color:#fff;padding:70px}
.logo{width:96px;height:96px;border-radius:26px;background:#fff;display:flex;align-items:center;justify-content:center}
.b{font-size:56px;font-weight:700;margin-top:34px;letter-spacing:-1px}
.t{font-size:44px;font-weight:700;margin-top:26px;line-height:1.15}
.s{font-size:28px;margin-top:16px;opacity:.88;line-height:1.3}
.u{position:absolute;left:70px;bottom:56px;font-size:30px;font-weight:700}
canvas{position:absolute;left:600px;top:0}
</style></head><body><div class="l"><div class="logo"><svg width="64" height="64" viewBox="0 0 32 32"><path d="M8 7C11 31 21 31 24 7" fill="none" stroke="%(c)s" stroke-width="3" stroke-linecap="round"/><circle cx="16" cy="25" r="3.6" fill="#ffc53d"/></svg></div>
<div class="b">ExamGrapher</div><div class="t">%(t)s</div><div class="s">%(s)s</div><div class="u">examgraph.netlify.app</div></div>
<canvas id="c" width="600" height="630"></canvas>
<script>
var kind="%(k)s",col="%(c)s",W=600,H=630,ctx=document.getElementById('c').getContext('2d');
var sc=60,ox=300,oy=315;
function X(x){return ox+x*sc}function Y(y){return oy-y*sc}
ctx.strokeStyle='#dfe5f2';ctx.lineWidth=1;
for(var i=-6;i<=6;i++){ctx.beginPath();ctx.moveTo(X(i),0);ctx.lineTo(X(i),H);ctx.stroke();}
for(var j=-6;j<=6;j++){ctx.beginPath();ctx.moveTo(0,Y(j));ctx.lineTo(W,Y(j));ctx.stroke();}
ctx.strokeStyle='#8e9bb8';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(X(0),40);ctx.lineTo(X(0),H-40);ctx.moveTo(0,Y(0));ctx.lineTo(W,Y(0));ctx.stroke();
function plot(f,color,w){ctx.strokeStyle=color;ctx.lineWidth=w||7;ctx.lineCap='round';ctx.lineJoin='round';ctx.beginPath();var p=false;
 for(var x=-5;x<=5;x+=0.02){var y=f(x);if(!isFinite(y)||Math.abs(y)>6){p=false;continue}if(p)ctx.lineTo(X(x),Y(y));else ctx.moveTo(X(x),Y(y));p=true}ctx.stroke()}
function dot(x,y,color){ctx.beginPath();ctx.arc(X(x),Y(y),13,0,7);ctx.fillStyle='#fff';ctx.fill();ctx.lineWidth=6;ctx.strokeStyle=color;ctx.stroke()}
var O='#e8603c';
if(kind=='lines'){plot(function(x){return 0.45*x*x-2.2},col);plot(function(x){return 0.9*x+0.3},O);dot(-1.6,-1.05,col);dot(2.9,2.9,col)}
if(kind=='algebra'){plot(function(x){return 0.5*x*x-3},col);plot(function(x){return 0.18*x*x*x-0.6*x},O)}
if(kind=='trig'){plot(function(x){return 2.2*Math.sin(x*1.1)},col);plot(function(x){return 2.2*Math.cos(x*1.1)},O)}
if(kind=='calculus'){plot(function(x){return 0.2*x*x*x-0.9*x},col);plot(function(x){return 0.6*x*x-0.9},O);dot(-1.22,0,O);dot(1.22,0,O)}
if(kind=='data'){var P=[[-4,-2.6],[-3,-1.2],[-2.2,-1.9],[-1,-0.3],[0,0.4],[1,0.9],[2,2.3],[3,1.8],[4,3.4]];plot(function(x){return 0.75*x+0.35},O,6);
 P.forEach(function(p){ctx.beginPath();ctx.arc(X(p[0]),Y(p[1]),11,0,7);ctx.fillStyle=col;ctx.fill();ctx.lineWidth=4;ctx.strokeStyle='#fff';ctx.stroke()})}
if(kind=='stats'){plot(function(x){return 4.2*Math.exp(-0.5*x*x/1.1)-2.5},col);plot(function(x){return 2.2*Math.exp(-0.5*(x-1.5)*(x-1.5)/2.4)-2.5},O)}
if(kind=='guides'){plot(function(x){return Math.abs(x)*0.9-2.5},col);plot(function(x){return 0.4*x*x-3},O);dot(-2.45,-0.3,col);dot(2.45,-0.3,col)}
</script></body></html>"""

def main():
    out = os.path.join(ROOT, "assets", "img")
    with sync_playwright() as p:
        b = p.chromium.launch()
        pg = b.new_page(viewport={"width": 1200, "height": 630}, device_scale_factor=1)
        for slug, color, title, tag, kind in CATS:
            pg.set_content(HTML % {"c": color, "t": title.replace("&", "&amp;"), "s": tag, "k": kind})
            pg.screenshot(path=os.path.join(out, "og-%s.png" % slug), clip={"x": 0, "y": 0, "width": 1200, "height": 630})
            print("wrote og-%s.png" % slug)
        b.close()

if __name__ == "__main__":
    main()
