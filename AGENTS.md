# Collaboration and scope

Read `README.md`, `web/README.md`, and `web/AGENTS.md` before editing the app.

- Use a separate clone/worktree and a branch for each agent. Do not edit another agent's checkout.
- Fetch `origin/main` before starting. Open a pull request; do not force-push shared branches.
- Keep the daily, original gameplay and local stats working.
- Practice and archive games are owned by an anonymous browser session. Check that ownership on the server; never trust query strings or client storage for it.
- Keep `.env*` (except `.env.example`), credentials, database dumps, cookies, access tokens and customer data out of Git, logs, screenshots and issue bodies.
- Do not reapply database migrations to the existing project. New schema changes need migrations and verification.
- Run typecheck, lint and relevant tests. Browser tests require a local server or start their own on port 3100.
- Public repository updates do not deploy production. Production deployment is separate work.

The game is free: the owner removed payments on November 12, 2026. Unlimited, practice and the daily archive are open to everyone. Don't add billing back unless the owner asks.
