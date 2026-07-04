# Step-by-Step Coupon & Webhook Testing Guide

This guide details how to verify the promo code per-customer limits and Stripe-hosted manual coupon entry workflows from end to end.

---

## Step 1: Run Database Migration
Make sure your Supabase local or staging database schema is updated. Go to the **Supabase Dashboard -> SQL Editor** and execute the following query:

```sql
ALTER TABLE public.promo_codes
ADD COLUMN limit_per_customer INTEGER DEFAULT NULL;
```

---

## Step 2: Create a Promo Code in the Admin Panel
1. Open your Admin Panel application in the browser (usually running on `http://localhost:8080`).
2. Go to the **Promo Codes** manager page.
3. Click **Create Promo Code** and fill out the details:
   - **Code**: `TEST50`
   - **Discount**: `50` (representing 50%)
   - **Affiliate**: Choose an active affiliate user from the dropdown list.
   - **Limit per customer**: Set this to `1` (to test the one-time limit enforcement).
4. Save the promo code.
5. Log into your **Stripe Dashboard (Test Mode)** and go to **Payments -> Coupons** to confirm that the `TEST50` coupon and its corresponding Promotion Code have been successfully synced.

---

## Step 3: Start your Webhook Listener
To test commission distribution and attribution locally, Stripe needs to be able to send webhook events to your running app:

* **Stripe CLI Method**:
  Run this command in a new terminal window:
  ```bash
  stripe listen --forward-to localhost:8080/api/public/webhooks/stripe
  ```
  Copy the webhook signing secret (it looks like `whsec_...`) printed in the terminal, add it to your `.env` as `STRIPE_WEBHOOK_SECRET`, and restart your `npm run dev` server.

---

## Step 4: Run JWT Generator Script
We will use the script `generate_tokens.js` to create valid tokens for subscription requests:

1. Open a new terminal and run:
   ```bash
   node generate_tokens.js
   ```
2. Note down the generated JWT token and the printed `curl` commands.

---

## Step 5: Test the Checkout Flows

### Scenario A: Pre-applied Coupon (Tarika 1)
To test checkout where the coupon is pre-applied before redirection:

1. Execute the following `curl` command (replacing placeholders with values from `generate_tokens.js` output):
   ```bash
   curl -X POST http://localhost:8080/api/customer/subscription/create \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer <GENERATED_JWT_TOKEN>" \
     -d '{
       "coupon": "TEST50"
     }'
   ```
2. Open the returned `checkout_url` in your browser.
3. Confirm that the **50% discount** is already applied on the page.
4. Complete the checkout using Stripe test credentials:
   - **Card Number**: `4242 4242 4242 4242`
   - **Expiry**: `12/34`
   - **CVC**: `123`

---

### Scenario B: Manual Coupon Entry on Stripe Page (Tarika 2)
To test checkout where the user enters the coupon directly on the Stripe Hosted Checkout page:

1. Execute the `curl` command *without* passing the coupon field in the body:
   ```bash
   curl -X POST http://localhost:8080/api/customer/subscription/create \
     -H "Authorization: Bearer <GENERATED_JWT_TOKEN>"
   ```
2. Open the returned `checkout_url` in your browser.
3. Note that the **Add promotion code** field is visible on the Stripe checkout form.
4. Type `TEST50` and apply it.
5. Complete payment using the same test credentials.

---

## Step 6: Verify Database Updates & Commissions
Once the payment is successful and the webhook is processed, check your Supabase tables:

1. **`customers` Table**: The customer record should have `affiliate_id` linked to the affiliate owner of `TEST50`.
2. **`subscriptions` Table**: The newly created subscription record must show the `promo_code_id` populated.
3. **`commissions` Table**: A pending commission entry should be generated for the affiliate (and any managers/SAMS in their hierarchy) calculated based on the actual discounted payment.

---

## Step 7: Verify "Limit Per Customer" Enforcement
To confirm the limit constraint is working:

1. Try checking out again using the **same** customer token.
2. In Scenario A (Pre-applied), the creation request should fail with:
   `{"error": "coupon_limit_exceeded"}`
3. In Scenario B (Manual Stripe Page entry), if the customer has already completed a payment on Stripe, Stripe will natively block them from applying the promotion code because of the `first_time_transaction` restriction.
