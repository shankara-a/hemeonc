---
name: add-trial
description: Add a landmark clinical trial (or several) to the Heme/Onc Hub trial library at shankara-a.github.io/hemeonc — fills the population/arms/endpoint/result/takeaway card, links the PubMed record, and pushes. Use when asked to "add a trial", "add X to the trial tracker", "log this trial", or "put these trials on the site".
---

# Add trial

Writes entries into **`hemeonc/data/trials.json`** via `scripts/add_trial.py`, then pushes so the
site updates. This replaced the Notion "Clinical Trials" page (2026-09) — do not add trials to Notion.

Repo: `/Users/shankaraanand/Library/CloudStorage/GoogleDrive-shankara.k.anand@gmail.com/My Drive/Personal/projects/hemeonc/`

## Steps

1. **Check it isn't already there:** `grep -i '"name": ".*<TRIAL>' data/trials.json`. If it is and the
   user wants changes, write the full object again and pass `--update`.
2. **Pick the disease slug** from `data/diseases.json` (`jq '.diseases[].slug'`). If the disease doesn't
   exist, add it in the same command with `--new-disease '{"slug","name","short","group"}'`
   (group ∈ `solid` · `malignant-heme` · `benign-heme`).
3. **Research the trial** — use the PubMed MCP tools (`search_articles`, `get_article_metadata`) or
   your knowledge for the primary publication; confirm the numbers you put in `results`. Prefer the
   primary endpoint paper for `reference`/`year`, and mention updates (OS, 5-yr) inside `results`.
4. **Write the JSON** (one object or a list) to a scratch file and run:
   ```bash
   python3 scripts/add_trial.py /tmp/trial.json --push
   ```
   The script validates, resolves the PMID from `reference`, sorts, commits and pushes.
5. Reply with the trial name(s), the disease, and the deep link `https://shankara-a.github.io/hemeonc/#trial/<id>`.

## Schema

```json
{
  "id": "keynote-048",                       // kebab-case; defaults to slugified name
  "name": "KEYNOTE-048",
  "disease": "head-neck",
  "year": 2019,
  "phase": "3",                              // "2", "1/2", "pooled" …
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
  "verified": true                           // true only if the user confirmed or the numbers were checked against the paper
}
```

Style: match the existing entries — terse, numbers first (`OS 13.0 vs 10.7 mo (HR 0.77)`), the
`highlights` say what changed in practice and any caveat (crossover, subgroup-only benefit, harm signals).
Use plain Unicode (≥, →, ×, µ) — this is JSON, not the one-pager HTML.

`verified`: set `true` when the user dictated the content or you confirmed the key numbers from the
PubMed abstract; otherwise `false` (the site shows an amber "unverified" chip so they can be checked later).

## Gotchas

- `reference` must start with `Author XY et al. <Journal> <year>` for PMID auto-resolution. Journals
  known to the resolver: NEJM, Lancet, Lancet Oncol, JCO, JAMA, JAMA Oncol, Ann Oncol, Nat Med, Ann Surg,
  Blood, Blood Adv, Leukemia, Haematologica, Clin Cancer Res, NEJM Evid, Eur Urol. Anything else → put
  the PMID in yourself (`"pmid": "12345678"`).
- Conference-only data (ASCO/ASH abstract, no paper yet): reference like `Sinicrope FA et al. ASCO 2025 LBA1`,
  leave `pmid` null; the site links a PubMed search instead.
- If `git push` fails (no network / auth), the commit is still local — tell the user to push.
