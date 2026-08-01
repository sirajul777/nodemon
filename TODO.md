# TODO: SQLite Database Integration Refactor

## Progress Tracking

- [x] 1. Install dependencies (`@nestjs/typeorm`, `typeorm`, `better-sqlite3`)
- [x] 2. Create `src/database/database.module.ts` (TypeORM root config - SQLite)
- [x] 3. Create entity files for all 15 data models
- [x] 4. Create `src/database/database.seed.service.ts` (JSON → DB migration)
- [x] 5. Refactor `ConfigService` (router sessions + admin) → DB
- [x] 6. Refactor `UserService` → DB
- [x] 7. Refactor `ResellerService` → DB
- [x] 8. Refactor `BillingService` (customers/invoices/settlements) → DB
- [x] 9. Refactor `VoucherBatchService` → DB
- [x] 10. Refactor `VoucherTypeService` → DB
- [x] 11. Refactor `BotResellerService` (resellers + topup logs) → DB
- [x] 12. Refactor `TelegramService` → DB (async BotResellerService calls)
- [x] 13. Refactor `MobileTokenService` + `MobileAuthGuard` → DB
- [x] 14. Refactor profile-meta (hotspot/pppoe) reads/writes → DB
- [x] 14b. Refactor MikrotikController + PppoeController profile-meta → DB (done)
- [x] 15. Wire up `AppModule` imports + `TypeOrmModule.forFeature` in modules
- [x] 16. Update `package.json`, `.env`, `.env.example`, `docker-compose.yml`
- [x] 17. Build, run, and verify migration + endpoints

## Remaining Work

- [x] All services converted to DB-backed async implementations
- [x] Controllers updated to `await` all async service calls
- [x] TypeScript build passes cleanly (`tsc --noEmit` exit code 0)
- [x] Missing payment deps installed (`class-validator`, `@nestjs/axios`, `@nestjs/event-emitter`)

## Summary

The app has been fully migrated from synchronous JSON-file storage to a SQLite database via TypeORM:

- **Database**: SQLite via `better-sqlite3`, configured in `src/database/database.module.ts`
- **Entities**: 15 TypeORM entities under `src/database/entities/`
- **Seeding**: `src/database/seed.service.ts` migrates existing `data/*.json` files → SQLite on startup
- **Services**: All services (Config, User, Reseller, Billing, VoucherBatch, VoucherType, BotReseller, MobileToken, ProfileMeta) now use `@InjectRepository` + async TypeORM methods
- **Controllers**: All controllers `await` the now-async service methods
- **Build**: `npx tsc --noEmit` passes with exit code 0

