# Stripe Billing Migration & Synchronization Architecture Plan

## Objective

To transition the Stripe billing, package management, and influencer/coupon tracking from the Django backend to the Supabase admin panel. Supabase will become the single source of truth for the financial ledger and checkout processes, while Django will solely manage application-level access restrictions (Subscriptions and Invites/Gifts). This plan ensures minimal disruption to the existing codebase while clearly defining the responsibilities of both the Django and Supabase teams.

## User Review Required

> [!IMPORTANT]
> Both the Django and Supabase teams need to review the **S2S API Payload** and **Stripe Metadata** structures defined below to ensure alignment before development begins.

---

## 1. Current Django Architecture (Before Migration)

To ensure both teams understand the existing flow, here is how Django currently manages subscriptions:

- **`Package`**: Defines the available plans (e.g., `squad_plan`) and their limits (`guest_limit`, `host_limit`). Currently stores Stripe Price IDs.
- **`Subscription`**: The core table managing a user's active access. It tracks `start_date`, `end_date`, `status`, and limits allowed for the user.
- **`Gift`**: A critical table that maps "free access" to invited users. If Guest A invites Host B, Host B receives a `Gift` record pointing to Guest A's `Subscription`. **(Must be kept)**.
- **`Payment`**: Stores the invoice history for every transaction.
- **`StripePromotionCoupon`**: Manages promo codes and influencer tracking.

## 2. Deprecation of `Payment` & `StripePromotionCoupon` in Django

**Why we are removing them:**
Since Supabase will now manage the checkout process, the Supabase database will naturally maintain the ledger of all transactions, invoice history, and promo code usage for every user.
Replicating this ledger in Django is redundant and introduces synchronization risks. Django's only concern moving forward is: _"Does this user have an active subscription, and what are their limits?"_
Therefore, `Payment` and `StripePromotionCoupon` will be safely deprecated/removed from Django.

---

## 3. Implementation Steps & Team Coordination

### Step 1: Package Synchronization & Database Cleanup

**Supabase Team:**

- Must ensure that the packages created in Supabase have exact matching names to Django (e.g., `"beta_plan"`, `"squad_plan"`, `"family_plan"`).
- Must store the critical limits (`guest_limit`, `host_limit`) on the Supabase side if required for frontend display.

**Django Team:**

- Keep the `Package` table to act as a local map for limits.
- **Delete** the following obsolete fields from the `Package` model: `stripe_product_id`, `stripe_default_price_id`, and `extra_host_price`.

### Step 2: Checkout Link Generation (Supabase)

**Supabase Team:**
When a user decides to buy a package, the frontend will request a Stripe Checkout session from Supabase (not Django).

> [!TIP]
> **Best Practice:** When creating the Stripe Checkout Session, Supabase should either find the existing Stripe Customer by email or create a new one.

Crucially, Supabase **MUST** attach the following `metadata` to the Stripe Checkout Session / Subscription. This metadata will be returned to Supabase by Stripe upon successful payment.

**Sample Checkout Metadata (Injected by Supabase into Stripe):**

```json
{
  "user_id": "uuid-from-django",
  "email": "user@example.com",
  "role": "host",
  "package_id": "uuid-of-package-in-django",
  "package_name": "squad_plan"
}
```

### Step 3: First Purchase & S2S Webhook (Supabase -> Django)

**Supabase Team:**

1. Stripe triggers the `invoice.payment_succeeded` webhook to Supabase.
2. Supabase reads the metadata, records the payment in its own ledger, and processes any influencer coupons.
3. Supabase then makes a secure Backend-to-Backend (S2S) API call to Django to activate the user's subscription.

**Django Team:**
Create a new secured endpoint (e.g., `POST /api/host/sync-subscription/`) that accepts requests exclusively from Supabase.

**Sample S2S Payload (Supabase sends to Django):**

```json
{
  "user_id": "uuid-from-django",
  "email": "user@example.com",
  "role": "host",
  "package_name": "squad_plan",
  "stripe_subscription_id": "sub_12345",
  "status": "active",
  "start_date": "2026-06-19T10:00:00Z",
  "end_date": "2026-07-19T10:00:00Z"
}
```

Django will use this payload to either create a new `Subscription` or update the existing one for the given `user_id`. It will fetch the `guest_limit` and `host_limit` from its local `Package` table based on `package_name`.

### Step 4: Recurring Payments & Renewals

**Supabase Team:**

1. At the end of the billing cycle, Stripe auto-charges the user.
2. Stripe sends `invoice.payment_succeeded` to Supabase.
3. Supabase extracts the metadata (which is permanently attached to the Stripe Subscription) and logs the new invoice in the Supabase ledger.
4. Supabase sends the **exact same S2S payload** (from Step 3) to Django, but with the updated `start_date` and `end_date`.

**Django Team:**

1. The S2S endpoint receives the payload.
2. Django looks up the `Subscription` by `user_id` and simply extends the `start_date` and `end_date`.
3. Django does **not** insert anything into a `Payment` table (since it's deleted). The access simply remains active.

---

## Verification Plan

### Automated / Postman Testing

- Supabase team should simulate a webhook call to Django's `sync-subscription` endpoint using the exact JSON payload structure above.

### Manual Verification

- Execute a full E2E flow: Buy a package via the Supabase checkout URL.
- Verify the invoice appears in the Supabase admin panel.
- Verify the `Subscription` table in Django successfully updates `start_date`, `end_date`, and `status`.
- Verify the user can immediately access premium features and invite guests (confirming the `Gift` table pairing still functions flawlessly).
