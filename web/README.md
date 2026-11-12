# Web application setup

Use Node.js 24 or newer and run commands from `web/`. The game uses Next.js, React and Supabase.

```sh
npm ci
# Fresh clone only: do not overwrite an existing local settings file.
cp .env.example .env.development.local
npm run dev -- --port 3100
```

## Environment

Set `NEXT_PUBLIC_APP_URL` to the exact local or deployed origin. `NEXT_PUBLIC_SITE_URL` is supported as a fallback. Generate independent random values of at least 32 characters for `GAME_SECRET` and `APP_SECURITY_SECRET`.

- `SUPABASE_URL`: your project's URL.
- `SUPABASE_SERVICE_ROLE_KEY`: server-only service role/secret key for the private session and game tables.

Secrets must never use the `NEXT_PUBLIC_` prefix. Do not commit `.env.development.local`. The daily and Unlimited work without a database; practice and the archive answer 503 until Supabase is configured.

## Database

The schema is in `supabase/migrations/`. Apply the migrations in order once to a new Supabase project using its supported migration tooling. Do not reapply it to a project where it is already recorded.

All `fk_*` tables are server-only with RLS enabled and no anon/authenticated grants. Browser sessions (`fk_sessions`) and practice and archive games (`fk_games`) are what the game uses. The purchase, checkout and webhook tables are left over from the paid period (payments were removed on November 12, 2026) and nothing reads them.

## Verification

```sh
npm run typecheck
npm run lint
npm test
npm run test:e2e
npm run build
```

Browser tests start a server on port 3100. To test an existing local server, use `FK_E2E_REUSE_SERVER=true npm run test:e2e`. The session and game unit tests use offline fixtures and PGlite. Browser tests cover original gameplay, Unlimited, the archive and that no payment UI is left. A fresh build downloads the existing Google Fonts.

Deploy the `web/` directory. Publishing Git commits does not deploy the site.

## Game data

The packaged schedule currently ends on November 1, 2026. A frozen valid prompt pool supplies deterministic dailies afterward. Preserve already served dates and that pool when regenerating data. Runtime answer data is loaded only by server routes; the public source repository includes the datasets for development.
