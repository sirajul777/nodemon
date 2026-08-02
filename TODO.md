# Multi-Login Permission-to-View Fix

## Root Causes
1. **Frontend `applyRoleNav()`** only runs when role ≠ admin, never resets hidden nav first, and has an incomplete menu→permission map → stale/hidden sidebar when switching between users (multi-login), and Payment/Telegram menus never gated.
2. **Backend `ConfigController.getSessions()`** filters using `s.userPerms?.allowedSessions` (a permissions object) instead of the actual user's `allowedSessions` — router access filtering never worked; `allowedSessions` was never stored in the session at login.
3. **No backend permission enforcement** — `AuthGuard` only checks "is logged in"; any user can call admin APIs directly.

## Plan & Status

### Backend
- [x] Create `src/auth/permissions.decorator.ts` (`@RequirePermission`)
- [x] Create `src/auth/permissions.guard.ts` (`PermissionsGuard`, admin bypass, 403)
- [x] `auth.controller.ts`: store `allowedSessions` in session at login; return in `/me`
- [x] `config.controller.ts`: fix `getSessions()` filter + gate session writes (`manageSystem`) + allowedSessions check on GET :id

### Permissions applied to controllers
- [x] user-management → manageSystem
- [x] telegram → manageSystem
- [x] payment → manageBilling (list/stats/detail/check), manageSystem (config/test)
- [x] sessions/config → manageSystem (write)
- [x] mikrotik → viewDashboard (dashboard/monitoring), manageHotspot (hotspot ops)
- [x] pppoe → managePppoe
- [x] voucher-batch, voucher, voucher-types → manageVoucher
- [x] reseller → manageReseller/manageVoucher (read), manageReseller (write)
- [x] bot-resellers → manageReseller
- [x] billing → manageBilling
- [x] report → viewReport

### Frontend
- [x] `public/assets/app.js`: rewrite `applyRoleNav()` → reset-all-then-apply for EVERY role, complete map (add manageReseller, payments, payment-settings, telegram menus); `checkAuth()`/`doLogin()` call it for all roles

### Verification
- [x] Clean `npm run build` compiles (dist/main.js emitted)
- [x] App boots with all routes mapped (SQLite on port 4000)
- [x] Admin login → full access
- [x] Reseller login → 403 on users/billing/report; allowed on voucher/manageReseller; sessions list filtered properly
- [x] Test user cleaned up; no stray processes left

---

# PayHook Payment Gateway Integration — DONE

## New module (src/payment/payhook/) — mirrors midtrans/duitku conventions
- [x] `payhook.constants.ts` — module token, base URLs (sandbox/production), endpoints, QRIS method enum, status/purpose/event enums
- [x] `interfaces/payhook-module-options.interface.ts` — options + async options factory
- [x] `dto/create-payment.dto.ts` — purpose, referenceId, amount, productDetails, customer
- [x] `dto/payhook-callback.dto.ts` — order_id, status, signature, amount, reference
- [x] `entities/payment-transaction.entity.ts` — SQLite-compatible `payhook_payment_transactions` table
- [x] `events/payment-status-changed.event.ts` — emitted on paid/failed
- [x] `payhook.util.ts` — HMAC-SHA256 signature builder, order-id generator
- [x] `payhook.service.ts` — create QRIS payment, check status, verify+handle callback, emit events
- [x] `payhook.controller.ts` — `/payments/payhook` (POST create), `/payments/payhook/callback` (POST), `/payments/payhook/status/:orderId` (GET)
- [x] `payhook.module.ts` — forRoot/forRootAsync, HttpModule + TypeORM forFeature

## Wiring into existing payment system
- [x] `payment-config.entity.ts` — added payhookEnabled/Env/ApiKey/SecretKey/PartnerCode/CallbackUrl/DefaultMethod columns
- [x] `payment-config.service.ts` — getConfig defaults, saveConfig (masked-secret safe), getConfigMasked, getPayhookOptions()
- [x] `payment.module.ts` — import PayhookModule.forRootAsync + PayhookPaymentTransaction in forFeature
- [x] `payment.service.ts` — unified list/stats/getTransaction + getPaymentMethods includes payhook; byGateway.payhook in stats
- [x] `payment.controller.ts` — payhook create-test + check-status branches
- [x] `payment-status.listener.ts` — PAYHOOK_EVENTS.PAID → mark billing invoice paid; PAYHOOK_EVENTS.FAILED → log
- [x] `seed.service.ts` — seed payhook defaults (disabled, sandbox, QRIS)

## UI
- [x] `views/page/payment/settings.eta` — PayHook gateway section (toggle, env, API/Secret keys, partner code, callback URL, method QRIS) + default provider + test-gateway options
- [x] `public/assets/app.js` — loadPaymentSettings/savePaymentSettings handle payhook fields; payments table + detail show PayHook badge

## Verification
- [x] Clean `npm run build` (nest build) succeeds
- [x] App boots — PayhookModule initialized, routes `/payments/payhook`, `/payments/payhook/callback`, `/payments/payhook/status/:orderId` mapped
- [x] `/api/payments/config` exposes payhook config (masked secrets, has-key flags, default QRIS)
- [x] `/api/payments/stats` includes `byGateway.payhook`

