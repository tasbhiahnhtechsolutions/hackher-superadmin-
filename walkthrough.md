# Walkthrough: Django & Supabase Stripe Billing Integration

This document walks through the complete integration of the Supabase-based Affiliate Portal checkout flow with the Django backend system.

---

## 1. Database Migrations

To record and sync the Django User IDs, package information, and subscription records, we created the following database migration:
👉 **[20260701150000_add_django_sync_fields.sql](file:///home/jawad/Desktop/hackher%20superadmin%20panel/affiliate-nexus/supabase/migrations/20260701150000_add_django_sync_fields.sql)**

### Columns Added:

- **`public.customers`**:
  - `django_user_id` (UUID): Maps the Django User ID to our local affiliate customer row.
- **`public.subscriptions`**:
  - `django_package_id` (UUID): The associated Django Package/Plan ID.
  - `django_package_name` (TEXT): The name of the Django Package (e.g. `squad_plan`).

---

## 2. API: Create Checkout Session

We updated the endpoint `/api/customer/subscription/create` to process incoming secure JWT tokens from WordPress/Django, find or create the corresponding customer, and initiate the Stripe Checkout session with the exact required metadata.

- **File Location:** [subscription.create.ts](file:///home/jawad/Desktop/hackher%20superadmin%20panel/affiliate-nexus/src/routes/api/customer/subscription.create.ts)
- **JWT Decoding Secrets:**
  - If `role` is `host`: decoded using `DJANGO_HOST_JWT_SECRET` key.
  - If `role` is `guest`: decoded using `DJANGO_GUEST_JWT_SECRET` key.

### Sample Request:

`POST https://<affiliate-domain>/api/customer/subscription/create`

```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjYzYjc3NGE3LTQwNDYtNGRiMS05MTY4LTdiYjgyZTZjMjUzNCIsImVtYWlsIjoicGF3ZWc1MjM3NkBjZXhjaC5jb20ifQ...",
  "role": "guest",
  "stripePriceId": "price_1Nu8X...",
  "packageName": "squad_plan",
  "packageId": "63b774a7-4046-4db1-9168-7bb92e6c2534",
  "coupon": "PROMO50",
  "success_url": "https://hackherapp.ai/success",
  "cancel_url": "https://hackherapp.ai/cancel"
}
```

### Sample Response:

```json
{
  "checkout_url": "https://checkout.stripe.com/c/pay/cs_test_...",
  "customer_id": "supabase-customer-uuid",
  "session_id": "cs_test_..."
}
```

---

## 3. Webhook: Stripe S2S Synchronization

We updated the Stripe webhook endpoint to capture checkout completion, subscription status changes, and cancellations. It processes these updates and forwards them to Django's S2S sync endpoint securely.

- **File Location:** [stripe.ts](file:///home/jawad/Desktop/hackher%20superadmin%20panel/affiliate-nexus/src/routes/api/public/webhooks/stripe.ts)
- **Automatic Plan Stubbing:** If a plan does not exist in our local `plans` table for the matching Stripe Price ID, we automatically insert a stub plan. This guarantees that foreign key constraints on the `subscriptions` table never fail during external checkout processing.

### Triggering Events:

- `checkout.session.completed` (Immediate activation)
- `customer.subscription.updated` / `customer.subscription.created` (Recurring payment / status renewal)
- `customer.subscription.deleted` (Immediate cancellation / expiration)

### Sample S2S Payload (Sent by Supabase to Django):

`POST https://api.hackherapp.ai/internal/v1/sync-subscription/`
**Headers:**

- `Content-Type: application/json`
- `Authorization: Bearer <DJANGO_S2S_SECRET>`

```json
{
  "user_id": "63b774a7-4046-4db1-9168-7bb92e6c2534",
  "email": "paweg52376@cexch.com",
  "role": "guest",
  "package_id": "63b774a7-4046-4db1-9168-7bb92e6c2534",
  "package_name": "squad_plan",
  "stripe_subscription_id": "sub_12345",
  "status": "active",
  "start_date": "2026-07-01T14:47:00.000Z",
  "end_date": "2026-08-01T14:47:00.000Z",
  "cancel_at_period_end": false
}
```

---

## 4. Environment Variables Configured

Configure the following values in the local environment and in Netlify:

- `DJANGO_HOST_JWT_SECRET`: Signing secret for host user tokens.
- `DJANGO_GUEST_JWT_SECRET`: Signing secret for guest user tokens.
- `DJANGO_API_URL`: Root URL of the Django production backend.
- `DJANGO_S2S_SECRET`: Bearer token to authorize S2S requests.
