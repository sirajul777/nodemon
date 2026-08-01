import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { DuitkuService } from './duitku.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { DuitkuCallbackDto } from './dto/duitku-callback.dto';

@Controller('payments/duitku')
export class DuitkuController {
  constructor(private readonly duitkuService: DuitkuService) {}

  /**
   * Create a new QRIS payment request.
   * TODO: add your auth guard here (e.g. @UseGuards(JwtAuthGuard)) —
   * this endpoint is called by your own frontend/app, not by Duitku.
   */
  @Post()
  async create(@Body() dto: CreatePaymentDto) {
    const tx = await this.duitkuService.createQrisPayment(dto);
    return {
      merchantOrderId: tx.merchantOrderId,
      reference: tx.reference,
      qrString: tx.qrString,
      paymentUrl: tx.paymentUrl,
      amount: tx.amount,
      status: tx.status,
      expiredAt: tx.expiredAt
    };
  }

  /**
   * Receives payment result notifications from Duitku's servers.
   * MUST stay public (no auth guard) — Duitku calls this server-to-server.
   * Body arrives as application/x-www-form-urlencoded, which Nest's
   * default Express adapter already parses into @Body().
   *
   * Consider IP-restricting this route at the reverse-proxy/firewall
   * level using Duitku's published outgoing IP list as extra defense
   * in depth (signature verification is still the primary guard).
   */
  @Post('callback')
  @HttpCode(200)
  async callback(@Body() payload: DuitkuCallbackDto) {
    await this.duitkuService.handleCallback(payload);
    // Duitku just needs a 200 OK to consider the callback delivered.
    return 'OK';
  }

  /** Actively check/sync a transaction's status against Duitku. */
  @Get('status/:merchantOrderId')
  async status(@Param('merchantOrderId') merchantOrderId: string) {
    const tx = await this.duitkuService.checkStatus(merchantOrderId);
    return {
      merchantOrderId: tx.merchantOrderId,
      status: tx.status,
      amount: tx.amount,
      paidAt: tx.paidAt
    };
  }
}
