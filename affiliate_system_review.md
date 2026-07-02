# HackHer.ai — Affiliate System Implementation Review & Gap Analysis

Based on a thorough review of [affiliate-process-flow.html](file:///home/jawad/Desktop/hackher%20superadmin%20panel/affiliate-nexus/affiliate-process-flow.html) and a comparison with the actual codebase implementation, here is the comprehensive status report.

---

## 📊 Summary of Implementation Status

| Feature / Rule                 |     Status      | Implementation Details / File Locations                                                                                                                                                                                                                                                                                                          |
| :----------------------------- | :-------------: | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Role Hierarchy Validation**  | **Implemented** | Trigger `trg_validate_profile_hierarchy` in [20260513145840_761e59bb-6cb2-4afd-b8fa-982393a7b86c.sql](file:///home/jawad/Desktop/hackher%20superadmin%20panel/affiliate-nexus/supabase/migrations/20260513145840_761e59bb-6cb2-4afd-b8fa-982393a7b86c.sql) forces strict: SAM $\rightarrow$ Manager $\rightarrow$ Affiliate reporting structure. |
| **Commission Calculations**    | **Implemented** | Webhook [stripe.ts](file:///home/jawad/Desktop/hackher%20superadmin%20panel/affiliate-nexus/src/routes/api/public/webhooks/stripe.ts) calculates commission using the actual discounted paid price (`amount_paid`), not full price.                                                                                                              |
| **Commission Cap (30% Rule)**  | **Implemented** | Enforced by trigger `trg_validate_promo_code` and function `check_promo_30_rule` in the database migration.                                                                                                                                                                                                                                      |
| **Commission Changes Logging** | **Implemented** | Audit log inserts logged dynamically in [users.functions.ts](file:///home/jawad/Desktop/hackher%20superadmin%20panel/affiliate-nexus/src/lib/users.functions.ts).                                                                                                                                                                                |
| **No Commission on Trial**     | **Implemented** | Attributions only run in the `invoice.paid` webhook flow where `amount_paid` is greater than zero.                                                                                                                                                                                                                                               |
| **30-Day Refund Hold**         | **Implemented** | Hold logic dynamically set using `commission_hold_days` (default 30) from `app_settings` in Stripe webhook.                                                                                                                                                                                                                                      |
| **Voiding Refunded Sales**     | **Implemented** | `charge.refunded` webhook handler updates related pending commission statuses to `voided`.                                                                                                                                                                                                                                                       |

---

## ⚠️ Discrepancies & Gaps (Code vs. Process Flow)

We identified several discrepancies between the requirements outlined in the HTML process flow sheet and the actual backend/frontend code implementation:

### 1. Affiliate Promo Code Creation

- **Requirement:** Affiliates can create their own branded promo codes from their dashboard (with limited capabilities).
- **Current Code:**
  - In [promos.functions.ts](file:///home/jawad/Desktop/hackher%20superadmin%20panel/affiliate-nexus/src/lib/promos.functions.ts), the `createPromoCode` endpoint strictly throws a forbidden error if the caller is an `affiliate`.
  - In [my-code.tsx](file:///home/jawad/Desktop/hackher%20superadmin%20panel/affiliate-nexus/src/routes/_authenticated/affiliate/my-code.tsx), the `PromoCodeManager` is rendered with `readOnly={true}`, meaning affiliates can only view codes assigned by managers.
- **Status:** 🔴 **Discrepancy / Blocked**

### 2. Payout Management Rights

- **Requirement:** Super Admin, SAMs, and Managers can all perform payout management (Mark Paid/Unpaid).
- **Current Code:**
  - In [payouts.functions.ts](file:///home/jawad/Desktop/hackher%20superadmin%20panel/affiliate-nexus/src/lib/payouts.functions.ts), the `generatePayouts` and `markPayoutPaid` endpoints call `ensureSuperAdmin(userId)`.
  - Only a `super_admin` can manage payouts. SAMs and Managers are completely blocked in the backend.
- **Status:** 🔴 **Discrepancy / Restricted**

### 3. Manager Payouts Screen

- **Requirement:** Managers can view and manage payouts for their own affiliates.
- **Current Code:**
  - The routes for Managers do not include any payouts route or page.
  - In [sam/payouts.tsx](file:///home/jawad/Desktop/hackher%20superadmin%20panel/affiliate-nexus/src/routes/_authenticated/sam/payouts.tsx), the payouts page is just a `ComingSoon` placeholder.
- **Status:** ⚠️ **Missing Views**

### 4. Assign / Reassign Affiliates

- **Requirement:** Super Admin and SAMs can assign or reassign affiliates to different managers.
- **Current Code:**
  - No API endpoints or frontend screens are implemented to handle moving an affiliate from one manager to another.
- **Status:** ⚠️ **Missing Feature**

### 5. Cancellation Reports

- **Requirement:** Super Admin and SAMs have access to cancellation reports.
- **Current Code:**
  - The `/admin/reports.tsx` page is stubbed as a `ComingSoon` component.
  - No cancellation analytics or listings exist in the codebase.
- **Status:** ⚠️ **Missing Feature**

---

## 💡 Recommended Next Actions

1. **Update `promos.functions.ts` & `my-code.tsx`:** If affiliates should be allowed to create their own codes, we need to allow the `affiliate` role to call the creation endpoint (with predefined limits, e.g., forcing a 10% affiliate split / 15% discount limit) and disable `readOnly` in their UI.
2. **Refactor Payout Roles:** Adjust the backend helpers in `payouts.functions.ts` to allow SAMs and Managers to view/mark payouts within their respective ancestor scopes.
3. **Build Manager Payout Page:** Add a `/manager/payouts` route utilizing a scoped query to list payouts for affiliates under the manager's hierarchy.
4. **Implement Reassignment Action:** Add a backend server function to update `parent_user_id` on profiles while validating that the new hierarchy complies with the database rules.
