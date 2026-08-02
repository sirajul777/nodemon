import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards
} from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermission } from '../auth/permissions.decorator';
import { PaymentService } from './payment.service';
import { PaymentConfigService } from './payment-config.service';
import { MidtransService } from './midtrans/midtrans.service';
import { DuitkuService } from './duitku/duitku.service';
import { PaymentPurpose as MidtransPurpose } from './midtrans/midtrans.constants';
import { PaymentPurpose as DuitkuPurpose } from './duitku/duitku.constants';
import { CreatePaymentDto as MidtransCreateDto } from './midtrans/dto/create-payment.dto';
import { CreatePaymentDto as DuitkuCreateDto } from './duitku/dto/create-payment.dto';

@Controller('api/payments')
@UseGuards(AuthGuard)
@UseGuards(PermissionsGuard)
@RequirePermission('manageBilling')
export class PaymentController {
  constructor(
    private readonly paymentService: PaymentService,
    private readonly paymentConfigService: PaymentConfigService,
    private readonly midtransService: MidtransService,
    private readonly duitkuService: DuitkuService,
  ) {}

  /** Unified transaction list. */
  @Get()
  async list(
    @Query('gateway') gateway?: string,
    @Query('status') status?: string,
    @Query('purpose') purpose?: string,
    @Query('limit') limit?: string,
  ) {
    const records = await this.paymentService.listTransactions({
      gateway,
      status,
      purpose,
      limit: limit ? parseInt(limit) : 100,
    });
    return {
      success: true,
      transactions: records,
      total: records.length,
    };
  }

  /** Summary stats. */
  @Get('stats')
  async stats() {
    return { success: true, ...(await this.paymentService.getStats()) };
  }

  /** Payment gateway configuration for the settings page. */
  @Get('config')
  @RequirePermission('manageSystem')
  async getConfig() {
    return { success: true, config: await this.paymentConfigService.getConfigMasked() };
  }

  /** Save payment gateway configuration. */
  @Post('config')
  @RequirePermission('manageSystem')
  async saveConfig(@Body() body: any) {
    const saved = await this.paymentConfigService.saveConfig(body);
    return { success: true, config: await this.paymentConfigService.getConfigMasked() };
  }

  /** Create a test QRIS payment (uses the default provider). */
  @Post('test')
  @RequirePermission('manageSystem')
  async createTest(@Body() body: { amount?: number; gateway?: string }) {
    const config = await this.paymentConfigService.getConfig();
    const amount = Number(body.amount) || 1000;
    const gateway = body.gateway || config.defaultProvider;

    if (gateway === 'midtrans') {
      const dto = new MidtransCreateDto();
      dto.purpose = MidtransPurpose.OTHER;
      dto.referenceId = `TEST-${Date.now()}`;
      dto.amount = amount;
      dto.productDetails = 'Test Payment';
      dto.customerFirstName = 'Test';
      const tx = await this.midtransService.createQrisPayment(dto);
      return {
        success: true,
        gateway: 'midtrans',
        orderId: tx.orderId,
        qrCodeUrl: tx.qrCodeUrl,
        amount: tx.amount,
        status: tx.status,
      };
    }

    if (gateway === 'duitku') {
      const dto = new DuitkuCreateDto();
      dto.purpose = DuitkuPurpose.OTHER;
      dto.referenceId = `TEST-${Date.now()}`;
      dto.amount = amount;
      dto.productDetails = 'Test Payment';
      dto.customerName = 'Test';
      const tx = await this.duitkuService.createQrisPayment(dto);
      return {
        success: true,
        gateway: 'duitku',
        merchantOrderId: tx.merchantOrderId,
        qrString: tx.qrString,
        paymentUrl: tx.paymentUrl,
        amount: tx.amount,
        status: tx.status,
      };
    }

    return { success: false, error: `Unknown gateway: ${gateway}` };
  }

  /** Transaction detail. */
  @Get(':gateway/:orderId')
  async detail(@Param('gateway') gateway: string, @Param('orderId') orderId: string) {
    const tx = await this.paymentService.getTransaction(gateway, orderId);
    if (!tx) return { success: false, error: 'Transaction not found' };
    return { success: true, transaction: tx };
  }

  /** Force-check a transaction's status against the gateway. */
  @Post(':gateway/:orderId/check')
  async checkStatus(@Param('gateway') gateway: string, @Param('orderId') orderId: string) {
    if (gateway === 'midtrans') {
      const tx = await this.midtransService.checkStatus(orderId);
      return { success: true, gateway, orderId, status: tx.status };
    }
    if (gateway === 'duitku') {
      const tx = await this.duitkuService.checkStatus(orderId);
      return { success: true, gateway, orderId, status: tx.status };
    }
    return { success: false, error: `Unknown gateway: ${gateway}` };
  }
}

