# Skills

Mirrors of the Claude skills that drive this site. **The canonical copies live in claude.ai
(Settings → Skills)** and sync to `~/.claude/skills/synced/…` on each machine; these files are
snapshots for version history and for re-uploading if a skill is ever lost.

- `cancer-one-pager/` — builds a one-pager PDF and publishes it here (PDF + its trials).
- `add-trial/` — files trials into `data/trials.json` with abstract-checked numbers.

To refresh these mirrors after editing a skill in claude.ai:

```bash
cp ~/.claude/skills/synced/*/add-trial/SKILL.md skills/add-trial/
cp ~/.claude/skills/synced/*/cancer-one-pager/SKILL.md skills/cancer-one-pager/
```
