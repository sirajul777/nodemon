import { HttpService } from '@nestjs/axios';
import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { firstValueFrom } from 'rxjs';
import { Repository } from 'typeorm';

import {
  PAYHOOK_BASE_URL,
  PAYHOOK_ENDPOINT,
  PAYHOOK_EVENTS,
  PAYHOOK_MODULE_OPTIONS,
  PayhookStatus,
  PayhookPaymentMethod,
  PaymentStatus
} from './payhook.constants';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { PayhookCallbackDto } from './dto/payhook-callback.dto';
import { PaymentTransaction } from './entities/payment-transaction.entity';
import { PaymentStatusChangedEvent } from './events/payment-status-changed.event';
import { PayhookModuleOptions } from './interfaces/payhook-module-options.interface';
import { buildCallbackSignature, generateOrderId } from './payhook.util';

interface PayhookCreateResponse {
  order_id?: string;
  reference?: string;
  payment_url?: string;
  qr_string?: string;
  qr_code?: string;
  qr_code_url?: string;
  status?: string;
  status_code?: string;
  statusMessage?: string;
  message?: string;
}

interface PayhookCheckResponse {
  order_id?: string;
  reference?: string;
  amount?: string;
  status?: string;
  status_code?: string;
  statusMessage?: string;
  message?: string;
}

@Injectable()
export class PayhookService {
  private readonly logger = new Logger(PayhookService.name);
  private readonly baseUrl: string;

  constructor(
    @Inject(PAYHOOK_MODULE_OPTIONS) private readonly options: PayhookModuleOptions,
    private readonly httpService: HttpService,
    private readonly eventEmitter: EventEmitter2,
    @InjectRepository(PaymentTransaction)
    private readonly paymentRepo: Repository<PaymentTransaction>
  ) {
    this.baseUrl = PAYHOOK_BASE_URL[this.options.env];
  }

/**
   * Creates a QRIS / GoPay payment request with PayHook and persists a
   * pending PaymentTransaction. Returns the record including `paymentUrl`
   * (redirect/customer-facing payment page) and `qrString` (GoPay QR data).
   *
   * @param dto - Standard payment creation DTO.
   * @param overrideMethod - Optional explicit method override. If omitted,
   *                         the DB-configured `payhookDefaultMethod` is used.
   */
  async createQrisPayment(dto: CreatePaymentDto, overrideMethod?: string): Promise<PaymentTransaction> {
    const orderId = generateOrderId(dto.purpose, dto.referenceId);
const method = overrideMethod || (this.options.defaultMethod ?? PayhookPaymentMethod.QRIS);

    // PayHook create-payment payload. apiKey/secretKey authenticate the
    // merchant; partner_code routes the transaction.
    const payload = {
      apiKey: this.options.apiKey,
      secretKey: this.options.secretKey,
      partner_code: this.options.partnerCode,
      payment_method: method,
      reference_id: orderId,
      amount: dto.amount,
      customer_name: dto.customerName || 'Customer',
      customer_email: dto.customerEmail || 'no-reply@example.com',
      product_name: dto.productDetails,
      callback_url: this.options.callbackUrl
    };

    let response: PayhookCreateResponse;
    try {
      const { data } = await firstValueFrom(
        this.httpService.post<PayhookCreateResponse>(
          `${this.baseUrl}${PAYHOOK_ENDPOINT.create}`,
          payload,
          { headers: { 'Content-Type': 'application/json' } }
        )
      );
      response = data;
    } catch (err: any) {
      this.logger.error(`PayHook create failed: ${err.message}`, err.stack);
      throw new BadRequestException(
        err.response?.data?.statusMessage ||
          err.response?.data?.message ||
          'Failed to create PayHook transaction'
      );
    }

    const ok =
      response.status === 'SUCCESS' ||
      response.status_code === '200' ||
      !!response.order_id ||
      !!response.payment_url;
    if (!ok) {
      throw new BadRequestException(
        response.statusMessage || response.message || 'PayHook rejected the transaction request'
      );
    }

    // Normalize the QR payload — PayHook may return the QR as a data URI
    // (qr_string), a raw base64/string (qr_code), or a URL (qr_code_url).
    const qrString =
      response.qr_string ||
      response.qr_code ||
      response.qr_code_url ||
      '';

    const transaction = this.paymentRepo.create({
      orderId: response.order_id || orderId,
      reference: response.reference || '',
      purpose: dto.purpose,
      referenceId: dto.referenceId,
      amount: dto.amount,
      paymentMethod: method,
      qrString: qrString,
      paymentUrl: response.payment_url,
      status: PaymentStatus.PENDING,
      transactionStatus: response.status || 'PENDING',
      customerName: dto.customerName,
      customerEmail: dto.customerEmail,
      phoneNumber: dto.phoneNumber,
      productDetails: dto.productDetails
    });

    return this.paymentRepo.save(transaction);
  }

  /**
   * Actively polls PayHook for the current status of a transaction and
   * syncs the local record. Useful for a "check now" button, or as a
   * safety net alongside the callback (e.g. a cron that sweeps PENDING
   * transactions older than a few minutes).
   */
  async checkStatus(orderId: string): Promise<PaymentTransaction> {
    const transaction = await this.paymentRepo.findOne({ where: { orderId } });
    if (!transaction) {
      throw new NotFoundException(`Transaction ${orderId} not found`);
    }

    // Already settled locally — no need to call PayHook again.
    if (transaction.status !== PaymentStatus.PENDING) {
      return transaction;
    }

    const { data } = await firstValueFrom(
      this.httpService.post<PayhookCheckResponse>(
        `${this.baseUrl}${PAYHOOK_ENDPOINT.check}`,
        {
          apiKey: this.options.apiKey,
          secretKey: this.options.secretKey,
          order_id: orderId
        },
        { headers: { 'Content-Type': 'application/json' } }
      )
    );

    const status = String(data.status || data.status_code || '').toUpperCase();
    if (status === PayhookStatus.COMPLETED) {
      return this.markPaid(transaction, { reference: data.reference });
    }
    if (status === PayhookStatus.FAILED) {
      return this.markFailed(transaction);
    }
    // PENDING / anything else — leave as PENDING.
    transaction.transactionStatus = status || transaction.transactionStatus;
    return this.paymentRepo.save(transaction);
  }

  /**
   * Verifies the signature on an incoming PayHook callback.
   * Formula: HMAC-SHA256(order_id | status | amount) with the secret key.
   */
  verifyCallbackSignature(payload: PayhookCallbackDto): boolean {
    const expected = buildCallbackSignature(
      payload as unknown as Record<string, any>,
      this.options.secretKey
    );
    return expected === payload.signature;
  }

  /**
   * Processes a verified PayHook callback: updates the transaction and
   * emits an event so other modules (billing/voucher/reseller) can act.
   * Idempotent — safe to call more than once for the same order id
   * (PayHook may retry callbacks).
   */
  async handleCallback(payload: PayhookCallbackDto): Promise<void> {
    if (!this.verifyCallbackSignature(payload)) {
      this.logger.warn(`Rejected PayHook callback with bad signature: ${payload.order_id}`);
      throw new BadRequestException('Invalid signature');
    }

    const transaction = await this.paymentRepo.findOne({
      where: { orderId: payload.order_id }
    });
    if (!transaction) {
      this.logger.warn(`Callback for unknown order_id: ${payload.order_id}`);
      throw new NotFoundException('Transaction not found');
    }

    // Idempotency: don't re-process or re-emit for an already-settled transaction.
    if (transaction.status !== PaymentStatus.PENDING) {
      return;
    }

    transaction.rawCallback = { ...payload } as any;
    transaction.reference = payload.reference || payload.transaction_id || transaction.reference;

    const status = String(payload.status || '').toUpperCase();
    if (status === PayhookStatus.COMPLETED) {
      await this.markPaid(transaction, { reference: transaction.reference });
    } else if (status === PayhookStatus.FAILED) {
      await this.markFailed(transaction);
    } else {
      // PENDING / unknown — leave as PENDING.
      transaction.transactionStatus = status;
      await this.paymentRepo.save(transaction);
    }
  }

  private async markPaid(
    transaction: PaymentTransaction,
    extra: { reference?: string } = {}
  ): Promise<PaymentTransaction> {
    transaction.status = PaymentStatus.PAID;
    transaction.paidAt = new Date();
    transaction.transactionStatus = PayhookStatus.COMPLETED;
    if (extra.reference) transaction.reference = extra.reference;

    const saved = await this.paymentRepo.save(transaction);
    this.eventEmitter.emit(PAYHOOK_EVENTS.PAID, new PaymentStatusChangedEvent(saved));
    return saved;
  }

  private async markFailed(transaction: PaymentTransaction): Promise<PaymentTransaction> {
    transaction.status = PaymentStatus.FAILED;
    transaction.transactionStatus = PayhookStatus.FAILED;

    const saved = await this.paymentRepo.save(transaction);
    this.eventEmitter.emit(PAYHOOK_EVENTS.FAILED, new PaymentStatusChangedEvent(saved));
    return saved;
  }
}

