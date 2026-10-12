# Futbol Krillion

A football trivia game with a shared free daily, 30-second rounds, rarity scoring, pixel-art reveals and optional Unlimited access.

- `web/`: Next.js application, Stripe subscriptions, Supabase email verification and database migrations.
- `pipeline/`: Python football-data preparation and prompt generation.
- `art/`: Artwork generation source.

## Development

Use Node.js 24 or newer. From a fresh checkout:

```sh
cd web
npm ci
cp .env.example .env.development.local
npm run dev -- --port 3100
```

Fill local environment values from your own sandbox configuration. Never commit credentials. The daily remains available without billing configuration. See [web setup](web/README.md) for Stripe, Supabase and email settings.

## Working with Claude Code and Codex

Use a separate clone or Git worktree for each coding agent. Start each change from the latest `main` on a separate branch, such as `claude/gameplay` or `codex/billing`. Open pull requests and review changes before merging. Do not have two agents edit the same checkout or push over each other's branch.

```sh
git clone https://github.com/emrekapancibuilds/futbol-krillion.git
cd futbol-krillion
git switch -c claude/gameplay
```

The repository contains source and public game data only. Runtime credentials, local billing records, database dumps and internal handoff reports stay outside Git. A new clone needs its own ignored environment file.

## Current behavior

This version uses a $4.99 USD monthly Stripe subscription. Supabase verifies the checkout email when restoring a purchase; it creates a passwordless Auth identity only when that flow is requested. Browser progress stays local. Stripe payment status and server-side ownership determine paid access.

The public repository is not an automatic production deployment. Local sandbox verification has covered Checkout, paid access, the Portal, scheduled cancellation and webhook replay. Supabase's default email sender is suitable only for project-team testing; configure custom SMTP before emailing real customers or branding emails.

## Parallel work branches

- `main`: tested monthly subscription and Supabase email restoration.
- `codex/supabase-email`: Codex continuation branch based on `main`.
- `claude/one-time-unlock`: preserved Claude one-time purchase experiment at source snapshot `7daa044`. It has different payment semantics and still needs verified-email restoration; do not merge it wholesale or deploy it as the subscription app.

The owner is choosing between the monthly and one-time models. Keep this decision explicit when opening a payment-related pull request. For general gameplay changes, start a fresh `claude/<task>` branch from `main` instead of the experiment.

## Validation

```sh
cd web
npm run typecheck
npm run lint
npm test
npm run test:e2e
npm run build
```

For tests against an already running local sandbox, use `FK_E2E_REUSE_SERVER=true npm run test:e2e`. Never target production credentials when testing.

The Privacy and Terms pages describe the implementation and should be reviewed before a production launch. No reuse license has been added by this publication; existing ownership and data-source terms still apply.
