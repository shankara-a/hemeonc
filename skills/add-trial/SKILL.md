---
name: "add-trial"
description: "Add a landmark clinical trial (or several) to the Heme/Onc Hub trial library at shankara-a.github.io/hemeonc — fills the population/arms/endpoint/result/takeaway card, links the PubMed record, and pushes. Use when asked to \"add a trial\", \"add X to the trial tracker\", \"log this trial\", or \"put these trials on the site\"."
---

# Add trial

Writes entries into **`hemeonc/data/trials.json`** via `scripts/add_trial.py`, then pushes so the
site updates. This replaced the Notion "Clinical Trials" page (2026-09) — do not add trials to Notion.

Repo: `/Users/shankaraanand/Library/CloudStorage/GoogleDrive-shankara.k.anand@gmail.com/My Drive/Personal/projects/hemeonc/`

The repo is on the **personal** Drive account, not the Stanford one. A Cowork session connected only
to the Encyclopedia folder cannot see it — request it with `request_cowork_directory` first.

## Steps

1. **Check it isn't already there:** `grep -i '"name": ".*<TRIAL>' data/trials.json`. If it is and the
   user wants changes, write the full object again and pass `--update`.
2. **Pick the disease slug** from `data/diseases.json` (`jq '.diseases[].slug'`). If the disease doesn't
   exist, add it in the same command with `--new-disease '{"slug","name","short","group"}'`
   (group ∈ `solid` · `malignant-heme` · `benign-heme`).
3. **Research the trial — and check it against the abstract.** Use the PubMed MCP tools
   (`search_articles`, `get_article_metadata`) to pull the primary publication's abstract and confirm
   every number you put in `results` (medians, HRs, rates). Prefer the primary-endpoint paper for
   `reference`/`year`; quote the primary analysis first and mention updates (OS, 5-yr) after it.
   Never add an entry whose numbers you couldn't check — the site shows no "unverified" flag, so what
   goes in is presented as checked.
4. **Write the JSON** (one object or a list) to a scratch file and run:
   ```bash
   python3 scripts/add_trial.py /tmp/trial.json --push
   ```
   The script validates, resolves the PMID from `reference`, sorts, commits and pushes.
5. Reply with the trial name(s), the disease, and the deep link `https://shankara-a.github.io/hemeonc/#trial/<id>`.

## Verify like you mean it

Step 3 is the whole job. "Check the numbers" is easy to nod past, so concretely — these are all real
errors caught by reading the abstract, against confident prior belief:

- **Numbers get misattributed between neighbouring trials.** The overall-survival figures widely quoted
  for **D-0007** (decitabine) are actually **EORTC 06011's**. D-0007 reports no OS data at all. If a
  number is famous but absent from the primary abstract, leave it out.
- **Phase is often wrong.** **BMT CTN 1102** is phase **2** — a *biologic assignment* trial (donor vs
  no-donor), not a randomized phase 3. Don't default `phase` to "3" because the template does.
- **Primary endpoint is often wrong.** **SWOG S1203**'s primary endpoint was **EFS**, not OS.
- **Publication year is often wrong.** SWOG S1203 published in *Leukemia* **2024**, not 2019.
- **Some figures live only in the full text**, not the abstract — RATIFY's medians and CIs, QUAZAR's HR,
  SWOG S1203's per-arm rates. Use PMC when the abstract is thin, and say in your reply where a number
  came from if it wasn't the abstract.

When a source genuinely doesn't support a field, omit it rather than guessing, and tell the user which
fields you left empty and why.

## Filing several trials at once

For more than ~5 trials (e.g. every trial cited by a new one-pager):

- Write a **single JSON array** to one scratch file and make one `add_trial.py` call. The script
  handles lists and reports `+N added`.
- **Delegate the verification** to subagents — one per disease or per batch of ~10 — and have them
  return the finished JSON array plus a "verification notes" section listing anything unconfirmed.
  Read those notes before filing; that's where the phase/endpoint/year corrections surface.
- Trials already filed under another disease (e.g. KEYNOTE-158 for MSI-H) don't need a duplicate.

## Schema

```json
{
  "id": "keynote-048",                       // kebab-case; defaults to slugified name
  "name": "KEYNOTE-048",
  "disease": "head-neck",
  "year": 2019,
  "phase": "3",                              // "2", "1/2", "pooled" … check it, don't assume
  "setting": "1L recurrent/metastatic",      // ≤6 words; where in the pathway
  "descriptor": "first-line recurrent/metastatic HNSCC",   // what vs what, one line
  "population": "…", "arms": "…", "primary_endpoint": "…", "results": "…",
  "toxicity": "…",                           // optional
  "n": 882,                                  // optional
  "reference": "Burtness B et al. Lancet 2019;394:1915",   // Author AB et al. Journal YYYY;vol:page
  "highlights": ["why it matters …", "how it changed practice …"],
  "takeaway": "one sentence for the hover card",
  "tags": ["pembrolizumab", "PD-L1"],
  "source": "manual",                        // or "onepager:<slug>" when extracted from a one-pager
  "verified": true                           // always true — you checked the abstract in step 3
}
```

Style: match the existing entries — terse, numbers first (`OS 13.0 vs 10.7 mo (HR 0.77)`), the
`highlights` say what changed in practice and any caveat (crossover, subgroup-only benefit, harm signals).
Use plain Unicode (≥, →, ×, µ) — this is JSON, not the one-pager HTML.

`verified` is kept in the schema for bookkeeping but the site no longer displays it — every entry is
expected to have been checked against the abstract before it is added.

## Gotchas

- `reference` must start with `Author XY et al. <Journal> <year>` for PMID auto-resolution. Journals
  known to the resolver: NEJM, Lancet, Lancet Oncol, JCO, JAMA, JAMA Oncol, Ann Oncol, Nat Med, Ann Surg,
  Blood, Blood Adv, Leukemia, Haematologica, Clin Cancer Res, NEJM Evid, Eur Urol. Anything else → put
  the PMID in yourself (`"pmid": "12345678"`).
- Conference-only data (ASCO/ASH abstract, no paper yet): reference like `Sinicrope FA et al. ASCO 2025 LBA1`,
  leave `pmid` null; the site links a PubMed search instead. VERONA (SOHO 2025) is the current example.
- **`--new-disease` writes the disease even when the trials then fail validation.** The script appends to
  `diseases.json` and saves it *before* validating the trial objects, so a failed run leaves the disease
  added and no trials filed. Re-check `diseases.json` before re-running or you will add it twice — and on
  the retry drop `--new-disease`, since the slug now exists.
- **`onepager` in `--new-disease` requires the PDF to already be in `pdfs/`.** Validation fails with
  `onepager file missing`. Copy the PDF in first, or add the disease without `onepager` and set it later.
- A slug can already exist with `"onepager": null` — that is not "already done". Set the field if a
  one-pager now exists for it.
- **From a Cowork sandbox the commit fails before the push does.** There is no git identity, so
  `--push` dies with `unable to auto-detect email address`, and then `could not read Username for
  'https://github.com'` because there is no network route to GitHub. Commit under the user's own
  identity — read it from `git log -1 --format='%an <%ae>'`, don't invent one:
  ```bash
  git -c user.name="..." -c user.email="..." commit -q -a -m "Add trials: ..."
  ```
  Then tell the user to run `cd "<repo>" && git push`. Harmless `unable to unlink ... Operation not
  permitted` warnings on `.git` lock files are expected on the Drive mount; confirm the commit landed
  with `git log -1` and `git status --porcelain`.

