#!/usr/bin/env python3
"""Build data/search.json — the full-text index over one-pager content.

    python3 scripts/build_search.py

Source of text, in order of preference:
  1. data/specs/<slug>.json  (exported by export_specs.py — structured, has headings)
  2. pdftotext over pdfs/<file>.pdf  (for one-pagers with no spec, e.g. NSCLC)

Trials are already searchable from data/trials.json, so they are not duplicated here.
Run after export_specs.py; sync_onepagers.py chains both.
"""
import datetime, html, json, re, subprocess, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
SPECS = DATA / "specs"
PDFS = ROOT / "pdfs"

# section-heading lines in pdftotext output: short, mostly uppercase
HEADING_RE = re.compile(r"^[A-Z][A-Z0-9 &/,'—–→·().+-]{3,48}$")


def plain(s: str) -> str:
    """Strip tags and decode entities — headings are shown as text, not HTML."""
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", "", s or ""))).strip()


def pdf_text(p: Path) -> str:
    try:
        return subprocess.run(["pdftotext", "-layout", str(p), "-"],
                              capture_output=True, text=True).stdout
    except Exception:
        return ""


def from_pdf(p: Path):
    raw = pdf_text(p)
    heads, seen = [], set()
    for line in raw.splitlines():
        s = line.strip()
        if not (3 < len(s) <= 48) or s in seen:
            continue
        letters = [c for c in s if c.isalpha()]
        # a heading line is short and predominantly capitals (the cards set them in caps)
        if not letters or len(s.split()) > 6:
            continue
        if sum(c.isupper() for c in letters) / len(letters) < 0.85:
            continue
        seen.add(s)
        heads.append(s.title())
    return re.sub(r"\s+", " ", raw).strip(), heads[:24]


def main():
    diseases = json.loads((DATA / "diseases.json").read_text())["diseases"]
    onepagers = json.loads((DATA / "onepagers.json").read_text())["onepagers"]
    op_by = {o["disease"]: o for o in onepagers}

    docs = []
    for d in diseases:
        op = op_by.get(d["slug"])
        if not op:
            continue
        spec_file = SPECS / f"{d['slug']}.json"
        if spec_file.exists():
            s = json.loads(spec_file.read_text())
            text, heads, src = s["text"], [plain(h) for h in s["headings"]], "spec"
            subtitle = plain(s.get("subtitle", ""))
        else:
            text, heads = from_pdf(PDFS / op["file"])
            src, subtitle = "pdf", ""
        docs.append({
            "disease": d["slug"],
            "title": d["name"],
            "short": d.get("short", d["name"]),
            "group": d.get("group", "unassigned"),
            "pages": op.get("pages"),
            "source": src,
            "subtitle": subtitle,
            "headings": heads,
            "text": text,
        })

    out = {"generated": datetime.datetime.now().isoformat(timespec="seconds"), "docs": docs}
    (DATA / "search.json").write_text(json.dumps(out, ensure_ascii=False) + "\n")
    chars = sum(len(d["text"]) for d in docs)
    kb = (DATA / "search.json").stat().st_size / 1024
    n_spec = sum(1 for d in docs if d["source"] == "spec")
    print(f"   search.json: {len(docs)} one-pagers ({n_spec} from specs, {len(docs)-n_spec} from PDF text), "
          f"{chars:,} chars, {kb:.0f} KB")


if __name__ == "__main__":
    main()
