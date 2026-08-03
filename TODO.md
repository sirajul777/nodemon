# QRIS GoPay Merchant + PayHook (Android App) — Voucher Auto-Selling

## Goal
Implement the article's flow: **Voucher Hotspot Mikrotik Tanpa Payment Gateway dengan QRIS GoPay Merchant** using the **PayHook Android app** (notification-reader → webhook to our server), **QRIS Dinamis via GoPay Merchant**, and **unique nominal matching** so payments can be auto-verified and vouchers auto-created on Mikrotik — without a conventional payment gateway.

## Plan

### 1. Entities (new)
- [x] `src/payment/payhook/entities/voucher-order.entity.ts` — `voucher_orders` table
- [x] `src/payment/payhook/entities/payhook-callback-log.entity.ts` — `payhook_callback_logs` table

### 2. DTO
- [x] `src/payment/payhook/dto/payhook-app-webhook.dto.ts` — PayHook Android-app webhook DTO

### 3. Services
- [x] `src/payment/payhook/voucher-order.service.ts` — core service (create, process webhook, manual verify, queries)
- [x] `src/payment/payhook/interfaces/notifier.interface.ts` — notification abstraction

### 4. Controller
- [x] `src/payment/payhook/voucher-order.controller.ts` — all endpoints (webhook, order CRUD, admin monitors)

### 5. Views
- [x] `views/page/payment/qris-checkout.eta` — customer-facing checkout page
- [x] `views/page/payment/qris-monitor.eta` — admin callback monitor + order list

### 6. Config
- [x] `payment-config.entity.ts` — added QRIS fields (payhookUniqueDigits, payhookQrisExpiryMinutes, payhookWaEnabled, payhookWalledGardenHosts)
- [x] `payment-config.service.ts` — saveConfig + getConfigMasked updated
- [x] `seed.service.ts` — seeding new config fields

### 7. Wiring
- [x] `src/database/entities/index.ts` — register new entities
- [x] `src/payment/payhook/payhook.module.ts` — forFeature new entities + providers
- [x] `src/payment/payment.module.ts` — import MikrotikModule, VoucherTypeModule, ConfigModule + register VoucherOrderService/Controller
- [x] `views/index.eta` — include qris-checkout + qris-monitor pages
- [x] `views/partials/sidebar.eta` — add "QRIS Monitor" nav item
- [x] `public/assets/app.js` — QRIS monitor functions, load/save payment settings for QRIS fields
- [x] `views/page/payment/settings.eta` — QRIS config section in settings page

### 8. Notification helpers
- [x] Telegram send via existing TelegramService (lazy injection in voucher-order.service.ts)
- [x] WhatsApp via deep-link helper (documented; no API token needed)

## Verification
- [ ] `npm run build` compiles
- [ ] App boots; tables `voucher_orders` + `payhook_callback_logs` auto-created
- [ ] Create order → unique amount computed → checkout page renders
- [ ] Simulated PayHook app webhook (script) → order marked paid → voucher created (or logged if no router) → notifier called
- [ ] Manual verify works
- [ ] Admin callback monitor lists entries

