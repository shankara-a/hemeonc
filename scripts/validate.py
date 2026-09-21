#!/usr/bin/env python3
"""Sanity-check data/*.json (run before committing; add_trial.py and CI call this)."""
import json, re, subprocess, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
REQUIRED = ["id", "name", "disease", "year", "setting", "descriptor", "population", "arms",
            "primary_endpoint", "results", "reference", "takeaway"]


def validate(trials_db, diseases_db, onepagers_db=None):
    problems = []
    slugs = {d["slug"] for d in diseases_db["diseases"]}
    groups = {g["id"] for g in diseases_db["groups"]} | {"unassigned"}
    for d in diseases_db["diseases"]:
        if d.get("group") not in groups:
            problems.append(f"disease {d['slug']}: unknown group {d.get('group')}")
        if d.get("onepager") and not (ROOT / "pdfs" / d["onepager"]).exists():
            problems.append(f"disease {d['slug']}: onepager file missing: pdfs/{d['onepager']}")
    seen = set()
    for t in trials_db["trials"]:
        tid = t.get("id", "?")
        if tid in seen:
            problems.append(f"trial {tid}: duplicate id")
        seen.add(tid)
        for k in REQUIRED:
            if not t.get(k):
                problems.append(f"trial {tid}: missing {k}")
        if t.get("disease") not in slugs:
            problems.append(f"trial {tid}: unknown disease {t.get('disease')}")
        if not isinstance(t.get("year"), int) or not (1950 <= t["year"] <= 2100):
            problems.append(f"trial {tid}: bad year {t.get('year')}")
        if t.get("pmid") and not str(t["pmid"]).isdigit():
            problems.append(f"trial {tid}: bad pmid {t['pmid']}")
        if not isinstance(t.get("highlights", []), list):
            problems.append(f"trial {tid}: highlights must be a list")
    if onepagers_db:
        for o in onepagers_db["onepagers"]:
            if o["disease"] not in slugs:
                problems.append(f"onepager {o['file']}: unknown disease {o['disease']}")
            if not (ROOT / "pdfs" / o["file"]).exists():
                problems.append(f"onepager {o['file']}: file missing")
    return problems


def bump_asset_version():
    """Rewrite ?v=N on asset tags in index.html to the current commit count (cache-busting)."""
    idx = ROOT / "index.html"
    n = subprocess.run(["git", "rev-list", "--count", "HEAD"], cwd=ROOT, capture_output=True, text=True).stdout.strip() or "0"
    s = idx.read_text()
    new = re.sub(r"(assets/[a-z]+\.(?:js|css))(\?v=\d+)?", lambda m: f"{m.group(1)}?v={int(n) + 1}", s)
    if new != s:
        idx.write_text(new)


def main():
    trials = json.loads((DATA / "trials.json").read_text())
    diseases = json.loads((DATA / "diseases.json").read_text())
    onepagers = json.loads((DATA / "onepagers.json").read_text()) if (DATA / "onepagers.json").exists() else None
    problems = validate(trials, diseases, onepagers)
    if problems:
        print("\n".join("!! " + p for p in problems))
        sys.exit(1)
    n = len(trials["trials"])
    unverified = sum(1 for t in trials["trials"] if not t.get("verified"))
    print(f"OK — {n} trials ({unverified} unverified), {len(diseases['diseases'])} diseases, "
          f"{len(onepagers['onepagers']) if onepagers else 0} one-pagers")


if __name__ == "__main__":
    main()
