# Collaboration and scope

Read `README.md`, `web/README.md`, and `web/AGENTS.md` before editing the app.

- Use a separate clone/worktree and a branch for each agent. Do not edit another agent's checkout.
- Fetch `origin/main` before starting. Open a pull request; do not force-push shared branches.
- Keep the free daily, original gameplay and local stats working when changing billing.
- Stripe is in test mode for development. Payment status and ownership must be checked server-side.
- Verify Supabase email identity on the server. Never grant access from query strings, client storage, decoded-but-unverified JWTs or editable user metadata.
- Keep `.env*` (except `.env.example`), credentials, database dumps, cookies, access tokens and customer data out of Git, logs, screenshots and issue bodies.
- Do not reapply database migrations to the existing project. New schema changes need migrations and verification.
- Run typecheck, lint and relevant tests. Browser tests require a local server or start their own on port 3100.
- Public repository updates do not deploy production. Production deployment and live billing are separate work.

For billing-model changes, check with the owner before replacing the monthly subscription with a one-time purchase. Another local Claude experiment has used a one-time unlock; it must not be merged blindly into this subscription implementation.
