import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { PayhookService } from './payhook.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { PayhookCallbackDto } from './dto/payhook-callback.dto';

@Controller('payments/payhook')
export class PayhookController {
  constructor(private readonly payhookService: PayhookService) {}

  /**
   * Create a new QRIS payment request.
   * TODO: add your auth guard here (e.g. @UseGuards(AuthGuard)) —
   * this endpoint is called by your own frontend/app, not by PayHook.
   */
  @Post()
  async create(@Body() dto: CreatePaymentDto) {
    const tx = await this.payhookService.createQrisPayment(dto);
    return {
      orderId: tx.orderId,
      reference: tx.reference,
      paymentUrl: tx.paymentUrl,
      amount: tx.amount,
      status: tx.status
    };
  }

  /**
   * Receives payment result notifications from PayHook's servers.
   * MUST stay public (no auth guard) — PayHook calls this server-to-server.
   *
   * Consider IP-restricting this route at the reverse-proxy/firewall
   * level using PayHook's published outgoing IP list as extra defense
   * in depth (signature verification is still the primary guard).
   */
  @Post('callback')
  @HttpCode(200)
  async callback(@Body() payload: PayhookCallbackDto) {
    await this.payhookService.handleCallback(payload);
    // PayHook just needs a 200 OK to consider the callback delivered.
    return 'OK';
  }

  /** Actively check/sync a transaction's status against PayHook. */
  @Get('status/:orderId')
  async status(@Param('orderId') orderId: string) {
    const tx = await this.payhookService.checkStatus(orderId);
    return {
      orderId: tx.orderId,
      status: tx.status,
      transactionStatus: tx.transactionStatus,
      amount: tx.amount,
      paidAt: tx.paidAt
    };
  }
}

