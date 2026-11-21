# Content plan: fix thin, duplicated tool pages

Check progress with `python3 scripts/seo_check.py` (after `python3 scripts/build.py`). Enforced per phase: unique text >= 45%, title <= 60 chars, description 120-155 chars.

0. **Status (Nov 2026, Part 10):** technical SEO layer done and enforced by `scripts/seo_audit.py` (see AGENTS.md). The functions/trig/stats pages now measure ~90% unique text (the phase notes below are historical).
0b. **Earlier status:** all 69 tool pages pass the 45% unique-text check (lowest ~49% before Part 9, exam pages now 58-68%). Part 9 added solved examples and official sources to the 12 exam-prep pages. Done for data, calculus (not 3D) and compare pages too. Next: functions, trigonometry, statistics and guides pages.
1. **Done: shared SEO groundwork**
   - Default share image `assets/img/og-default.png` (1200x630); `head()` in build.py emits og:image (+ width/height/alt), `twitter:card=summary_large_image` and twitter:image on every page.
   - `scripts/seo_check.py` (per-page title/desc length, og:image, unique-text % from 6-word shingles; `--phase N`, `--all`).
   - `scripts/test-parser.js` now also compiles every page's `examples[].e`.
2. **Next: Phase 1 content (functions + trigonometry, 30 pages)**: still at 4.5-7.4% unique. For each page in pages.json add `intro` (2 paragraphs, 120-180 words), 3 `examples` {e,l}, 4-5 `faq`, 3-4 `points`; fix `title` (<= 60 incl. " | ExamGrapher"; currently too long: quadratic, inverse-function, standard-form, conic-sections) and `desc` (120-155; all 30 are currently too short).
3. Phase 2: calculus, exam-prep, data, compare, statistics pages, same method (`seo_check.py --phase 2`).
4. Phase 3: 301 consolidation (trigonometric-function-grapher -> trig-graphing-calculator, logarithm-grapher -> logarithmic-graphing-calculator); distinct sine/cosine pages; conic-sections-grapher as hub.
5. Phase 4: 3-5 contextual related-tool links inside each page's text.
