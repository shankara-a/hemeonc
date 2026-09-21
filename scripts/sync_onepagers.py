#!/usr/bin/env python3
"""Sync one-pager PDFs from the Encyclopedia into this site and publish.

    python3 scripts/sync_onepagers.py               # copy → manifest → commit → push
    python3 scripts/sync_onepagers.py --no-push     # stop after committing
    python3 scripts/sync_onepagers.py --dry-run     # report only
    python3 scripts/sync_onepagers.py --src "/path/to/One Pagers"

Steps
 1. Copy every *.pdf in SRC into pdfs/ (skips unchanged files by sha1; removes PDFs that no
    longer exist in SRC unless --keep-orphans).
 2. Rebuild data/onepagers.json — one entry per PDF: disease slug (matched through
    data/diseases.json `onepager`), title, pages, size, sha1, updated date.
    A PDF with no matching disease gets a stub disease appended to diseases.json (group
    "unassigned") so the site still shows it — fix the group/name afterwards.
 3. Trial coverage check: pdftotext each PDF and report trial names in data/trials.json for
    that disease that do NOT appear in the PDF, and ALL-CAPS tokens in the PDF that look like
    trial names but have no entry (so the one-pager skill can add them).
 4. git add / commit / push (unless --no-commit / --no-push / --dry-run).
"""
import argparse, datetime, hashlib, json, os, re, shutil, subprocess, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PDF_DIR = ROOT / "pdfs"
DATA = ROOT / "data"
DEFAULT_SRC = ("/Users/shankaraanand/Library/CloudStorage/GoogleDrive-sanand94@stanford.edu/My Drive/"
               "Fellowship/Encyclopedia/Encyclopedia/One Pagers")

# tokens that look like trial names but aren't
NOT_TRIALS = set("""
AJCC NCCN WHO ASCO ASH ESMO EHA FDA NEJM JCO JAMA IHC FISH DISH NGS PCR MRD CT MRI PET CTA EUS ERCP
CBC CMP LDH AFP HCG CEA PSA PSMA PSAD CA CPS TPS TMB MSI MSS MMR HRR BRCA ATM CHEK2 PALB2 KRAS NRAS BRAF EGFR ALK ROS1 RET MET
HER2 ER PR PD-L1 CDK PARP ADC TKI ARPI ADT CRPC CSPC BCR EBRT SBRT SRS WBRT IMRT RT CRT TNT TME APR LAR BCS SLNB SLN ALND
FOLFOX FOLFIRI FOLFIRINOX CAPOX CAPEOX XELOX NALIRIFOX CAPTEM FOLFOXIRI GEM TCHP TCH TC AC EC ddAC BEP EP VIP TIP
ECOG KPS PS OS PFS DFS EFS RFS MFS DMFS TTP ORR CR PR pCR MPR HR CI NR NS TI TNM AUC BID TID QD PO IV SQ IM
MDS AML CML CLL MPN PV ET PMF MF NET NEC GEP PNET NSCLC SCLC TNBC HNSCC DTC HCC RCC PDAC GIST GCT NSGCT
IPSS DIPSS MIPSS GIPSS IPSET IGCCCG RECIST CTCAE IWG ELN NCI ACS SEER NIH VTE PE DVT HFS ILD CNS GI GU
HU IFN HMA ESA PRRT SSA SSTR DOTATATE LAR MEN MEN1 MEN2 VHL NF1 HLA HPV EBV JAK STAT CALR MPL ASXL1 SRSF2
IDH IDH1 IDH2 TP53 U2AF1 EZH2 TET2 DNMT3A FLT3 NPM1 RUNX1 SF3B1 DEXA LFT ULN LLN AE AEs G-CSF GCSF
I II III IV IA IB IIA IIB IIC IIIA IIIB IIIC IIID IVA IVB IVC T1 T2 T3 T4 N0 N1 N2 N3 M0 M1 M1a M1b M1c
ADCS ADCs LEVEL NOTE PEARLS WORKUP STAGING SURVEILLANCE REGIMENS BIOMARKER THERAPY PATHWAY TRIALS KEY
""".split())
TRIAL_PATTERNS = [
    re.compile(r"\b(?:CheckMate|RTOG|EORTC|SWOG|CALGB|NSABP|ACOSOG|ECOG|NRG|JCOG|GETUG|PRODIGE|NCIC|Alliance|ALLIANCE|IFCT|GOG|ANZUP|STAMPEDE)[\s-]?[A-Z]?\d{1,5}[A-Z]?\b"),
    re.compile(r"\b[A-Z][A-Za-z]{2,}-\d{1,4}[A-Z]?\b"),      # KEYNOTE-158, NETTER-1, ERA-223
    re.compile(r"\b[A-Z]{4,}\d{1,3}\b"),                    # TRITON2, AURA3, FLAURA2
    re.compile(r"\b[A-Z]{5,}\b"),                            # NADINA, OLYMPIA, BREAKWATER
    re.compile(r"\b[A-Z][a-z]+[A-Z]{2,}[A-Za-z]*\b"),         # monarchE, IMerge, RxPONDER
]
GENES = set("""PIK3CA BRCA1 BRCA2 HOXB13 CHEK2 CDKN2A ACVR1 JAK2 MLH1 MSH2 MSH6 PMS2 NRG1 POLD1 ERBB2 CCND1 FGFR2 FGFR3
KMT2A MIPSS70 TTF-1 CDK4 CDK6 AKT1 ESR1 CYP2D6 SF3B1 TET2 ASXL1 SRSF2 U2AF1 EZH2 IDH1 IDH2 TP53 FLT3 NPM1 RUNX1 DNMT3A
MEN1 MEN2 RET1 GATA2 STAT3 STAT5 PDGFRA PDGFRB KIT1 NTRK1 NTRK2 NTRK3 HLA-A HLA-B MC1R BAP1 CALR MPL RB1 PTEN SMAD4
CDKN2B ARID1A KEAP1 STK11 MTAP CTNNB1 V600E V600K V617F L858R T790M W515L G12C G12D Q157""".split())
try:
    _WORDS = {w.strip().lower() for w in open("/usr/share/dict/words", encoding="utf-8", errors="ignore")}
except OSError:
    _WORDS = set()


def trial_tokens(text: str) -> set[str]:
    """Trial-shaped tokens in a PDF's text (heuristic; dictionary words and gene names dropped)."""
    out = set()
    for rx in TRIAL_PATTERNS:
        for tok in rx.findall(text):
            t = tok.strip()
            if t in NOT_TRIALS or t in GENES or len(t) < 4:
                continue
            if t.isalpha():                                  # ADJUVANT, DOSING, MARKERS, ...
                low = t.lower()
                stems = [low, low[:-1], low[:-2], low[:-3], low[:-3] + "e"]
                if any(x in _WORDS for x in stems if len(x) >= 4):
                    continue
            if re.fullmatch(r"(NEJM|JCO|JAMA|ASCO|ASH|ESMO|WHO|NCCN|AUC|PFS|OS|ORR|EFS|RFS|DFS|MFS|TTP|CPS|TPS|CIV|III|LAR|GG\d|PSA|IHC|DM1|FOLFOX|CAPEOX|CAPOX|NALIRIFOX|BREAKWATER|IDEA)[\s-]?\d*[A-Z]?", t):
                continue
            out.add(re.sub(r"\s+", " ", t))
    return out


def norm(s: str) -> str:
    return re.sub(r"[^a-z0-9]", "", s.lower())


def sha1(p: Path) -> str:
    h = hashlib.sha1()
    with open(p, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 16), b""):
            h.update(chunk)
    return h.hexdigest()


def page_count(p: Path) -> int | None:
    try:
        import pypdf
        return len(pypdf.PdfReader(str(p)).pages)
    except Exception:
        pass
    try:
        out = subprocess.run(["pdfinfo", str(p)], capture_output=True, text=True).stdout
        m = re.search(r"Pages:\s+(\d+)", out)
        return int(m.group(1)) if m else None
    except Exception:
        return None


def pdf_text(p: Path) -> str:
    try:
        return subprocess.run(["pdftotext", "-layout", str(p), "-"], capture_output=True, text=True).stdout
    except Exception:
        return ""


def slugify(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


def run(cmd, dry=False):
    print("   $ " + " ".join(cmd))
    if not dry:
        r = subprocess.run(cmd, cwd=ROOT, text=True, capture_output=True)
        if r.stdout.strip():
            print("     " + r.stdout.strip().replace("\n", "\n     "))
        if r.returncode:
            print("     " + r.stderr.strip().replace("\n", "\n     "), file=sys.stderr)
        return r.returncode
    return 0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", default=DEFAULT_SRC)
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--no-commit", action="store_true")
    ap.add_argument("--no-push", action="store_true")
    ap.add_argument("--keep-orphans", action="store_true", help="don't delete pdfs/ files missing from SRC")
    ap.add_argument("--message", default=None, help="commit message")
    a = ap.parse_args()
    src = Path(a.src)

    # ---- 1. copy -------------------------------------------------------------------------
    try:
        src_pdfs = sorted(p for p in src.iterdir() if p.suffix.lower() == ".pdf" and not p.name.startswith("."))
    except PermissionError:
        sys.exit(f"!! Cannot read {src}\n   macOS blocked this process from the Stanford Drive mount. Run this script from "
                 f"a terminal / session that can read that folder, or pass --src to a copy.")
    if not src_pdfs:
        sys.exit(f"!! No PDFs found in {src} — refusing to sync (would delete everything).")
    PDF_DIR.mkdir(exist_ok=True)
    changed = []
    for p in src_pdfs:
        dst = PDF_DIR / p.name
        if dst.exists() and sha1(dst) == sha1(p):
            continue
        print(f"   copy  {p.name}")
        changed.append(p.name)
        if not a.dry_run:
            shutil.copy2(p, dst)
    src_names = {p.name for p in src_pdfs}
    for dst in sorted(PDF_DIR.glob("*.pdf")):
        if dst.name not in src_names:
            if a.keep_orphans:
                print(f"   orphan (kept) {dst.name}")
            else:
                print(f"   remove {dst.name} (no longer in SRC)")
                changed.append(dst.name)
                if not a.dry_run:
                    dst.unlink()

    # ---- 2. manifest ----------------------------------------------------------------------
    diseases = json.loads((DATA / "diseases.json").read_text())
    by_file = {d["onepager"]: d for d in diseases["diseases"] if d.get("onepager")}
    manifest = []
    added_stub = False
    for p in sorted(PDF_DIR.glob("*.pdf")):
        d = by_file.get(p.name)
        if not d:
            slug = slugify(p.stem)
            d = next((x for x in diseases["diseases"] if x["slug"] == slug), None)
            if d:
                d["onepager"] = p.name
            else:
                d = {"slug": slug, "name": p.stem, "short": p.stem, "group": "unassigned", "onepager": p.name, "aliases": [slug]}
                diseases["diseases"].append(d)
                print(f"   !! {p.name}: no disease in diseases.json — added stub '{slug}' (group=unassigned). Fix it.")
            added_stub = True
        st = p.stat()
        manifest.append({
            "disease": d["slug"], "file": p.name, "title": d["name"], "pages": page_count(p),
            "size": st.st_size, "sha1": sha1(p),
            "updated": datetime.date.fromtimestamp(st.st_mtime).isoformat(),
        })
    out = {"generated": datetime.datetime.now().isoformat(timespec="seconds"), "onepagers": manifest}
    if not a.dry_run:
        (DATA / "onepagers.json").write_text(json.dumps(out, indent=1, ensure_ascii=False) + "\n")
        if added_stub:
            (DATA / "diseases.json").write_text(json.dumps(diseases, indent=2, ensure_ascii=False) + "\n")
    print(f"   manifest: {len(manifest)} one-pager(s)")

    # ---- 3. trial coverage ----------------------------------------------------------------
    trials = json.loads((DATA / "trials.json").read_text())["trials"]
    for m in manifest:
        text = pdf_text(PDF_DIR / m["file"])
        if not text:
            continue
        flat = re.sub(r"\s+", " ", text)
        nflat = norm(flat)
        known = [t for t in trials if t["disease"] == m["disease"]]

        def name_tokens(t):
            base = re.sub(r"\s*\(.*?\)", "", t["name"])
            toks = [x for x in re.split(r"[\s/]+", base) if len(norm(x)) >= 4 and x not in NOT_TRIALS]
            return toks or [base]

        def in_pdf(t):
            return any(norm(x) in nflat for x in name_tokens(t)) or norm(t["name"]) in nflat

        known_norm = {norm(x) for t in known for x in name_tokens(t)} | {norm(t["name"]) for t in known} | {norm(t["id"]) for t in known}
        all_norm = {norm(x) for t in trials for x in name_tokens(t)} | {norm(t["name"]) for t in trials} | {norm(t["id"]) for t in trials}

        def is_known(tok, pool):
            n = norm(tok)
            return n in pool or any(k.startswith(n) and len(n) >= 5 for k in pool)

        raw = trial_tokens(flat)
        found_tokens = {tok for tok in raw if not is_known(tok, known_norm) and not is_known(tok, all_norm)}
        other_disease = {tok for tok in raw if not is_known(tok, known_norm) and is_known(tok, all_norm)}
        missing_in_pdf = sorted(t["name"] for t in known if not in_pdf(t))
        if found_tokens:
            print(f"   {m['file']}: tokens with no trial entry (check): {', '.join(sorted(found_tokens))}")
        if other_disease:
            print(f"   {m['file']}: named here but filed under another disease: {', '.join(sorted(other_disease))}")
        if missing_in_pdf:
            print(f"   {m['file']}: trials in DB not named in PDF (ok if intentional): {', '.join(missing_in_pdf)}")

    # ---- 4. git ---------------------------------------------------------------------------
    if a.dry_run or a.no_commit:
        print("   (no commit)")
        return
    locks = list((ROOT / ".git").glob("*.lock"))
    if locks and not re.search(r"(^|/)git( |$)", subprocess.run(["ps", "-axo", "command="], capture_output=True, text=True).stdout, re.M):
        # stale locks from a killed git — common in Drive-synced repos; safe when no git process is running
        for lk in locks:
            print(f"   removing stale {lk.relative_to(ROOT)} (no git process is running)")
            lk.unlink()
    if run(["git", "add", "pdfs", "data/onepagers.json", "data/diseases.json"]):
        sys.exit("!! git add failed — fix the repo state and rerun (nothing was committed)")
    status = subprocess.run(["git", "status", "--porcelain", "pdfs", "data/onepagers.json", "data/diseases.json"],
                            cwd=ROOT, capture_output=True, text=True).stdout.strip()
    if not status:
        print("   nothing to commit — site already up to date")
        return
    msg = a.message or ("Sync one-pagers: " + ", ".join(changed) if changed else "Refresh one-pager manifest")
    if run(["git", "commit", "-q", "-m", msg]):
        sys.exit("!! git commit failed — nothing pushed")
    if not a.no_push:
        rc = run(["git", "push"])
        print("   pushed — GitHub Pages redeploys in ~1 minute" if rc == 0 else "   !! push failed — commit is local; run `git push` when online")


if __name__ == "__main__":
    main()
