# Futkrill

A free football trivia game with a shared daily, 30-second rounds, rarity scoring, pixel-art reveals, Unlimited sets and a daily archive.

- `web/`: Next.js application and the Supabase migrations for practice and archive games.
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

Fill local environment values from your own configuration. Never commit credentials. The daily and Unlimited work without a database; practice and the archive need Supabase. See [web setup](web/README.md).

## Working with Claude Code and Codex

Use a separate clone or Git worktree for each coding agent. Start each change from the latest `main` on a separate branch, such as `claude/gameplay` or `codex/archive`. Open pull requests and review changes before merging. Do not have two agents edit the same checkout or push over each other's branch.

```sh
git clone https://github.com/emrekapancibuilds/futbol-krillion.git
cd futbol-krillion
git switch -c claude/gameplay
```

The repository contains source and public game data only. Runtime credentials, database dumps and internal handoff reports stay outside Git. A new clone needs its own ignored environment file.

## Current behavior

Everything is free: the daily, Unlimited, practice and the daily archive. The owner removed payments on November 12, 2026 (Stripe, the unlock pitch, restore and the refund page are gone; `/refunds` and `/billing/*` redirect). Browser progress stays local. Practice and archive games are stored per anonymous browser session in Supabase. The database still holds the purchase records from the paid period (`fk_purchases` and related tables); nothing reads them any more.

The public repository is not an automatic production deployment. Start new Claude work from the latest `main` on a fresh `claude/<task>` branch.

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
