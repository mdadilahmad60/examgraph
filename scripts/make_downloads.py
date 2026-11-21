#!/usr/bin/env python3
"""Builds downloads/examgrapher-calculator-cheat-sheet.xlsx and .pdf from pages.json > cheatsheet.   python3 scripts/make_downloads.py"""
import json, os
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib import colors
from reportlab.lib.units import inch
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
CS = json.load(open(os.path.join(ROOT, "scripts", "pages.json"), encoding="utf8"))["cheatsheet"]
OUT = os.path.join(ROOT, "downloads"); os.makedirs(OUT, exist_ok=True)
BLUE = "2457D6"
FORMULAS = [
    ("Slope of a line", "m = (y2 - y1) / (x2 - x1)"),
    ("Slope-intercept form", "y = mx + b   (b is the y-intercept)"),
    ("Quadratic vertex", "x = -b / (2a), then substitute to find y"),
    ("Quadratic formula", "x = (-b ± sqrt(b^2 - 4ac)) / (2a)"),
    ("Discriminant", "b^2 - 4ac:  > 0 two real roots, = 0 one root, < 0 none"),
    ("Vertex form", "y = a(x - h)^2 + k, vertex (h, k)"),
    ("Circle", "(x - h)^2 + (y - k)^2 = r^2"),
    ("Distance", "d = sqrt((x2 - x1)^2 + (y2 - y1)^2)"),
    ("Midpoint", "((x1 + x2)/2, (y1 + y2)/2)"),
    ("Exponential growth", "y = a(1 + r)^t   (decay: y = a(1 - r)^t)"),
    ("Compound interest", "A = P(1 + r/n)^(nt)"),
    ("Mean and z-score", "z = (x - mean) / standard deviation"),
]

# ---------------- Excel
wb = Workbook(); ws = wb.active; ws.title = "Cheat Sheet"
F = lambda **k: Font(name="Arial", **k)
thin = Side(style="thin", color="D0D7E2"); box = Border(left=thin, right=thin, top=thin, bottom=thin)
ws["A1"] = CS["h1"] + " - ExamGrapher"; ws["A1"].font = F(size=16, bold=True, color=BLUE)
ws["A2"] = "Free at examgraphr.netlify.app. Check your test's current calculator rules before exam day."; ws["A2"].font = F(size=10, italic=True, color="555555")
r = 4
for c, h in enumerate(["Topic", "Tip"], 1):
    x = ws.cell(r, c, h); x.font = F(bold=True, color="FFFFFF"); x.fill = PatternFill("solid", fgColor=BLUE); x.alignment = Alignment(vertical="center"); x.border = box
for sec in CS["sections"]:
    for i, tip in enumerate(sec["items"]):
        r += 1
        a = ws.cell(r, 1, sec["h"] if i == 0 else ""); b = ws.cell(r, 2, tip)
        a.font = F(bold=True); b.font = F()
        for x in (a, b): x.alignment = Alignment(wrap_text=True, vertical="top"); x.border = box
ws.column_dimensions["A"].width = 24; ws.column_dimensions["B"].width = 100
ws.freeze_panes = "A5"
ws.page_setup.orientation = "landscape"; ws.page_setup.fitToWidth = 1; ws.page_setup.fitToHeight = 0; ws.sheet_properties.pageSetUpPr.fitToPage = True
w2 = wb.create_sheet("Key formulas")
w2["A1"] = "Key formulas"; w2["A1"].font = F(size=16, bold=True, color=BLUE)
for c, h in enumerate(["Name", "Formula"], 1):
    x = w2.cell(3, c, h); x.font = F(bold=True, color="FFFFFF"); x.fill = PatternFill("solid", fgColor=BLUE); x.border = box
for i, (n, f) in enumerate(FORMULAS, 4):
    a = w2.cell(i, 1, n); b = w2.cell(i, 2, f); a.font = F(bold=True); b.font = F()
    for x in (a, b): x.border = box; x.alignment = Alignment(wrap_text=True, vertical="top")
w2.column_dimensions["A"].width = 26; w2.column_dimensions["B"].width = 70
wb.save(os.path.join(OUT, "examgrapher-calculator-cheat-sheet.xlsx"))

# ---------------- PDF
font, bold = "Helvetica", "Helvetica-Bold"
for reg, bd in (("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"),):
    if os.path.exists(reg) and os.path.exists(bd):
        pdfmetrics.registerFont(TTFont("DV", reg)); pdfmetrics.registerFont(TTFont("DVB", bd)); font, bold = "DV", "DVB"
sub = lambda t: t if font == "DV" else t.replace("\u2264", "<=").replace("\u2265", ">=").replace("\u00b1", "+/-")
H1 = ParagraphStyle("h1", fontName=bold, fontSize=20, leading=24, textColor=colors.HexColor("#" + BLUE), spaceAfter=4)
H2 = ParagraphStyle("h2", fontName=bold, fontSize=12.5, leading=16, spaceBefore=10, spaceAfter=3, textColor=colors.HexColor("#1b2a41"))
BD = ParagraphStyle("b", fontName=font, fontSize=9.6, leading=13.2, leftIndent=12, bulletIndent=2, spaceAfter=2)
NT = ParagraphStyle("n", fontName=font, fontSize=8.6, leading=11, textColor=colors.HexColor("#555555"))
story = [Paragraph(sub(CS["h1"]) + " - ExamGrapher", H1), Paragraph("Free at examgraphr.netlify.app. Check your test's current calculator rules before exam day.", NT)]
esc = lambda t: sub(t).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
for sec in CS["sections"]:
    story.append(Paragraph(esc(sec["h"]), H2))
    for i in sec["items"]: story.append(Paragraph(esc(i), BD, bulletText="\u2022" if font == "DV" else "-"))
story.append(Paragraph("Key formulas", H2))
for n, f in FORMULAS: story.append(Paragraph("<b>%s:</b> %s" % (esc(n), esc(f)), BD, bulletText="\u2022" if font == "DV" else "-"))
SimpleDocTemplate(os.path.join(OUT, "examgrapher-calculator-cheat-sheet.pdf"), pagesize=letter, leftMargin=0.8*inch, rightMargin=0.8*inch,
                  topMargin=0.7*inch, bottomMargin=0.7*inch, title="ExamGrapher Calculator Cheat Sheet", author="ExamGrapher").build(story)
print("downloads written:", sorted(os.listdir(OUT)))
