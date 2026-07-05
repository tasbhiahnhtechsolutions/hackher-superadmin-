# HackHer Affiliate System Functional Spec vs Existing Implementation

Based on `HackHer-Affiliate-System-Functional-Spec.docx`, I verified the existing side navigation and dashboard tabs (`src/routes/_authenticated`). Here is the detailed breakdown of what matches, what extra tabs are present, and what is missing/remaining.

---

## 1. Super Admin (SA) Panel
`src/routes/_authenticated/admin/*`

### ✅ Matches with Spec:
- **Dashboard** -> `index.tsx` / `analytics.tsx`
- **My SAMs** -> `sams.tsx`
- **Change Logs** -> `audit-logs.tsx`
- **Promo Codes** -> `promo-codes.tsx`
- **Payouts** -> `payouts.tsx`

### ❌ Remaining / Missing (To be Built):
- **Managers**: Spec requires a separate tab "Managers", currently managed under `users.tsx` maybe? Needs dedicated UI.
- **All Affiliates**: Spec requires "All Affiliates", currently merged in `users.tsx`.
- **Commissions**: Missing dedicated view for commissions.
- **My Earnings (1%)**: Spec says SA should see their 1% pool, not explicitly present.
- **Campaigns**: Missing.

### 🗑️ Extra Tabs (To review/remove according to spec constraint):
- **reports.tsx**: Spec explicitly says "Reports" for SA is "No". 
- **emails.tsx, plans.tsx, fraud.tsx, settings.tsx, system.tsx**: (These are core SaaS admin tabs, **Wait**: they might be needed for the superadmin functionality outside of the affiliate scope. Do not remove them blindly).

---

## 2. Super Admin Manager (SAM) Panel
`src/routes/_authenticated/sam/*`

### ✅ Matches with Spec:
- **Dashboard** -> `index.tsx`
- **Managers** -> `managers.tsx`
- **All / My Affiliates** -> `affiliates.tsx`
- **Promo Codes** -> `promo-codes.tsx`
- **Payouts** -> `payouts.tsx`
- **Reports** -> `reports.tsx`

### ❌ Remaining / Missing (To be Built):
- **Commissions**: Missing dedicated view for commissions.
- **My Earnings (1%)**: Missing their earning dashboard tab.
- **Campaigns**: Missing.
- **Change Logs**: Missing for SAM.

### 🗑️ Extra Tabs:
*(None found in the route directory, it perfectly aligns mostly!)*

---

## 3. Manager Panel
`src/routes/_authenticated/manager/*`

### ✅ Matches with Spec:
- **Dashboard** -> `index.tsx`
- **My Affiliates** -> `affiliates.tsx`
- **Promo Codes** -> `promo-codes.tsx`
- **Reports** -> `reports.tsx`

### ❌ Remaining / Missing (To be Built):
- **Commissions**: Missing. 
- **Payouts**: Spec allows manager to view payouts for their own affiliates.
- **My Earnings (4%)**: Missing their 4% earnings dashboard.
- **Campaigns**: Missing.
- **Change Logs**: Missing for Manager (Affiliates only scope).

### 🗑️ Extra Tabs:
- **subscribers.tsx**: Can be integrated inside "Reports" as per spec (Subscriber Report CSV), but currently holds a separate tab. Consider merging or keeping if UX demands it.

---

## 4. Affiliate Panel
`src/routes/_authenticated/affiliate/*`

### ✅ Matches with Spec:
- **Dashboard** -> `index.tsx` / `analytics.tsx`
- **Promo Codes** -> `my-code.tsx`
- **My Earnings (10%)** -> `earnings.tsx`
- **Subscribers** -> `subscribers.tsx` (Spec mentions they can see their subscribers).

### ❌ Remaining / Missing (To be Built):
*(All tabs for affiliate seem mostly complete!)*

### 🗑️ Extra Tabs:
- **analytics.tsx** vs **index.tsx**: You have both index and analytics. Usually they can be merged into a single dashboard.

---

### Suggested Developer Actions:
1. **Remove / Restrict non-spec tabs**: Decide if `admin/reports.tsx` should be removed based on spec, or if standard SaaS rules apply.
2. **Build Missing Panels**: `Commissions`, `Campaigns`, and `My Earnings` missing across SA, SAM, and Manager roles.
3. **Dedicated user partitions**: Separate the unified `users.tsx` in SuperAdmin into distinct `Managers` and `Affiliates` tabs as explicitly defined in "Data Visibility Matrix".
