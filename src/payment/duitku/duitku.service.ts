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
  DUITKU_BASE_URL,
  DUITKU_ENDPOINT,
  DUITKU_EVENTS,
  DUITKU_MODULE_OPTIONS,
  DuitkuQrisMethod,
  DuitkuResultCode,
  DuitkuStatusCode,
  PaymentStatus
} from './duitku.constants';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { DuitkuCallbackDto } from './dto/duitku-callback.dto';
import { PaymentTransaction } from './entities/payment-transaction.entity';
import { PaymentStatusChangedEvent } from './events/payment-status-changed.event';
import { DuitkuModuleOptions } from './interfaces/duitku-module-options.interface';
import {
  buildCallbackSignature,
  buildRequestSignature,
  buildStatusSignature,
  generateMerchantOrderId
} from './duitku.util';

interface DuitkuCreateTransactionResponse {
  merchantCode: string;
  reference: string;
  paymentUrl?: string;
  vaNumber?: string;
  qrString?: string;
  amount: string;
  statusCode: string;
  statusMessage: string;
}

interface DuitkuCheckTransactionResponse {
  merchantOrderId: string;
  reference: string;
  amount: string;
  fee?: string;
  statusCode: string;
  statusMessage: string;
}

@Injectable()
export class DuitkuService {
  private readonly logger = new Logger(DuitkuService.name);
  private readonly baseUrl: string;

  constructor(
    @Inject(DUITKU_MODULE_OPTIONS) private readonly options: DuitkuModuleOptions,
    private readonly httpService: HttpService,
    private readonly eventEmitter: EventEmitter2,
    @InjectRepository(PaymentTransaction)
    private readonly paymentRepo: Repository<PaymentTransaction>
  ) {
    this.baseUrl = DUITKU_BASE_URL[this.options.env];
  }

  /**
   * Creates a QRIS payment request with Duitku and persists a pending
   * PaymentTransaction. Returns the record including `qrString` (render
   * this as a QR code on the frontend) and `paymentUrl` (fallback link).
   */
  async createQrisPayment(dto: CreatePaymentDto): Promise<PaymentTransaction> {
    const merchantOrderId = generateMerchantOrderId(dto.purpose, dto.referenceId);
    const paymentMethod = dto.paymentMethod ?? DuitkuQrisMethod.QRIS_STANDARD;
    const expiryPeriod = dto.expiryPeriod ?? this.options.defaultExpiryMinutes ?? 10;

    const signature = buildRequestSignature(
      this.options.merchantCode,
      merchantOrderId,
      dto.amount,
      this.options.apiKey
    );

    const payload = {
      merchantCode: this.options.merchantCode,
      paymentAmount: dto.amount,
      paymentMethod,
      merchantOrderId,
      productDetails: dto.productDetails,
      email: dto.customerEmail || 'no-reply@example.com',
      phoneNumber: dto.phoneNumber,
      customerVaName: dto.customerName || 'Customer',
      callbackUrl: this.options.callbackUrl,
      returnUrl: this.options.returnUrl,
      expiryPeriod,
      signature
    };

    let response: DuitkuCreateTransactionResponse;
    try {
      const { data } = await firstValueFrom(
        this.httpService.post<DuitkuCreateTransactionResponse>(
          `${this.baseUrl}${DUITKU_ENDPOINT.createTransaction}`,
          payload,
          { headers: { 'Content-Type': 'application/json' } }
        )
      );
      response = data;
    } catch (err: any) {
      this.logger.error(`Duitku createTransaction failed: ${err.message}`, err.stack);
      throw new BadRequestException(
        err.response?.data?.Message || 'Failed to create Duitku transaction'
      );
    }

    if (response.statusCode !== '00') {
      throw new BadRequestException(
        response.statusMessage || 'Duitku rejected the transaction request'
      );
    }

    const expiredAt = new Date(Date.now() + expiryPeriod * 60_000);

    const transaction = this.paymentRepo.create({
      merchantOrderId,
      reference: response.reference,
      purpose: dto.purpose,
      referenceId: dto.referenceId,
      amount: dto.amount,
      paymentMethod,
      qrString: response.qrString,
      paymentUrl: response.paymentUrl,
      status: PaymentStatus.PENDING,
      customerName: dto.customerName,
      customerEmail: dto.customerEmail,
      phoneNumber: dto.phoneNumber,
      productDetails: dto.productDetails,
      expiredAt
    });

    return this.paymentRepo.save(transaction);
  }

  /**
   * Actively polls Duitku for the current status of a transaction and
   * syncs the local record. Useful for a "check now" button, or as a
   * safety net alongside the callback (e.g. a cron that sweeps PENDING
   * transactions older than a few minutes).
   */
  async checkStatus(merchantOrderId: string): Promise<PaymentTransaction> {
    const transaction = await this.paymentRepo.findOne({ where: { merchantOrderId } });
    if (!transaction) {
      throw new NotFoundException(`Transaction ${merchantOrderId} not found`);
    }

    // Already settled locally — no need to call Duitku again.
    if (transaction.status !== PaymentStatus.PENDING) {
      return transaction;
    }

    const signature = buildStatusSignature(
      this.options.merchantCode,
      merchantOrderId,
      this.options.apiKey
    );

    const { data } = await firstValueFrom(
      this.httpService.post<DuitkuCheckTransactionResponse>(
        `${this.baseUrl}${DUITKU_ENDPOINT.checkTransaction}`,
        {
          merchantCode: this.options.merchantCode,
          merchantOrderId,
          signature
        },
        { headers: { 'Content-Type': 'application/json' } }
      )
    );

    if (data.statusCode === DuitkuStatusCode.SUCCESS) {
      return this.markPaid(transaction, { reference: data.reference });
    }
    if (data.statusCode === DuitkuStatusCode.FAILED_OR_EXPIRED) {
      return this.markFailed(transaction);
    }
    // statusCode "01" = still processing — leave as PENDING.
    return transaction;
  }

  /**
   * Verifies the signature on an incoming Duitku callback.
   * Formula: MD5(merchantCode + amount + merchantOrderId + apiKey)
   */
  verifyCallbackSignature(payload: DuitkuCallbackDto): boolean {
    const expected = buildCallbackSignature(
      this.options.merchantCode,
      payload.amount,
      payload.merchantOrderId,
      this.options.apiKey
    );
    return expected === payload.signature;
  }

  /**
   * Processes a verified Duitku callback: updates the transaction and
   * emits an event so other modules (billing/voucher/reseller) can act.
   * Idempotent — safe to call more than once for the same order id
   * (Duitku may retry callbacks).
   */
  async handleCallback(payload: DuitkuCallbackDto): Promise<void> {
    if (!this.verifyCallbackSignature(payload)) {
      this.logger.warn(`Rejected Duitku callback with bad signature: ${payload.merchantOrderId}`);
      throw new BadRequestException('Invalid signature');
    }

    const transaction = await this.paymentRepo.findOne({
      where: { merchantOrderId: payload.merchantOrderId }
    });
    if (!transaction) {
      this.logger.warn(`Callback for unknown merchantOrderId: ${payload.merchantOrderId}`);
      throw new NotFoundException('Transaction not found');
    }

    // Idempotency: don't re-process or re-emit for an already-settled transaction.
    if (transaction.status !== PaymentStatus.PENDING) {
      return;
    }

    transaction.rawCallback = { ...payload };
    if (payload.publisherOrderId) {
      transaction.publisherOrderId = payload.publisherOrderId;
    }

    if (payload.resultCode === DuitkuResultCode.SUCCESS) {
      await this.markPaid(transaction, { reference: payload.reference });
    } else {
      await this.markFailed(transaction);
    }
  }

  private async markPaid(
    transaction: PaymentTransaction,
    extra: { reference?: string } = {}
  ): Promise<PaymentTransaction> {
    transaction.status = PaymentStatus.PAID;
    transaction.paidAt = new Date();
    if (extra.reference) transaction.reference = extra.reference;

    const saved = await this.paymentRepo.save(transaction);
    this.eventEmitter.emit(DUITKU_EVENTS.PAID, new PaymentStatusChangedEvent(saved));
    return saved;
  }

  private async markFailed(transaction: PaymentTransaction): Promise<PaymentTransaction> {
    transaction.status =
      transaction.expiredAt && transaction.expiredAt < new Date()
        ? PaymentStatus.EXPIRED
        : PaymentStatus.FAILED;

    const saved = await this.paymentRepo.save(transaction);
    this.eventEmitter.emit(DUITKU_EVENTS.FAILED, new PaymentStatusChangedEvent(saved));
    return saved;
  }
}
