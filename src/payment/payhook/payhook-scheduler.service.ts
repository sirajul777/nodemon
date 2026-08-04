import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { VoucherOrderService } from './voucher-order.service';

/**
 * Periodically sweeps PENDING/PROCESSING QRIS voucher orders whose
 * `expiresAt` has passed and marks them EXPIRED — then permanently deletes
 * EXPIRED/FAILED orders older than the configured retention window
 * (`payhookExpiredRetentionDays`), keeping the table from growing forever
 * with abandoned carts. PAID orders are never deleted by this sweep.
 *
 * This matters beyond housekeeping: as long as a stale order stays
 * "pending", its `uniqueAmount` stays reserved and could either block a
 * new order from getting a free unique code, or — worse — end up matching
 * a genuine new payment via the PayHook webhook (see
 * `VoucherOrderService.processAppWebhook`, which already double-checks
 * `expiresAt` too, but this sweep is what actually keeps the DB state
 * correct for admin views/stats).
 *
 * Follows the same plain setInterval pattern as
 * `BillingSchedulerService` (no @nestjs/schedule dependency needed).
 */
@Injectable()
export class PayhookSchedulerService implements OnModuleInit {
  private readonly logger = new Logger(PayhookSchedulerService.name);
  private static readonly SWEEP_INTERVAL_MS = 60 * 1000; // every minute

  constructor(private readonly orderService: VoucherOrderService) {}

  onModuleInit() {
    // Run once shortly after boot, then on a fixed interval.
    setTimeout(() => this.sweep(), 5000);
    setInterval(() => this.sweep(), PayhookSchedulerService.SWEEP_INTERVAL_MS);
  }

  async sweep() {
    try {
      await this.orderService.expireStaleOrders();
    } catch (e: any) {
      this.logger.error(`Gagal menjalankan sweep order expired: ${e.message}`);
    }
    try {
      await this.orderService.pruneOldUnpaidOrders();
    } catch (e: any) {
      this.logger.error(`Gagal menjalankan prune order lama: ${e.message}`);
    }
  }
}
