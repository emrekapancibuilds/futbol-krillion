# Web application setup

Use Node.js 24 or newer and run commands from `web/`. The game uses Next.js, React, Stripe Checkout and Supabase.

```sh
npm ci
# Fresh clone only: do not overwrite an existing local settings file.
cp .env.example .env.development.local
npm run dev -- --port 3100
```

## Environment

Set `NEXT_PUBLIC_APP_URL` to the exact local or deployed origin. `NEXT_PUBLIC_SITE_URL` is supported as a fallback. Generate independent random values of at least 32 characters for `GAME_SECRET` and `APP_SECURITY_SECRET`.

- `SUPABASE_URL`: your project's URL.
- `SUPABASE_SERVICE_ROLE_KEY`: server-only service role/secret key for private billing tables.
- `SUPABASE_PUBLISHABLE_KEY`: publishable key for the separate Auth verification client.
- `STRIPE_MODE=test`: use sandbox mode while developing.
- `STRIPE_SECRET_KEY`: matching `sk_test_…` key.
- `STRIPE_PRICE_ID`: active $7.99 USD non-recurring one-time price in that sandbox.
- `STRIPE_WEBHOOK_SECRET`: signing secret from your local listener or deployment's endpoint.
- `STRIPE_AUTOMATIC_TAX=false`: leave disabled until business/tax settings are deliberately configured.

Secrets must never use the `NEXT_PUBLIC_` prefix. Do not commit `.env.development.local`. The free daily works without billing configuration; paid endpoints fail closed.

## Database

The schema is in `supabase/migrations/`. Apply the migrations in order once to a new Supabase project using its supported migration tooling. Do not reapply it to a project where it is already recorded.

All `fk_*` tables are server-only with RLS enabled and no anon/authenticated grants. `fk_purchase_entitlements` is an invoker view. RPCs enforce atomic ownership, single-use recovery and synchronization locks. Do not expose these records to browser clients or add broad Auth-user policies.

## Stripe Checkout and webhooks

Checkout uses a $7.99 USD one-time payment with standard hosted Checkout (`managed_payments.enabled=false`). The client cannot choose the price or claim premium access. The server verifies the exact price, amount, currency, customer and successful captured PaymentIntent. Access has no renewal or expiry date. A full refund revokes it; an open/lost dispute suspends it; a won dispute restores it. Partial refunds keep access. View receipt opens only a receipt owned by the current browser.

One-time purchases are stored separately in `fk_purchases`; the earlier subscription tables remain as historical records. A legacy subscription does not become a permanent unlock. No live subscription migration is performed by this change.

```sh
stripe listen --forward-to localhost:3100/api/stripe/webhook
```

Authenticate the CLI to the same sandbox and save its signing secret locally. Subscribe deployed test endpoints to:

```text
checkout.session.completed
checkout.session.async_payment_succeeded
checkout.session.async_payment_failed
charge.refunded
charge.dispute.created
charge.dispute.updated
charge.dispute.closed
customer.updated
```

Signatures are checked on the raw body. Events are deduplicated after transactional processing. Concurrent updates to the same customer return a retryable error; Stripe retries deployed webhooks. When testing with CLI forwarding, replay failed deliveries after the lock is released. Checkout confirmation also retrieves authoritative billing state.

## Supabase email verification

Enable email authentication in Supabase. For local testing:

- Site URL: `http://localhost:3100`
- Redirect allowlist: `http://localhost:3100/billing/restore?request=*`

Use the equivalent exact HTTPS origin and callback path for a deployment. Do not add arbitrary redirect hosts.

Restore Purchase calls Supabase's passwordless email flow. It creates an Auth identity if the email is new, but playing or purchasing does not require signing up. The default Supabase sender only delivers to project-team addresses. Configure custom SMTP for real customer delivery. New Free projects also need custom SMTP to customize email templates.

The emailed link contains a single-use 15-minute request nonce and returns a Supabase proof in the URL fragment. The callback immediately clears both query and fragment, keeps the proof only in memory, discards the refresh token, and waits for the user's Restore action. The server verifies the token with `auth.getUser`, requires a confirmed email matching the request, retrieves the current Stripe payment email, and atomically restores access while rotating the app's HttpOnly cookie. Neither the nonce nor a client-side claim grants access alone. No Supabase session is stored in localStorage.

Request responses do not reveal whether the address purchased. Restoration restores billing access, not local scores, streaks or progress.

Docs: [Supabase passwordless email](https://supabase.com/docs/guides/auth/auth-email-passwordless), [SMTP restrictions](https://supabase.com/docs/guides/auth/auth-smtp).

## Verification

```sh
npm run typecheck
npm run lint
npm test
npm run test:e2e
npm run build
```

Browser tests start a server on port 3100. To test an existing local sandbox server, use `FK_E2E_REUSE_SERVER=true npm run test:e2e`. Billing/database unit tests use offline fixtures and PGlite. Browser tests cover original gameplay, paywalls, callback token handling, archive isolation and one-time purchase UI. A fresh build downloads the existing Google Fonts.

Before a production launch, complete inbox delivery/restoration, configure SMTP and live Stripe settings, review policies, and deploy the `web/` directory. Publishing Git commits does not deploy the site.

## Game data

The packaged schedule currently ends on November 1, 2026. A frozen valid prompt pool supplies deterministic dailies afterward. Preserve already served dates and that pool when regenerating data. Runtime answer data is loaded only by server routes; the public source repository includes the datasets for development.
