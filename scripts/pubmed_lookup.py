#!/usr/bin/env python3
"""Fill in missing PMIDs in data/trials.json from each trial's `reference` string.

Parses "Author X et al. Journal YYYY;VOL:PAGE" and asks NCBI E-utilities for an exact
journal/volume/page match; falls back to author + journal + year + trial name.

    python3 scripts/pubmed_lookup.py            # fill missing pmids in place
    python3 scripts/pubmed_lookup.py --id crown # one trial
    python3 scripts/pubmed_lookup.py --force    # re-resolve everything

Only `requests`-free stdlib is used so it runs anywhere.
"""
import argparse, json, re, sys, time, urllib.parse, urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TRIALS = ROOT / "data" / "trials.json"
EUTILS = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils"

JOURNALS = {  # abbreviation used in references -> PubMed [ta]
    "NEJM": "N Engl J Med", "Lancet": "Lancet", "Lancet Oncol": "Lancet Oncol",
    "JCO": "J Clin Oncol", "JAMA": "JAMA", "JAMA Oncol": "JAMA Oncol", "Ann Oncol": "Ann Oncol",
    "Nat Med": "Nat Med", "Ann Surg": "Ann Surg", "Blood": "Blood", "Clin Cancer Res": "Clin Cancer Res",
    "NEJM Evidence": "NEJM Evid", "NEJM Evid": "NEJM Evid", "Endocr Relat Cancer": "Endocr Relat Cancer",
    "Eur Urol": "Eur Urol", "Leukemia": "Leukemia", "Blood Adv": "Blood Adv", "Haematologica": "Haematologica",
}
REF_RE = re.compile(
    r"(?P<author>[A-Z][\w'’-]+(?:\s[A-Z][\w-]*)?\s[A-Z]{1,3})\s+et al\.?\s+"
    r"(?P<journal>NEJM Evidence|NEJM Evid|Lancet Oncol|JAMA Oncol|Ann Oncol|Nat Med|Ann Surg|Clin Cancer Res|Endocr Relat Cancer|Eur Urol|Blood Adv|Haematologica|Leukemia|NEJM|Lancet|JCO|JAMA|Blood)"
    r"\s+(?P<year>\d{4})(?:;(?P<vol>\d+):(?P<page>[\w]+))?")


def esearch(term):
    url = f"{EUTILS}/esearch.fcgi?" + urllib.parse.urlencode({"db": "pubmed", "term": term, "retmode": "json", "retmax": 5})
    with urllib.request.urlopen(url, timeout=20) as r:
        data = json.load(r)
    return data["esearchresult"].get("idlist", [])


def resolve(trial):
    """Return (pmid, how) or (None, reason). Uses the FIRST citation in `reference`."""
    ref = trial.get("reference") or ""
    m = REF_RE.search(ref)
    if not m:
        return None, "unparsed reference"
    au, jr, yr, vol, pg = m.group("author"), JOURNALS[m.group("journal")], m.group("year"), m.group("vol"), m.group("page")
    tries = []
    if vol and pg:
        pg_first = re.match(r"[A-Za-z]*\d+", pg).group(0) if re.match(r"[A-Za-z]*\d+", pg) else pg
        tries.append((f'"{jr}"[ta] AND {vol}[vi] AND {pg_first}[pg]', "journal/vol/page"))
    name = re.sub(r"\s*\(.*?\)", "", trial["name"]).split("/")[0].strip()
    tries.append((f'{au}[au] AND "{jr}"[ta] AND {yr}[dp] AND ({name}[tiab] OR {name}[ti])', "author/journal/year/name"))
    tries.append((f'{au}[au] AND "{jr}"[ta] AND {yr}[dp]', "author/journal/year"))
    for term, how in tries:
        try:
            ids = esearch(term)
        except Exception as e:  # network hiccup — try the next form
            ids = []
            print(f"   ! {trial['id']}: {e}", file=sys.stderr)
        time.sleep(0.4)  # NCBI: ≤3 req/s without an API key
        if len(ids) == 1:
            return ids[0], how
        if len(ids) > 1 and how != "author/journal/year":
            return ids[0], how + " (first of %d)" % len(ids)
    return None, "no unique match"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--id", help="only this trial id")
    ap.add_argument("--force", action="store_true", help="re-resolve trials that already have a pmid")
    a = ap.parse_args()
    db = json.loads(TRIALS.read_text())
    changed = 0
    for t in db["trials"]:
        if a.id and t["id"] != a.id:
            continue
        if t.get("pmid") and not a.force:
            continue
        pmid, how = resolve(t)
        if pmid:
            t["pmid"] = pmid
            changed += 1
            print(f"   {t['id']:<22} PMID {pmid}  ({how})")
        else:
            print(f"   {t['id']:<22} --  {how}")
    if changed:
        TRIALS.write_text(json.dumps(db, indent=1, ensure_ascii=False) + "\n")
    print(f"{changed} pmid(s) added")


if __name__ == "__main__":
    main()
