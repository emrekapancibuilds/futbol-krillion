# One-time unlock development snapshot

See the repository README and `CLAUDE.md`. This branch is preserved source work, not the deployed app or a production-ready payments implementation. The `main` branch contains the Supabase email-verification integration and its tests.

Use Node.js 24 or newer. Configure a test Stripe key and a random server game secret in an ignored local environment file. Do not use live keys while developing. Run `npm run typecheck`, `npm run lint`, `npm test` and `npm run build` when changing the app.
