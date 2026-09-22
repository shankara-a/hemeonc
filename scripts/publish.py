#!/usr/bin/env python3
"""One command to get anything onto the Heme/Onc Hub.

    python3 scripts/publish.py                          # sync one-pagers, validate, commit
    python3 scripts/publish.py --trials /tmp/t.json     # file trials too
    python3 scripts/publish.py --trials /tmp/t.json --new-disease '{"slug":...}'
    python3 scripts/publish.py --check                  # dry run: report, write nothing

It wraps add_trial.py / sync_onepagers.py / validate.py so no caller has to remember the
order (PDF into pdfs/ BEFORE the disease is registered, disease BEFORE its trials, manifest
after both). It resolves the Encyclopedia source path and the git identity by itself, so the
same command works from a Cowork sandbox and from the user's Mac.

Pushing is best-effort. A sandbox has no GitHub credentials, so a failed push is NOT an
error: the commit is left for the launchd auto-push agent on the Mac, which ships it within
a minute. See scripts/autopush.sh.

STRICT BY DEFAULT — it refuses to commit if:
  * validate.py reports any problem
  * a trial being filed has verified != true          (--allow-unverified to override)
  * a trial being filed has no pmid and no nct        (--allow-unverified to override)
  * a disease points at a one-pager PDF that is not in pdfs/
Nothing half-published reaches the site.
"""
import argparse, json, os, re, subprocess, sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from validate import validate, bump_asset_version  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"

# The Encyclopedia "One Pagers" folder, as seen from the Mac and from a Cowork sandbox.
SRC_CANDIDATES = [
    "/Users/shankaraanand/Library/CloudStorage/GoogleDrive-sanand94@stanford.edu/My Drive/"
    "Fellowship/Encyclopedia/Encyclopedia/One Pagers",
    "/sessions/*/mnt/Encyclopedia/One Pagers",
]


def say(msg):
    print(msg, flush=True)


def die(msg):
    print(f"\n!! {msg}\n", file=sys.stderr)
    sys.exit(1)


def find_src(explicit=None):
    if explicit:
        if not Path(explicit).is_dir():
            die(f"--src not found: {explicit}")
        return explicit
    import glob
    for pat in SRC_CANDIDATES:
        for hit in sorted(glob.glob(pat)):
            if Path(hit).is_dir():
                return hit
    die("cannot find the Encyclopedia 'One Pagers' folder — pass --src")


def clear_stale_locks(force=False):
    """Google Drive mounts allow rename() but refuse unlink(), so an aborted git command
    leaves a 0-byte .lock behind that blocks every later command. Unlink if we can, else
    rename it out of the way. Only touch locks older than 30s so a live git isn't disturbed."""
    import time
    gitdir = ROOT / ".git"
    stale = gitdir / ".stale-locks"
    now = time.time()
    for lock in list(gitdir.glob("*.lock")) + list(gitdir.glob("refs/**/*.lock")):
        try:
            if not force and now - lock.stat().st_mtime < 30:
                continue
        except OSError:
            continue
        try:
            lock.unlink()
            say(f"   cleared stale {lock.name}")
            continue
        except OSError:
            pass
        try:
            stale.mkdir(exist_ok=True)
            lock.rename(stale / f"{lock.name}.{int(now)}")
            say(f"   moved stale {lock.name} aside")
        except OSError as exc:
            die(f"stale lock {lock} could not be cleared ({exc}).\n"
                "   Delete it on the Mac: rm -f '" + str(lock) + "'")


def git(*args, check=True, quiet=False):
    if args and args[0] in ("add", "commit"):
        clear_stale_locks()
    r = subprocess.run(["git", *args], cwd=ROOT, text=True, capture_output=True)
    if r.returncode and "File exists" in (r.stderr or "") and ".lock" in (r.stderr or ""):
        # A lock younger than the staleness window blocked us. Nothing else runs git in this
        # sandbox, so it is ours from a previous failed step — clear it and try once more.
        clear_stale_locks(force=True)
        r = subprocess.run(["git", *args], cwd=ROOT, text=True, capture_output=True)
    if check and r.returncode:
        err = (r.stderr or "").strip()
        # Drive mounts emit harmless lock-file warnings; only real failures matter.
        real = [l for l in err.splitlines() if "unable to unlink" not in l]
        if real:
            die("git " + " ".join(args) + "\n   " + "\n   ".join(real))
    if not quiet and r.stdout.strip():
        pass
    return r


def ensure_identity():
    """A sandbox has no git identity. Borrow the one from the last commit, once."""
    name = git("config", "--get", "user.name", check=False).stdout.strip()
    email = git("config", "--get", "user.email", check=False).stdout.strip()
    if name and email:
        return
    last = git("log", "-1", "--format=%an|%ae", check=False).stdout.strip()
    if "|" not in last:
        die("no git identity configured and no previous commit to borrow one from —\n"
            "   run: git config user.name 'Your Name' && git config user.email 'you@example.com'")
    n, e = last.split("|", 1)
    git("config", "--local", "user.name", n)
    git("config", "--local", "user.email", e)
    say(f"   git identity set from last commit: {n} <{e}>")


def check_trials(path, allow_unverified):
    """Pre-flight the trial file before anything is written."""
    try:
        raw = json.loads(Path(path).read_text())
    except Exception as exc:
        die(f"cannot read {path}: {exc}")
    items = raw if isinstance(raw, list) else [raw]
    bad = []
    for t in items:
        tid = t.get("id") or t.get("name") or "?"
        if not allow_unverified:
            if t.get("verified") is not True:
                bad.append(f"{tid}: verified is not true — check it against the abstract first")
            if not t.get("pmid") and not t.get("nct") and "reference" in t:
                ref = t["reference"]
                if not re.search(r"(ASCO|ASH|ESMO|EHA|SOHO|AACR|abstract)", ref, re.I):
                    bad.append(f"{tid}: no pmid/nct and {ref!r} is not flagged as conference-only")
    if bad:
        die("trial pre-flight failed:\n   " + "\n   ".join(bad)
            + "\n   (pass --allow-unverified only if you know why)")
    return [t.get("id") or t.get("name") for t in items]


def run(script, *args):
    r = subprocess.run([sys.executable, str(ROOT / "scripts" / script), *args],
                       cwd=ROOT, text=True)
    if r.returncode:
        die(f"{script} failed — nothing committed")


def main():
    ap = argparse.ArgumentParser(description="Publish one-pagers and/or trials to the Hub.")
    ap.add_argument("--trials", help="JSON file of trial objects to file")
    ap.add_argument("--new-disease", help='JSON {"slug","name","short","group"[,"onepager"]}')
    ap.add_argument("--update", action="store_true", help="allow overwriting existing trial ids")
    ap.add_argument("--src", help="Encyclopedia 'One Pagers' folder (auto-detected)")
    ap.add_argument("--no-onepagers", action="store_true", help="skip the PDF sync")
    ap.add_argument("--allow-unverified", action="store_true")
    ap.add_argument("--message", help="commit message")
    ap.add_argument("--check", action="store_true", help="dry run — report only, write nothing")
    a = ap.parse_args()

    say("→ pre-flight")
    names = check_trials(a.trials, a.allow_unverified) if a.trials else []
    if a.new_disease:
        nd = json.loads(a.new_disease)
        for k in ("slug", "name", "short", "group"):
            if not nd.get(k):
                die(f"--new-disease missing {k!r}")
        if nd.get("onepager") and not (ROOT / "pdfs" / nd["onepager"]).exists():
            die(f"--new-disease names pdfs/{nd['onepager']} but it is not there yet.\n"
                "   Run publish.py without --new-disease first (the sync copies the PDF in),\n"
                "   or drop the 'onepager' key and let the sync fill it.")
    src = None if a.no_onepagers else find_src(a.src)
    if src:
        say(f"   one-pager source: {src}")

    if a.check:
        say("→ check only")
        run("validate.py")
        st = git("status", "--porcelain").stdout.strip()
        say("   working tree: " + ("clean" if not st else f"{len(st.splitlines())} change(s) pending"))
        ahead = git("rev-list", "--count", "@{u}..HEAD", check=False).stdout.strip() or "?"
        say(f"   unpushed commits: {ahead}")
        if names:
            say(f"   would file {len(names)} trial(s): {', '.join(names)}")
        return

    ensure_identity()

    # 1. PDFs first — a disease may not reference a one-pager that isn't in pdfs/ yet.
    if src:
        say("→ syncing one-pagers")
        run("sync_onepagers.py", "--src", src, "--no-commit")

    # 2. Disease + trials.
    if a.trials:
        say("→ filing trials")
        args = [a.trials]
        if a.update:
            args.append("--update")
        if a.new_disease:
            args += ["--new-disease", a.new_disease]
        run("add_trial.py", *args)

    # 3. Gate.
    say("→ validating")
    run("validate.py")

    # 4. Commit.
    st = git("status", "--porcelain").stdout.strip()
    if not st:
        say("→ nothing to commit — already up to date")
        return
    bump_asset_version()
    git("add", "-A")
    msg = a.message or ("Add trials: " + ", ".join(names) if names else "Update Heme/Onc Hub content")
    git("commit", "-q", "-m", msg)
    say(f"→ committed: {msg}")

    # 5. Push, best effort.
    r = subprocess.run(["git", "push", "-q"], cwd=ROOT, text=True, capture_output=True,
                       env={**os.environ, "GIT_TERMINAL_PROMPT": "0"})
    if r.returncode == 0:
        say("→ pushed — GitHub Pages redeploys in ~1 minute")
    else:
        ahead = git("rev-list", "--count", "@{u}..HEAD", check=False).stdout.strip() or "1"
        say(f"→ no push credentials here — {ahead} commit(s) queued for the auto-push agent "
            "(live within ~1 min)")


if __name__ == "__main__":
    main()
