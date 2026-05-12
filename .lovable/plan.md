# Phase 2 — Reports, Admin Mgmt, Emails, Notifications

This is a large scope (~40 files, 4 migrations). Building in 4 sequential batches in this single request, integrating with existing schema (no rebuilds).

## Batch A — Reporting & Analytics (real data, no placeholders)

**New server fns** in `src/lib/reports.functions.ts`:
- `getAdminMetrics(range)` → gross/net revenue, MRR, active subs, churn, refund rate, commission liabilities (sum pending), cleared/pending payouts, conversion rate
- `getRevenueTimeseries(range, bucket)` → daily/monthly revenue from `transactions`
- `getTopAffiliates(range, limit)` → join customers→subs→commissions
- `getTopPromoCodes(range)` → from `subscriptions.promo_code_id`
- `getPlanPerformance()` → subs per plan, revenue per plan
- `getSamReport`, `getManagerReport`, `getAffiliateAnalytics` — scoped via `is_ancestor_of` / `auth.uid()`
- `exportCsv(reportName, range)` → returns CSV string

**Pages** (replace placeholders):
- `/admin/reports` — KPI cards, line chart (revenue), bar chart (top affiliates), tables, date range picker, CSV export buttons
- `/sam/reports`, `/manager/reports`, `/affiliate/analytics` — scoped versions
- Use **Recharts** (already in shadcn stack) for all charts

## Batch B — Advanced Admin & Hierarchy

**Server fns** in `src/lib/admin.functions.ts`:
- `updateUserRole`, `updateUserParent`, `updateUserCommissionRate`, `setUserStatus` (active/suspended/disabled), `resetUserPassword` (admin generates link), `getUserAuditHistory(userId)`
- `reassignAffiliate(affiliateId, newManagerId)`, `reassignManager(managerId, newSamId)` — validates hierarchy, writes audit log
- `bulkSetStatus(userIds[], status)`

**UI**:
- `/admin/users/$userId` — full profile page: KPIs, commission history, payout history, subscribers, promo codes, audit timeline
- `<EditUserDialog />` — comprehensive edit (role, parent, rate, status)
- Hierarchy management: replace cards on SAM/Manager team pages with reassignment dialogs (no drag-drop — use "Reassign" button per row, simpler & more reliable)
- Bulk select + bulk action toolbar on user lists

## Batch C — Email Notification System (Resend connector)

**Decision**: Use **Resend** (user explicitly requested). Connect via standard_connectors. Skip Lovable Emails infra.

**New edge function** `supabase/functions/send-email/index.ts`:
- Accepts `{ template, to, data, idempotencyKey }`
- Renders branded HTML templates (inline, no React Email — keep simple & deployable)
- Logs to `email_send_log` table
- Suppression check via `suppressed_emails` table

**Templates** (12 total, all premium dark/light HTML):
1. welcome, 2. password-reset, 3. email-verification, 4. login-alert
5. subscription-created, 6. trial-ending, 7. payment-success, 8. payment-failed, 9. subscription-canceled
10. affiliate-welcome, 11. promo-approved, 12. commission-cleared, 13. payout-sent
14. admin-failed-payout, 15. admin-refund, 16. admin-chargeback, 17. admin-top-affiliate

**Triggers** wired into:
- `handle_new_user` trigger → enqueue welcome
- Stripe webhook → subscription/payment emails
- `clear_due_commissions` → commission-cleared emails
- `markPayoutPaid` → payout-sent
- `createSubordinate` → affiliate-welcome

**Note**: Auth emails (password reset, verification) — Supabase Auth sends defaults; we'll override via `supabase--configure_auth` SMTP using Resend.

## Batch D — Notifications, Subscribers, Search, Polish

**Migration**: new `notifications` table (user_id, type, title, body, link, read_at, created_at) with RLS (own-only).

**UI**:
- `<NotificationBell />` in header — unread badge, dropdown list, realtime via Supabase channel
- `/notifications` full history page
- Insert notifications from server fns (commission cleared, payout sent, refund, etc.)

**Subscriber pages**:
- `/sam/subscribers`, `/manager/subscribers` — table from `customers`+`subscriptions` joined, filtered by ancestor scope
- Search, status/plan filters, CSV export

**Global search**:
- `<GlobalSearch />` cmd-k modal in header
- Server fn `globalSearch(query)` → users/promo_codes/customers/subscriptions (admin-scoped)

**Polish**:
- Skeleton loaders on all data tables
- Empty states with icons + CTA
- Audit-log writes on all admin mutations
- Rate limit `send-email` (10/min/user)

## Migrations
1. `notifications` table + RLS + realtime publication
2. `email_send_log`, `suppressed_emails` tables + RLS
3. Trigger updates for welcome email enqueue
4. Indexes on `transactions(created_at)`, `commissions(beneficiary_id, status)`, `customers(affiliate_id)` for report perf

## Secrets needed
- `RESEND_API_KEY` — will request via add_secret after user confirms

## Out of scope (per your list)
- Drag-drop hierarchy (using button-based reassign — same outcome, more robust)
- React Email components (using HTML strings — works in Deno edge runtime without bundling)
- Auth emails customization beyond Supabase SMTP swap

---

**Confirm to proceed.** This will be ~40 file changes + 4 migrations + 1 secret request, executed in one continuous run.
