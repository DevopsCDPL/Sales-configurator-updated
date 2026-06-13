# SWGPLAY — Project Memory Backup

Portable, git-committed copy of the assistant's persistent project memory.
Purpose: if the chat/model is ever lost, paste the contents of these files into
a new chat (any model) to restore full project context.

## How to resume in a new chat
1. Open a new chat **inside this same Cowork project** — the live memory files
   are loaded automatically; you usually don't need these backups at all.
2. If starting fresh / different tool: paste `pending-development.md` and
   `gap-log.md` first (most volatile), then `configurator-project.md`.
3. The REAL source of truth is the git history of this repo — every feature is
   a commit. `git log --oneline` shows the full build trail.

## Files
- configurator-project.md — repo path, architecture, key decisions, build state
- pending-development.md — build queue, done-log, parked items, standing rules
- gap-log.md — G1..G27 gap/issue log (say "show all gaps" to review)
- token-model-economy.md — model-routing & token-discipline policy
- (see also docs/calc-validation-report.md and docs/capacity-traveler-design.md)

Last synced from live memory: 2026-06-14
