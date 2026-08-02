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

