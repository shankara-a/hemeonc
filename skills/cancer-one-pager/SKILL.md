---
name: "cancer-one-pager"
description: "Build a compact landscape PDF reference card for a cancer type from the Stanford Oncology Handbook — workup, staging, treatment pathway diagram, regimen dosing, biomarkers, surveillance, key trials — then publishes it to the Heme/Onc Hub site with its trials. Use when asked for a one-pager, cheat sheet, or reference card for a disease."
---

# Cancer one-pager

Produces a dense **letter landscape** PDF reference card from a handbook chapter — one page by
default, two when the chapter warrants it. Output goes to `Encyclopedia/One Pagers/<Disease>.pdf` and is
then **published to https://shankara-a.github.io/hemeonc/** (Reviews tab) together with every trial it cites.

Helper code lives in **`Encyclopedia/One Pagers/_assets/`**:
`template.py` (renderer), `fitcheck.py` (page/column height checker), and `specs/` (one spec file
per disease — read `specs/pancreatic.py` or `specs/breast.py` first for a working example).

Requires `pip install weasyprint pypdf --break-system-packages`.

## Order of operations

**Research first, format second.** Do not read `template.py` until the chapter content is in hand.

1. **Extract the chapter** from `Encyclopedia/Resources/Stanford Oncology Handbook 2025.pdf`
   into a scratch path — never into the user's folder:
   ```bash
   pdftotext -layout ".../Stanford Oncology Handbook 2025.pdf" /tmp/hb.txt
   grep -n "DISEASE NAME" /tmp/hb.txt          # find chapter start/end lines
   ```
   For long chapters, delegate to a subagent and ask for a structured digest with exactly these
   headings: EPI, WORKUP, STAGING, PATHWAY (as chains of boxes with ≤50-char lines), REGIMENS
   (verbatim dosing), BIOMARKERS, SURVEILLANCE, PEARLS, TRIALS.
2. **Write a spec file** into `_assets/specs/<disease>.py` (schema below) and render. Always save
   the spec — later edits become a one-line change instead of a rewrite.
3. **Verify** with `fitcheck.py` *and* by rendering a PNG and looking at it. Always do both —
   fitcheck catches overflow, only the image catches broken markup.
4. **Publish to the Hub** (see "Publish" below) — file every trial the page cites, then run the sync.

Some diseases are not in the handbook at all (MPN, leukemias, myeloma). Say so plainly, source
from WHO/NCCN/landmark trials instead, and make the source line reflect that.

## Spec schema

```python
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from template import render
OUT = os.path.join(os.path.dirname(__file__), '..', '..', 'Disease.pdf')

spec = {
  "title": "...",
  "subtitle": "epidemiology + the organizing idea, one or two lines of HTML",
  "source": "Stanford Oncology Handbook 2025, <chapter> (<authors>) · NCCN · items marked † are outside the handbook chapter",
  "css_extra": "body{font-size:6.7pt}...",          # optional density override
  "columns": [ {"width":"29%","blocks":[...]}, ... ] # single page
  # OR, for multi-page:
  "pages": [
     {"columns": [...]},
     {"subtitle": "Page 2 — ...", "columns": [...]},
  ],
}
render(spec, os.path.normpath(OUT))
```

Block types:

```python
{"type":"bullets", "heading":"Workup", "items":["...", "..."]}

{"type":"table", "heading":"Regimens & dosing",
 "headers":["Regimen","Dosing","Cycle"],       # optional
 "widths":["27%","","15%"],                    # optional, parallel to headers
 "rows":[["FOLFIRINOX","oxaliplatin 85 · ...","q14d"], ...],
 "footnote":"All doses mg/m² unless stated.",  # optional
 "bold_first": True}                           # default True

{"type":"note", "html":"<b>Caveat.</b> ..."}    # gray callout, no heading

{"type":"pathway", "heading":"Treatment pathway", "ncols":1, "chains":[
   {"header":"Resectable or borderline", "color":"teal", "boxes":[
      ("Neoadjuvant chemotherapy", ["FOLFIRINOX strongly preferred", "..."]),
   ]},
]}

{"type":"html", "heading":"...", "html":"..."}
```

Define blocks as module-level constants and assemble them into `pages` at the bottom — that makes
rebalancing across pages a one-line move instead of string surgery. (See `specs/breast.py`.)

Pathway colors: `teal`, `blue`, `purple`, `coral`, `amber`, `gray`. Use them to encode
**disease state** (teal = curative intent, purple = palliative, coral = resistant/refractory),
not sequence.

## Layout conventions

- **Three columns per page.** Col 1 = workup, staging, key trials. Col 2 = pathway diagram + a note
  box for caveats. Col 3 = regimen dosing, biomarker→therapy, surveillance, pearls. Widths flex.
- **Two pages:** page 1 = diagnosis through curative-intent treatment; page 2 = reference (dosing,
  endocrine/supportive therapy, metastatic sequencing, pearls). Give page 2 its own subtitle.
- **Mark additions with `†`** and explain the convention in the source line. Never blur
  handbook-sourced and added material. If the handbook defers to NCCN for a number the user needs
  (e.g. Oncotype DX cutoffs), supply it, mark it `†`, and say the handbook doesn't state it.
- **Verbatim dosing.** The dosing table is the main reason the page is useful at the bedside.
- **Capture the caveats.** "Never compared head-to-head", "no RCT support", trial-design critiques,
  local-recurrence signals — the highest-value content. Put them in the note box.

## Fitting — the hard constraint

Usable height is ~743px at 90 dpi; the header eats ~55–65px. **Every column must be ≤ ~610px on
its page.** WeasyPrint will not fragment a column mid-flow, so one overflowing column pushes the
whole layout to the next page — and a header stranded alone on page 1 is the classic symptom.

```bash
python3 "<...>/_assets/fitcheck.py" "/path/Disease.pdf" [expected_pages]
```

Budget: table row ≈ 13px · bullet ≈ 11px (22 if it wraps) · section heading ≈ 16px ·
pathway box ≈ 55px.

**Cut in this order:** merge adjacent pathway boxes (~55px each) → move a block to a lighter column
→ shorten the note → drop trial rows → trim pearls. Cap the pathway at **~8 boxes across 2–4
chains** per page.

Two escape valves when the content genuinely won't fit: **`css_extra`** for a modest density bump
(`body{font-size:6.7pt} table.d{font-size:6.25pt} .sec{margin-bottom:4.5pt}`), or **go to two
pages**. Prefer two pages over shrinking type below ~6.5pt. Ask the user which they'd rather have.

## Publish — the last step, every time

Hub repo: `/Users/shankaraanand/Library/CloudStorage/GoogleDrive-shankara.k.anand@gmail.com/My Drive/Personal/projects/hemeonc/`
(`HUB` below). Site: https://shankara-a.github.io/hemeonc/. The Notion "Clinical Trials" page is retired —
trials live in `HUB/data/trials.json`.

1. **Register the disease** if it's new. Check `HUB/data/diseases.json` for a slug; if absent, add one
   with the PDF filename so the sync links them:
   ```bash
   python3 "$HUB/scripts/add_trial.py" /tmp/trials.json --new-disease \
     '{"slug":"gastric","name":"Gastric adenocarcinoma","short":"Gastric","group":"solid","onepager":"Gastric Cancer.pdf"}'
   ```
   (`group`: `solid` · `malignant-heme` · `benign-heme`.)
2. **File every trial the page names** — tables, pathway boxes, notes, footnotes, `†` items. Grep
   `HUB/data/trials.json` for each; write the missing ones as a JSON list to `/tmp/trials.json` using the
   schema in the `add-trial` skill (`source: "onepager:<slug>"`, `verified: false` unless you confirmed the
   numbers against the paper; `reference` as `Author AB et al. Journal YYYY;vol:page` so the PMID resolves),
   then `python3 "$HUB/scripts/add_trial.py" /tmp/trials.json` (no `--push` yet — the sync pushes).
   Trials already filed under another disease (e.g. KEYNOTE-158) don't need a duplicate.
3. **Sync + push:**
   ```bash
   python3 "$HUB/scripts/sync_onepagers.py"
   ```
   Copies the PDF into `HUB/pdfs/`, rebuilds `data/onepagers.json`, prints a coverage report
   ("tokens with no trial entry" = names it saw in the PDF that have no `trials.json` entry — add the real
   trials among them and rerun), then commits and pushes. Pages redeploys in ~1 minute.
4. Report the link: `https://shankara-a.github.io/hemeonc/#reviews/<slug>`.

**If the sync fails with `Operation not permitted`** on the Stanford Drive path, this session can't read
that mount: run the same command in the user's terminal tab (`run_in_terminal`), or pass
`--src` pointing at a readable copy of the `One Pagers` folder.

## Gotchas

- **SVG `<text>` does not support `<b>`/`<i>`.** `template.py` converts them via `_svgtext()`;
  don't hand-build pathway SVG and bypass it. Symptom: boxes vanish and raw text leaks below.
- Use HTML entities (`&ge;` `&mdash;` `&times;` `&sup2;` `&plusmn;` `&minus;`) rather than raw
  Unicode, and escape `&` as `&amp;` (e.g. `H&amp;P`).
- Long f-strings with escaped quotes break on Python <3.12 — use `%` formatting in the renderer.
- Work in `/tmp`; the sandbox can reset between turns, which is why specs live in `_assets/specs/`.
- When patching a spec with string surgery, re-check syntax (`python3 -c "compile(...)"`) before
  rendering. If a patch gets fiddly, rewrite the spec file instead — it's faster than debugging.
- Some files in the user's Drive are cloud-only placeholders and fail with EPERM. Don't retry —
  tell the user to "Make available offline" in Finder.

## Done so far

Breast (2 pages), Colon, Rectal, Pancreatic, NSCLC, Prostate, Testicular, MPN (PV/ET/PMF), Melanoma (2 pages),
NET (2 pages). All ten are on the Hub with their trials filed.
Keep the same visual grammar for new ones so the set reads as a series.

