# Production-Ready Build Plan

This is a large scope. I'll execute in phases, verifying each before moving on. Each phase ships a working slice — you can test mid-way.

## Phase 1 — Stripe Checkout end-to-end

The `subscriptions/create` route and `webhooks/stripe` route exist but checkout flow isn't wired into the UI. I'll:

- Add a public `/pricing` page listing active plans with "Subscribe" buttons
- New server fn `createCheckoutSession` that creates a Stripe Checkout Session, applying promo code from `?ref=CODE` query param (stored in cookie/localStorage on landing)
- Success/cancel pages (`/checkout/success`, `/checkout/cancel`)
- Update `webhooks/stripe.ts` to fully handle: `checkout.session.completed` → create customer + subscription rows, attribute affiliate from promo code, then `invoice.paid` → create commission rows for affiliate + manager + sam (multi-level split using `commission_rate` from each ancestor profile)
- Hold period of 30 days on commissions; cleared via cron

## Phase 2 — Admin CRUD with real forms

Currently most admin pages are read-only tables. I'll add working dialogs:

- **Plans**: create/edit (name, description, price, interval, trial days, features) + "Sync to Stripe" button (already implemented in stripe.functions.ts), toggle active, archive
- **Promo Codes**: admin can create platform-wide promos and assign to any affiliate
- **API Keys**: create with one-time secret reveal (hash stored), revoke
- **Users**: change status (active/suspended), change parent, change role, change commission rate
- **Settings**: platform-wide commission defaults stored in a new `app_settings` table

## Phase 3 — Team & hierarchy management

Add `<TeamManagement />` (already scaffolded) to:
- SAM → managers page (invite manager)
- SAM/Manager → affiliates page (invite affiliate)
- Each invite uses existing `createSubordinate` server fn with email + temp password + commission rate

## Phase 4 — Payouts & commission lifecycle

- Server fn `generatePayouts({ periodStart, periodEnd })` (admin only): aggregates `cleared` commissions per beneficiary, creates `payouts` row, marks commissions `paid` with `payout_id`
- Server fn `markPayoutPaid({ payoutId, notes })`: admin marks paid, records timestamp
- Daily cron via pg_cron: clear commissions whose `hold_until < now()`
- Affiliate/manager/sam earnings pages show: pending / cleared / paid totals + history

## Phase 5 — Production hardening

- Rate limiting on public `/api/v1/*` routes (in-memory token bucket per API key, 60 req/min)
- Zod validation everywhere it's missing
- 404 + error boundary pages with retry
- `<NotFound />` for unknown routes
- SEO: titles/meta on every public page (pricing, signup, login)
- Run security linter, fix critical findings
- Disable email confirmation OR add proper resend flow (already disabled per earlier migration)

## Technical notes

- **Stripe webhook signature**: already verified using `STRIPE_WEBHOOK_SECRET` you provided
- **Multi-level commission split**: when an invoice is paid, walk up `parent_user_id` chain from the attributing affiliate. Each ancestor with a `commission_rate` gets a commission row. Sum of rates capped at 30% (DB constraint already enforces per-row max).
- **Cron job**: pg_cron will POST to `/api/public/hooks/clear-commissions` daily at 2 AM with apikey header
- **No new secrets needed** — Stripe keys are already configured

## What I will NOT touch this round

- Email sending (welcome, payout notifications) — would need Lovable Email setup; can add as Phase 6 if you want
- Affiliate marketing materials / landing page builder
- Multi-currency support (USD only for now)
- Refunds workflow (manual via Stripe dashboard for now; webhook will negate commissions on `charge.refunded`)

## Estimated execution

- Phase 1: ~6 file edits + 1 migration
- Phase 2: ~8 dialog components + form server fns
- Phase 3: ~3 page updates
- Phase 4: ~2 server fns + UI + 1 migration for cron
- Phase 5: ~middleware + polish across all public routes

I'll work through them sequentially and report at each phase boundary so you can test the running app.
