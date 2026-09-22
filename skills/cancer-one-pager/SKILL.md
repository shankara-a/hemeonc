---
name: "cancer-one-pager"
description: "Build a compact landscape PDF reference card for a cancer type from the Stanford Oncology Handbook — workup, staging, treatment pathway diagram, regimen dosing, biomarkers, surveillance, key trials — then publish it to the heme/onc Hub. Use when asked for a one-pager, cheat sheet, or reference card for a disease."
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
from WHO/NCCN/landmark trials instead, and make the source line reflect that. For those, the
user's own Notion review notes and Anki deck are often the better starting point — check them
first and build the page around what is already there, filling the gaps rather than duplicating.

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
  A reference-heavy second page can use **two wide columns** instead of three — it reads better
  than three sparse ones.
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
(`HUB` below). Site: https://shankara-a.github.io/hemeonc/. The Notion "Clinical Trials" page is
retired — trials live in `HUB/data/trials.json`.

**The Hub is on a different Drive account from the Encyclopedia**, so a Cowork session that only has
the Encyclopedia folder connected cannot see it. Request it once with `request_cowork_directory`
before starting step 1.

Publishing is **one command**. `scripts/publish.py` does the whole dance in the right order — PDFs
into `pdfs/`, disease registered, trials filed, manifest rebuilt, validated, committed, pushed — and
refuses to commit anything if a check fails. Do not call `sync_onepagers.py`, `add_trial.py` or `git`
by hand; the ordering constraints that used to live in this section are now enforced by the script.

1. **Write the trials the page names** — every one, from tables, pathway boxes, notes, footnotes and
   `†` items. Grep `HUB/data/trials.json` first; a trial already filed under another disease (e.g.
   KEYNOTE-158) does not need a duplicate. Write the missing ones as a JSON list to `/tmp/trials.json`
   using the schema in the `add-trial` skill (`source: "onepager:<slug>"`, `verified: true`,
   `reference` as `Author AB et al. Journal YYYY;vol:page` so the PMID resolves).

   **Check every number against the primary abstract** (PubMed MCP `get_article_metadata`, or
   `lookup_article_by_citation` to confirm the citation round-trips) before filing. The site shows no
   "unverified" flag, so what goes in is presented as checked — and `publish.py` will reject any trial
   whose `verified` is not `true`. Verification routinely turns up errors in what you *thought* you
   knew: a trial's phase, its primary endpoint, its publication year, or numbers misattributed from a
   neighbouring trial. File what the abstract says; if a famous figure isn't in the primary source,
   leave it out. **Correct the one-pager too** when verification contradicts it — the PDF and the trial
   card must not disagree.

2. **Publish:**
   ```bash
   cd "$HUB"
   python3 scripts/publish.py --trials /tmp/trials.json --new-disease \
     '{"slug":"gastric","name":"Gastric adenocarcinoma","short":"Gastric","group":"solid"}'
   ```
   Drop `--new-disease` when the slug already exists (`group`: `solid` · `malignant-heme` ·
   `benign-heme`). Omit `--trials` when you only changed a PDF. Add `--message "..."` for the commit
   subject. Use `--check` for a dry run that writes nothing.

   Do **not** put `"onepager"` in `--new-disease` — the sync sets it from the filename. A slug that
   already exists with `onepager: null` is not "already done", but the sync fixes that too.

3. **Read the coverage report** the sync prints. "tokens with no trial entry" are ALL-CAPS strings it
   found in the PDF with no `trials.json` entry. Most are false positives — section headings
   (TREATMENT, DOSING) and gene names (ZRSR2, STAG2, MECOM). Scan for the occasional real trial
   (e.g. CPX-351, CARMENA), file it, and re-run.

4. Report the link: `https://shankara-a.github.io/hemeonc/#reviews/<slug>`.

### What publish.py handles so you don't have to

- **Ordering.** PDF into `pdfs/` before the disease references it, disease before its trials, manifest
  after both. The old `onepager file missing` failure — which used to write the disease and *then*
  fail on the trials, leaving a half-added slug — can no longer happen.
- **Source path.** It finds the Encyclopedia "One Pagers" folder whether it's running on the Mac or in
  a sandbox. No more `--src "/sessions/<id>/mnt/..."`.
- **Git identity.** Set locally in the repo; if it's ever missing the script borrows it from the last
  commit. No more `-c user.name=...`.
- **Stale `.git/*.lock` files.** Drive mounts allow `rename()` but refuse `unlink()`, so an aborted git
  command leaves a 0-byte lock that blocks everything after it. The script moves them aside; the
  auto-push agent deletes them.
- **Pushing.** A sandbox has no GitHub credentials, so `publish.py` treats a failed push as normal and
  says "queued for the auto-push agent". A launchd agent on the Mac
  (`com.shankara.hemeonc-autopush`, every 60s) ships it. **Don't ask the user to run `git push`** —
  just tell them the change is live in about a minute. If they say it never appeared, have them check
  `~/Library/Logs/hemeonc-autopush.log`; a "diverged" line there means a real conflict to resolve.

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
- **The `Write` tool can hit EPERM on the Drive mount** where bash heredocs succeed. If `Write` fails
  on a spec file, write it to `/tmp` with a quoted heredoc, `compile()` it, then `cp` it into place.
- **fitcheck's per-column number is measured from the top of the page's ink**, so a layout that has
  overflowed onto page 2 (no header there) reports a *smaller* number than the same content did when
  it fit on page 1. Don't read a falling number as progress — read the page count.

## Done so far

Breast (2 pages), Colon, Rectal, Pancreatic, NSCLC, Prostate, Testicular, MPN (PV/ET/PMF), Melanoma (2 pages),
NET (2 pages), MDS, AML (2 pages), Renal cell. All thirteen are on the Hub with their trials filed.
Keep the same visual grammar for new ones so the set reads as a series.

Two specs were lost to a sandbox reset before `specs/` existed — **NSCLC and testicular have PDFs but
no spec file**. Rebuild the spec from the PDF the next time either needs an edit.

