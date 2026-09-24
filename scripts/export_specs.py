#!/usr/bin/env python3
"""Export the one-pager spec files to JSON so the site can render them as text.

    python3 scripts/export_specs.py            # all specs -> data/specs/<slug>.json
    python3 scripts/export_specs.py --check    # report only, write nothing

The specs are the source of truth for a one-pager: `template.py` turns them into the
landscape PDF, and this turns the same dict into JSON so the web page can render a
readable HTML view and index the content for search.

A spec module calls `render(spec, OUT)` at import time, so importing one would rewrite
the PDF. Instead we inject a fake `template` module whose `render` just captures the
spec — nothing is rendered and nothing on the user's Drive is touched.

NOTE: the specs live on the Stanford Drive, which Claude Code's tool processes cannot
read (macOS blocks it). Run this from a terminal, or pass --src to a readable copy.
"""
import argparse, json, os, re, runpy, sys, types
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "data" / "specs"
DEFAULT_SRC = ("/Users/shankaraanand/Library/CloudStorage/GoogleDrive-sanand94@stanford.edu/My Drive/"
               "Fellowship/Encyclopedia/Encyclopedia/One Pagers/_assets/specs")


def capture(spec_file: Path):
    """Run a spec module with a stubbed `template`; return (spec_dict, out_pdf_name)."""
    captured = {}

    def fake_render(spec, out_path):
        captured["spec"] = spec
        captured["out"] = os.path.basename(str(out_path))
        return 1

    stub = types.ModuleType("template")
    stub.render = fake_render
    stub.PAL = {}
    stub.pathway_svg = lambda *a, **k: ""

    saved_template = sys.modules.get("template")
    saved_path = list(sys.path)
    sys.modules["template"] = stub
    sys.path.insert(0, str(spec_file.parent))          # for sibling modules (lymphoma_common)
    sys.path.insert(0, str(spec_file.parent.parent))   # for `from template import render`
    try:
        runpy.run_path(str(spec_file), run_name="__spec_export__")
    finally:
        sys.path[:] = saved_path
        if saved_template is not None:
            sys.modules["template"] = saved_template
        else:
            sys.modules.pop("template", None)

    if "spec" not in captured:
        raise RuntimeError("the module never called render()")
    return captured["spec"], captured.get("out")


def pages_of(spec):
    """Normalize to a list of pages, each {subtitle?, columns:[{width, blocks}]}."""
    if spec.get("pages"):
        return spec["pages"]
    return [{"columns": spec.get("columns", [])}]


def headings(spec):
    out = []
    for pg in pages_of(spec):
        for col in pg.get("columns", []):
            for b in col.get("blocks", []):
                h = b.get("heading")
                if h:
                    out.append(re.sub(r"<[^>]+>", "", h))
    return out


def plain_text(spec):
    """Everything in the spec as one searchable string (tags stripped, entities kept readable)."""
    parts = [spec.get("title", ""), spec.get("subtitle", ""), spec.get("source", "")]

    def walk(v):
        if isinstance(v, str):
            parts.append(v)
        elif isinstance(v, (list, tuple)):
            for x in v:
                walk(x)
        elif isinstance(v, dict):
            for k, x in v.items():
                if k in ("width", "widths", "type", "color", "ncols", "css_extra"):
                    continue
                walk(x)

    for pg in pages_of(spec):
        walk(pg.get("columns", []))
    txt = " ".join(p for p in parts if p)
    txt = re.sub(r"<[^>]+>", " ", txt)
    for ent, ch in (("&mdash;", "—"), ("&ndash;", "–"), ("&ge;", "≥"), ("&le;", "≤"), ("&times;", "×"),
                    ("&plusmn;", "±"), ("&minus;", "−"), ("&sup2;", "²"), ("&dagger;", "†"),
                    ("&middot;", "·"), ("&rarr;", "→"), ("&amp;", "&"), ("&nbsp;", " "),
                    ("&ldquo;", "“"), ("&rdquo;", "”"), ("&lt;", "<"), ("&gt;", ">")):
        txt = txt.replace(ent, ch)
    return re.sub(r"\s+", " ", txt).strip()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", default=DEFAULT_SRC)
    ap.add_argument("--check", action="store_true")
    a = ap.parse_args()
    src = Path(a.src)
    try:
        files = sorted(f for f in src.glob("*.py") if not f.name.startswith("_"))
    except PermissionError:
        sys.exit(f"!! cannot read {src}\n   Run this from a terminal that can read the Stanford Drive, "
                 f"or pass --src to a readable copy.")
    if not files:
        sys.exit(f"!! no spec files in {src}")

    diseases = json.loads((ROOT / "data" / "diseases.json").read_text())["diseases"]
    by_pdf = {d["onepager"]: d for d in diseases if d.get("onepager")}

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    ok, skipped = [], []
    for f in files:
        try:
            spec, pdf_name = capture(f)
        except Exception as e:
            skipped.append(f"{f.name}: {type(e).__name__}: {e}")
            continue
        d = by_pdf.get(pdf_name)
        if not d:
            skipped.append(f"{f.name}: rendered to '{pdf_name}', which no disease in diseases.json claims")
            continue
        payload = {
            "disease": d["slug"],
            "spec_file": f.name,
            "pdf": pdf_name,
            "title": spec.get("title", d["name"]),
            "subtitle": spec.get("subtitle", ""),
            "source": spec.get("source", ""),
            "pages": pages_of(spec),
            "headings": headings(spec),
            "text": plain_text(spec),
        }
        ok.append((d["slug"], len(payload["text"]), len(payload["headings"])))
        if not a.check:
            (OUT_DIR / f"{d['slug']}.json").write_text(
                json.dumps(payload, indent=1, ensure_ascii=False) + "\n")

    for slug, n, h in ok:
        print(f"   {slug:<26} {n:>6} chars  {h:>3} headings")
    for s in skipped:
        print(f"   !! {s}")
    have = {s for s, _, _ in ok}
    missing = [d["slug"] for d in diseases if d.get("onepager") and d["slug"] not in have]
    if missing:
        print(f"   no spec exported for: {', '.join(missing)} (PDF-only; search will use the PDF text)")
    print(f"{len(ok)} spec(s) exported{' (check only)' if a.check else ''}")


if __name__ == "__main__":
    main()
