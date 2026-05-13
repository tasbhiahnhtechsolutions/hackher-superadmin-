Big alignment pass. I'll execute in 6 ordered phases in this loop. Each phase is independently shippable so the app stays working.

## Phase 1 — Schema migration (single migration)

```text
promo_codes          + campaign_label text, + plan_id uuid (nullable, for plan restriction)
profiles             validation: SAM.parent must be SA; Manager.parent must be SAM; Affiliate.parent must be Manager (trigger)
commissions          + first_paid_invoice_at timestamptz (audit)
validate_promo_code  enforce: discount_percent + sum(commission rates of affiliate+manager+sam in chain) ≤ 30
                     via new fn check_promo_30_rule(affiliate_id, discount_percent)
```

No data destruction. Add hierarchy validation trigger that only fires on INSERT/UPDATE of parent_user_id.

## Phase 2 — RBAC + visibility hardening

- `team-management.tsx`: SAM tab restricted to managers only (already correct via `childRole`); confirm SAM cannot pick `affiliate` directly. Add hierarchy validation in `users.functions.ts` createUser path so parent role matches expected level.
- `promos.functions.ts`: extend create/update permissions to SA, SAM, Manager, Affiliate (currently affiliate-only). Manager/SAM can create codes assigned to any affiliate in their subtree (uses `is_ancestor_of`).
- Commission edit rules in `users.functions.ts updateCommissionRate`: SA→any; SAM→manager+affiliate in subtree; Manager→affiliate in subtree; never self.

## Phase 3 — Trial-paid commission logic

`src/routes/api/public/webhooks/stripe.ts`:
- Move commission-row creation from `checkout.session.completed` / `customer.subscription.created` into `invoice.paid` handler, gated on "first paid invoice for this subscription" (no existing commissions row for `subscription_id`).
- Skip commissions when `invoice.billing_reason === 'subscription_cycle'` already has prior commission OR when amount_paid == 0 (trial).
- Add `charge.refunded` → mark related commissions `voided`.

## Phase 4 — Customer APIs (new endpoints + extend existing)

New routes under `src/routes/api/customer/`:
- `subscription.$id.ts` GET — status, renewal, plan, coupon
- `subscription.cancel.ts` POST — `{subscription_id, immediate?}` → Stripe cancel
- `subscription.reactivate.ts` POST
- `billing.update-payment-method.ts` POST → Stripe billing portal URL
- `invoices.$customerId.ts` GET — list invoices with hosted_invoice_url

Update `coupon.validate.ts` response to include `campaign`, `expiresAt`, `discountPercent` field name (alongside existing `discount` for back-compat).

## Phase 5 — Remove developer portal

- Delete `/api/v1/*` routes (plans, coupons/validate, subscriptions/create) and `src/lib/api-auth.server.ts` API-key checks (keep CORS/json helpers).
- Delete `api_keys` UI in `admin/settings.tsx` (keep table for now; just hide UI).
- Delete `admin/system.tsx` API-key sections if any. Drop nav items.

## Phase 6 — UI restyle to HackHer brand

- `src/styles.css`: replace primary tokens — `--primary: oklch(0.27 0.07 265)` (≈#18294F), `--accent: oklch(0.69 0.16 45)` (≈#E86E3C), neutral surfaces light gray. Reduce border-radius, glow shadows, gradients. Inter as default body font.
- `app-shell.tsx`: tighter sidebar (240px), compact nav rows.
- `page-header.tsx`: smaller padding, no gradient background.
- KPI card components: compact variant. Tables: zebra rows, smaller row height.
- Remove glassmorphism utility classes wherever present.

This phase is broad but token-driven, so most surface area updates automatically.

## Phase 7 — API docs rewrite

Regenerate `/mnt/documents/HackHerAI-API.md` (v2) covering only `/api/customer/*` (no API key), full lifecycle: auth model (none, server-to-server expected), plans, validate coupon, create subscription, status, cancel, reactivate, update payment method, invoices, webhooks reference (what events the platform consumes; what data customer app should expect via its own server polling), error codes, integration examples (Node + curl).

## Risks / call-outs

- Hierarchy trigger may reject existing rows that violate the new constraint. I'll inspect first and only enforce on new writes if existing data is dirty.
- Trial logic change means subscriptions currently "in trial" will get commissions on first paid invoice going forward — historical pending rows untouched.
- UI restyle is the largest visual delta; expect many small follow-ups after you see it.
- I will NOT touch: auth flows, payouts engine, fraud module, email templates content, analytics SQL functions.

Confirm and I'll start with the migration (Phase 1). Phases 2–7 follow in the same loop without further prompts.