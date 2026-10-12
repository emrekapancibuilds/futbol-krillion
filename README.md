# Futbol Krillion — Claude one-time purchase work

This branch preserves the separate Claude implementation at source commit `7daa044`: a one-time $4.99 unlock, the personal Unlimited pitch, Privacy/Terms, and a placeholder refund page. It is a work-in-progress alternative to `main`, which contains the tested monthly Stripe subscription and Supabase-verified restoration.

No production deployment is connected to this branch. Settle the billing model with the owner before merging. This snapshot's restore-by-email endpoint does not verify ownership of that email; transplant the Supabase verification flow from `main` before using it with customer purchases. Also reconcile refund revocation, archive behavior, schema and tests deliberately. Do not merge the payment routes automatically.

For Claude Code:

```sh
git clone --branch claude/one-time-unlock https://github.com/emrekapancibuilds/futbol-krillion.git
cd futbol-krillion
cd web
npm ci
cp .env.example .env.development.local
npm run dev -- --port 3200
```

Use a separate checkout and branch for each coding agent. Keep changes in pull requests. Runtime credentials are intentionally excluded; obtain them through local configuration, never commits or chat. `main` remains the integration reference for Supabase email identity, private billing records and payment verification.
