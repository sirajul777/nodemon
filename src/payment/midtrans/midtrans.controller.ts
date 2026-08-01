import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { MidtransService } from './midtrans.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { MidtransNotificationDto } from './dto/midtrans-notification.dto';

@Controller('payments/midtrans')
export class MidtransController {
  constructor(private readonly midtransService: MidtransService) {}

  /**
   * Create a new QRIS charge.
   * TODO: add your auth guard here (e.g. @UseGuards(JwtAuthGuard)) —
   * this endpoint is called by your own frontend/app, not by Midtrans.
   */
  @Post()
  async create(@Body() dto: CreatePaymentDto) {
    const tx = await this.midtransService.createQrisPayment(dto);
    return {
      orderId: tx.orderId,
      transactionId: tx.transactionId,
      qrCodeUrl: tx.qrCodeUrl,
      amount: tx.amount,
      status: tx.status
    };
  }

  /**
   * Receives payment result notifications from Midtrans's servers.
   * MUST stay public (no auth guard) — Midtrans calls this server-to-server.
   * The URL for this route must be registered once in Midtrans Dashboard
   * under Settings > Configuration > Payment Notification URL — Midtrans
   * does not accept a per-request callback URL for Core API QRIS charges.
   */
  @Post('notification')
  @HttpCode(200)
  async notification(@Body() payload: MidtransNotificationDto) {
    await this.midtransService.handleNotification(payload);
    return { received: true };
  }

  /** Actively check/sync a transaction's status against Midtrans. */
  @Get('status/:orderId')
  async status(@Param('orderId') orderId: string) {
    const tx = await this.midtransService.checkStatus(orderId);
    return {
      orderId: tx.orderId,
      status: tx.status,
      transactionStatus: tx.transactionStatus,
      amount: tx.amount,
      paidAt: tx.paidAt
    };
  }
}
