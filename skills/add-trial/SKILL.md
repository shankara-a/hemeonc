---
name: "add-trial"
description: "Add a landmark clinical trial (or several) to the Heme/Onc Hub trial library at shankara-a.github.io/hemeonc — fills the population/arms/endpoint/result/takeaway card, links the PubMed record, and pushes. Use when asked to \"add a trial\", \"add X to the trial tracker\", \"log this trial\", or \"put these trials on the site\"."
---

# Add trial

Writes entries into **`hemeonc/data/trials.json`** via `scripts/publish.py`, which commits and
publishes in one step. This replaced the Notion "Clinical Trials" page (2026-09) — do not add trials
to Notion.

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
   (`search_articles`, `get_article_metadata`, `lookup_article_by_citation`) to pull the primary
   publication and confirm every number you put in `results` (medians, HRs, rates). Prefer the
   primary-endpoint paper for `reference`/`year`; quote the primary analysis first and mention updates
   (OS, 5-yr) after it. Never add an entry whose numbers you couldn't check — the site shows no
   "unverified" flag, so what goes in is presented as checked.
4. **Write the JSON** (one object or a list) to a scratch file and run one command:
   ```bash
   cd "<repo>"
   python3 scripts/publish.py --trials /tmp/trial.json
   ```
   That validates, resolves PMIDs from `reference`, sorts, rebuilds the one-pager manifest, commits and
   pushes. Add `--new-disease '{...}'` for a new slug, `--update` to overwrite an existing id,
   `--check` for a dry run that writes nothing.

   `publish.py` is **strict on purpose** — it refuses to commit if `verified` isn't `true`, if a trial
   has no PMID/NCT and isn't flagged as conference-only, or if `validate.py` reports anything. If it
   stops, fix the entry rather than reaching for `--allow-unverified`.
5. Reply with the trial name(s), the disease, and the deep link
   `https://shankara-a.github.io/hemeonc/#trial/<id>`. **Don't ask the user to push** — see below.

## Pushing is automatic

A Cowork sandbox has no GitHub credentials, so `publish.py` commits and then reports
"queued for the auto-push agent". A launchd agent on the Mac (`com.shankara.hemeonc-autopush`) polls
the repo every 60 seconds and pushes; GitHub Pages redeploys about a minute later. Tell the user the
change will be live shortly — do not hand them a `git push` command.

If they say it never went live, the log is `~/Library/Logs/hemeonc-autopush.log`. A "diverged" line
means the local and remote histories disagree and a human has to resolve it. No log at all means the
agent isn't loaded:
```bash
launchctl load -w ~/Library/LaunchAgents/com.shankara.hemeonc-autopush.plist
```

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

- Write a **single JSON array** to one scratch file and make one `publish.py --trials` call. It
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
- **`onepager` does not belong in `--new-disease`.** The one-pager sync sets it from the PDF filename.
  (Historically, passing it before the PDF was in `pdfs/` failed validation *after* the disease had
  already been written. `publish.py` now orders the steps so this can't happen.)
- A slug can already exist with `"onepager": null` — that is not "already done", but the sync fills it
  in on the next run.
- **Stale `.git/*.lock` files** appear because the Drive mount allows `rename()` but refuses
  `unlink()`. `publish.py` moves them aside and the auto-push agent deletes them; the
  `unable to unlink ... Operation not permitted` warnings are cosmetic.
- **Don't call `add_trial.py`, `sync_onepagers.py` or `git` directly** unless you're debugging.
  `publish.py` exists so the ordering and the identity/lock/push workarounds live in one place.

