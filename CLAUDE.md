# Claude Code collaboration

This branch preserves Claude's one-time-unlock work as of source commit `7daa044`. Work in this separate clone/worktree; Codex has a different checkout. Use commits and pull requests to share changes.

The owner has been asked to choose monthly versus one-time billing. Until resolved, preserve both versions and do not merge the payment implementations automatically. Main has working Supabase email verification; this branch must verify email ownership before restoring a purchase. Merely typing an email must never grant premium access.

Do not deploy this experimental branch, expose runtime keys, or push over another agent's branch. Read `AGENTS.md` and `web/AGENTS.md` before changes.
