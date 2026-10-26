#!/bin/bash
# Push any commits Claude (or you) made in the hemeonc repo. Run by a launchd agent every
# 60 seconds; safe to run by hand. Never commits, never merges, never force-pushes — it only
# ships commits that are strictly ahead of origin, so a divergence is left for a human.
#
# launchd can't run this directly: macOS denies a plain launchd /bin/bash access to the Google
# Drive mount (exit 126). The agent instead runs `open -g ~/Applications/HemeOnc Autopush.app`,
# an osacompile applet that was granted Drive access once and just calls this file. Edit this
# script freely; recompiling the applet changes its signature and needs a fresh Allow click.
REPO="/Users/shankaraanand/Library/CloudStorage/GoogleDrive-shankara.k.anand@gmail.com/My Drive/Personal/projects/hemeonc"
LOG="$HOME/Library/Logs/hemeonc-autopush.log"
# Fail rather than wait for a credential prompt: a hung run keeps the applet open, and `open`
# then ignores every later launch.
export GIT_TERMINAL_PROMPT=0

cd "$REPO" 2>/dev/null || exit 0
git rev-parse --git-dir >/dev/null 2>&1 || exit 0

# Garbage-collect lock files a Cowork sandbox could not unlink (Drive mounts refuse unlink
# but allow rename, so publish.py moves them into .git/.stale-locks for us to delete here).
rm -rf .git/.stale-locks 2>/dev/null
find .git -maxdepth 3 \( -name '*.lock' -o -name '*.lock.junk*' \) -mmin +5 -delete 2>/dev/null

# Nothing local to ship? Cheapest possible exit — no network call.
git rev-list --count @{u}..HEAD >/dev/null 2>&1 || exit 0
[ "$(git rev-list --count @{u}..HEAD 2>/dev/null)" = "0" ] && exit 0

git fetch -q origin 2>/dev/null
AHEAD=$(git rev-list --count @{u}..HEAD 2>/dev/null || echo 0)
BEHIND=$(git rev-list --count HEAD..@{u} 2>/dev/null || echo 0)

if [ "$AHEAD" -gt 0 ] && [ "$BEHIND" -eq 0 ]; then
  if git push -q origin HEAD 2>>"$LOG"; then
    echo "$(date '+%F %T')  pushed $AHEAD commit(s)" >> "$LOG"
  else
    echo "$(date '+%F %T')  push FAILED (see above)" >> "$LOG"
  fi
elif [ "$BEHIND" -gt 0 ]; then
  echo "$(date '+%F %T')  diverged: ahead $AHEAD, behind $BEHIND — not pushing, resolve by hand" >> "$LOG"
fi
