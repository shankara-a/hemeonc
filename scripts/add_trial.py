#!/usr/bin/env python3
"""Add or update trial entries in data/trials.json.

    python3 scripts/add_trial.py trial.json                 # one object or a list of objects
    cat trial.json | python3 scripts/add_trial.py -         # from stdin
    python3 scripts/add_trial.py trial.json --push          # + git commit + push
    python3 scripts/add_trial.py trial.json --update        # allow overwriting an existing id

Each object must have: id, name, disease, year, setting, descriptor, population, arms,
primary_endpoint, results, reference, takeaway. Optional: phase (default "3"), n, toxicity,
pmid, nct, highlights[], tags[], source, verified (default false).

The disease must exist in data/diseases.json unless you pass --new-disease with a JSON object
{"slug","name","short","group"} (group: solid | malignant-heme | benign-heme).
A missing pmid is resolved from `reference` via scripts/pubmed_lookup.py.
"""
import argparse, datetime, json, re, subprocess, sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from pubmed_lookup import resolve  # noqa: E402
from validate import validate, bump_asset_version  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
TRIALS = ROOT / "data" / "trials.json"
DISEASES = ROOT / "data" / "diseases.json"
REQUIRED = ["id", "name", "disease", "year", "setting", "descriptor", "population", "arms",
            "primary_endpoint", "results", "reference", "takeaway"]
FIELDS = ["id", "name", "disease", "year", "phase", "setting", "descriptor", "population", "arms", "n",
          "primary_endpoint", "results", "toxicity", "reference", "pmid", "nct", "highlights", "takeaway",
          "tags", "source", "verified", "updated"]


def slugify(s):
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


def normalize(t):
    t = dict(t)
    t["id"] = slugify(t.get("id") or t["name"])
    t.setdefault("phase", "3")
    t.setdefault("highlights", [])
    t.setdefault("tags", [])
    t.setdefault("source", "manual")
    t.setdefault("verified", False)
    for k in ("n", "toxicity", "pmid", "nct"):
        t.setdefault(k, None)
    t["year"] = int(t["year"])
    t["updated"] = datetime.date.today().isoformat()
    missing = [k for k in REQUIRED if not t.get(k)]
    if missing:
        sys.exit(f"!! {t['id']}: missing required fields: {', '.join(missing)}")
    return {k: t.get(k) for k in FIELDS}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("src", help="JSON file path or '-' for stdin")
    ap.add_argument("--update", action="store_true", help="overwrite an existing id")
    ap.add_argument("--new-disease", help='JSON: {"slug","name","short","group"} to add to diseases.json')
    ap.add_argument("--commit", action="store_true")
    ap.add_argument("--push", action="store_true", help="implies --commit")
    a = ap.parse_args()

    raw = json.load(sys.stdin) if a.src == "-" else json.loads(Path(a.src).read_text())
    items = raw if isinstance(raw, list) else [raw]
    db = json.loads(TRIALS.read_text())
    dz = json.loads(DISEASES.read_text())

    if a.new_disease:
        nd = json.loads(a.new_disease)
        nd.setdefault("onepager", None)
        nd.setdefault("aliases", [nd["slug"]])
        if not any(d["slug"] == nd["slug"] for d in dz["diseases"]):
            dz["diseases"].append(nd)
            DISEASES.write_text(json.dumps(dz, indent=2, ensure_ascii=False) + "\n")
            print(f"   disease added: {nd['slug']}")
    slugs = {d["slug"] for d in dz["diseases"]}

    by_id = {t["id"]: i for i, t in enumerate(db["trials"])}
    added, updated = [], []
    for t in items:
        t = normalize(t)
        if t["disease"] not in slugs:
            sys.exit(f"!! {t['id']}: unknown disease '{t['disease']}' — pass --new-disease or pick one of: {', '.join(sorted(slugs))}")
        if not t["pmid"]:
            pmid, how = resolve(t)
            if pmid:
                t["pmid"] = pmid
                print(f"   {t['id']}: PMID {pmid} ({how})")
            else:
                print(f"   {t['id']}: no PMID ({how}) — site will link a PubMed search instead")
        if t["id"] in by_id:
            if not a.update:
                sys.exit(f"!! {t['id']} already exists — pass --update to overwrite")
            db["trials"][by_id[t["id"]]] = t
            updated.append(t["id"])
        else:
            db["trials"].append(t)
            by_id[t["id"]] = len(db["trials"]) - 1
            added.append(t["id"])

    db["trials"].sort(key=lambda x: (x["disease"], x["year"], x["name"].lower()))
    db["updated"] = datetime.date.today().isoformat()
    problems = validate(db, dz)
    if problems:
        sys.exit("!! validation failed:\n   " + "\n   ".join(problems))
    TRIALS.write_text(json.dumps(db, indent=1, ensure_ascii=False) + "\n")
    print(f"   trials.json: +{len(added)} added, {len(updated)} updated → {len(db['trials'])} total")

    if a.commit or a.push:
        names = added + updated
        msg = "Add trials: " + ", ".join(names) if added and not updated else "Update trials: " + ", ".join(names)
        bump_asset_version()
        subprocess.run(["git", "add", "data/trials.json", "data/diseases.json", "index.html"], cwd=ROOT, check=True)
        subprocess.run(["git", "commit", "-q", "-m", msg], cwd=ROOT, check=True)
        print(f"   committed: {msg}")
        if a.push:
            subprocess.run(["git", "push"], cwd=ROOT, check=True)
            print("   pushed — GitHub Pages redeploys in ~1 minute")


if __name__ == "__main__":
    main()
