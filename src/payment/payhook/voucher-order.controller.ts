import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Render,
  Res,
  UseGuards
} from '@nestjs/common';
import { Response } from 'express';
import { AuthGuard } from '../../auth/auth.guard';
import { PermissionsGuard } from '../../auth/permissions.guard';
import { RequirePermission } from '../../auth/permissions.decorator';

import { VoucherOrderService } from './voucher-order.service';
import { PayhookAppWebhookDto } from './dto/payhook-app-webhook.dto';
import { ConfigService } from '../../config/config.service';
import { VoucherTypeService } from '../../voucher-types/voucher-type.service';

/**
 * QRIS GoPay Merchant voucher-selling controller (article architecture).
 *
 * Public routes:
 *   GET  /qris/buy/:sessionId           ← customer-facing voucher picker (entry point)
 *   POST /payments/payhook/app-webhook  ← PayHook Android app webhook receiver
 *   POST /api/qris/orders               ← create an order (checkout frontend)
 *   GET  /qris/checkout/:orderId        ← customer-facing QRIS checkout page
 *   GET  /qris/status/:orderId          ← polling status for the checkout page
 *
 * Admin routes (auth required):
 *   GET  /api/qris/orders               ← order list
 *   GET  /api/qris/orders/:id           ← order detail
 *   POST /api/qris/orders/:id/verify    ← manual fallback verification
 *   GET  /api/qris/callbacks            ← PayHook callback monitor log
 *   GET  /api/qris/stats                ← summary stats
 */
@Controller()
export class VoucherOrderController {
  constructor(
    private readonly orderService: VoucherOrderService,
    private readonly configService: ConfigService,
    private readonly voucherTypeService: VoucherTypeService
  ) {}

  // ── Public: customer-facing voucher picker (entry point into the QRIS
  // flow — createOrder()/checkout() below already existed, but nothing
  // in the app actually linked to them for a customer to start a purchase).
  @Get('qris/buy/:sessionId')
  @Render('page/payment/qris-buy')
  async buy(@Param('sessionId') sessionId: string) {
    const session = await this.configService.getSession(sessionId);
    if (!session) {
      return { notFound: true, sessionId, hotspotName: '', voucherTypes: [] };
    }
    const voucherTypes = await this.voucherTypeService.getActive();
    return {
      notFound: false,
      sessionId,
      hotspotName: session.hotspotName || session.name || 'Beli Voucher WiFi',
      voucherTypes
    };
  }

  // ── Public: PayHook Android-app webhook ─────────────────────────
  @Post('payments/payhook/app-webhook')
  @HttpCode(200)
  async appWebhook(@Body() payload: PayhookAppWebhookDto) {
    // Always respond 200 so the PayHook app considers the callback delivered.
    const result = await this.orderService.processAppWebhook(payload || {});
    return result;
  }

  // ── Public: create a voucher order (unique amount) ──────────────
  @Post('api/qris/orders')
  async createOrder(
    @Body()
    body: {
      voucherTypeId?: string;
      profile?: string;
      sessionId?: string;
      customerName?: string;
      phone?: string;
      qrString?: string;
    }
  ) {
    const order = await this.orderService.createOrder({
      voucherTypeId: body.voucherTypeId,
      profile: body.profile,
      sessionId: body.sessionId,
      customerName: body.customerName,
      phone: body.phone,
      qrString: body.qrString
    });
    return {
      success: true,
      order: {
        orderId: order.orderId,
        voucherName: order.voucherName,
        price: order.price,
        uniqueAmount: order.uniqueAmount,
        uniqueCode: order.uniqueCode,
        qrString: order.qrString,
        qrImage: order.qrImage,
        expiresAt: order.expiresAt,
        status: order.status
      }
    };
  }

  // ── Public: (re)generate QR image for an order ───────────────────
  // Fallback used by the checkout page when qrImage wasn't ready yet
  // (e.g. static QRIS config saved after the order was created).
  @Post('api/qris/orders/:id/qr')
  @HttpCode(200)
  async regenerateQr(@Param('id') id: string) {
    const { qrString, qrImage } = await this.orderService.regenerateQr(id);
    return { success: true, qrString, qrImage };
  }

  // ── Public: customer-facing checkout page ───────────────────────
  @Get('qris/checkout/:orderId')
  @Render('page/payment/qris-checkout')
  async checkout(@Param('orderId') orderId: string) {
    const order = await this.orderService.getOrder(orderId);
    if (!order) {
      return { notFound: true, order: null, error: 'Order not found' };
    }
    return { notFound: false, order, error: null };
  }

  // ── Public: polling status for the checkout page ────────────────
  @Get('qris/status/:orderId')
  async status(@Param('orderId') orderId: string) {
    const order = await this.orderService.getOrder(orderId);
    if (!order) {
      return { success: false, error: 'Order not found', status: 'unknown' };
    }
    return {
      success: true,
      status: order.status,
      voucherUsername: order.voucherUsername || null,
      voucherPassword: order.voucherPassword || null,
      voucherName: order.voucherName,
      uniqueAmount: order.uniqueAmount,
      paidAt: order.paidAt || null
    };
  }

  // ── Admin: order list ───────────────────────────────────────────
  @Get('api/qris/orders')
  @UseGuards(AuthGuard)
  @UseGuards(PermissionsGuard)
  @RequirePermission('manageBilling')
  async listOrders(@Query('status') status?: string) {
    const orders = await this.orderService.listOrders(status);
    return { success: true, orders, total: orders.length };
  }

  // ── Admin: order detail ─────────────────────────────────────────
  @Get('api/qris/orders/:id')
  @UseGuards(AuthGuard)
  @UseGuards(PermissionsGuard)
  @RequirePermission('manageBilling')
  async orderDetail(@Param('id') id: string) {
    const order = await this.orderService.getOrder(id);
    if (!order) {
      return { success: false, error: 'Order not found' };
    }
    return { success: true, order };
  }

  // ── Admin: manual fallback verification ─────────────────────────
  @Post('api/qris/orders/:id/verify')
  @UseGuards(AuthGuard)
  @UseGuards(PermissionsGuard)
  @RequirePermission('manageBilling')
  async verifyOrder(@Param('id') id: string) {
    const order = await this.orderService.markPaidManual(id);
    return { success: true, order };
  }

  // ── Admin: PayHook callback monitor log ─────────────────────────
  @Get('api/qris/callbacks')
  @UseGuards(AuthGuard)
  @UseGuards(PermissionsGuard)
  @RequirePermission('manageBilling')
  async callbacks(@Query('limit') limit?: string) {
    const logs = await this.orderService.listCallbackLogs(
      limit ? parseInt(limit, 10) : 100
    );
    return { success: true, logs, total: logs.length };
  }

  // ── Admin: stats ────────────────────────────────────────────────
  @Get('api/qris/stats')
  @UseGuards(AuthGuard)
  @UseGuards(PermissionsGuard)
  @RequirePermission('manageBilling')
  async stats() {
    return { success: true, ...(await this.orderService.getStats()) };
  }
}

