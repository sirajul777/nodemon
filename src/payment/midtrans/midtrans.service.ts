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
  MIDTRANS_BASE_URL,
  MIDTRANS_ENDPOINT,
  MIDTRANS_EVENTS,
  MIDTRANS_MODULE_OPTIONS,
  MidtransQrisAcquirer,
  MidtransTransactionStatus,
  PaymentStatus
} from './midtrans.constants';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { MidtransNotificationDto } from './dto/midtrans-notification.dto';
import { PaymentTransaction } from './entities/payment-transaction.entity';
import { PaymentStatusChangedEvent } from './events/payment-status-changed.event';
import { MidtransModuleOptions } from './interfaces/midtrans-module-options.interface';
import {
  buildBasicAuthHeader,
  buildNotificationSignature,
  generateOrderId
} from './midtrans.util';

interface MidtransChargeResponse {
  status_code: string;
  status_message: string;
  transaction_id: string;
  order_id: string;
  merchant_id: string;
  gross_amount: string;
  currency: string;
  payment_type: string;
  transaction_time: string;
  transaction_status: string;
  fraud_status?: string;
  acquirer?: string;
  actions?: { name: string; method: string; url: string }[];
}

interface MidtransStatusResponse {
  status_code: string;
  status_message: string;
  transaction_id: string;
  order_id: string;
  gross_amount: string;
  transaction_status: string;
  fraud_status?: string;
}

@Injectable()
export class MidtransService {
  private readonly logger = new Logger(MidtransService.name);
  private readonly baseUrl: string;
  private readonly authHeader: string;

  constructor(
    @Inject(MIDTRANS_MODULE_OPTIONS) private readonly options: MidtransModuleOptions,
    private readonly httpService: HttpService,
    private readonly eventEmitter: EventEmitter2,
    @InjectRepository(PaymentTransaction)
    private readonly paymentRepo: Repository<PaymentTransaction>
  ) {
    this.baseUrl = MIDTRANS_BASE_URL[this.options.env];
    this.authHeader = buildBasicAuthHeader(this.options.serverKey);
  }

  /**
   * Creates a QRIS charge with Midtrans and persists a pending
   * PaymentTransaction. Returns the record including `qrCodeUrl`
   * (an image URL you can render directly with an <img> tag).
   */
  async createQrisPayment(dto: CreatePaymentDto): Promise<PaymentTransaction> {
    const orderId = generateOrderId(dto.purpose, dto.referenceId);
    const acquirer =
      dto.acquirer || this.options.defaultAcquirer || MidtransQrisAcquirer.GOPAY;

    const payload = {
      payment_type: 'qris',
      transaction_details: {
        order_id: orderId,
        gross_amount: dto.amount
      },
      customer_details: dto.customerEmail
        ? {
            first_name: dto.customerFirstName,
            last_name: dto.customerLastName,
            email: dto.customerEmail,
            phone: dto.phoneNumber
          }
        : undefined,
      qris: { acquirer }
    };

    let response: MidtransChargeResponse;
    try {
      const { data } = await firstValueFrom(
        this.httpService.post<MidtransChargeResponse>(
          `${this.baseUrl}${MIDTRANS_ENDPOINT.charge}`,
          payload,
          {
            headers: {
              Accept: 'application/json',
              'Content-Type': 'application/json',
              Authorization: this.authHeader
            }
          }
        )
      );
      response = data;
    } catch (err: any) {
      this.logger.error(`Midtrans charge failed: ${err.message}`, err.stack);
      throw new BadRequestException(
        err.response?.data?.status_message || 'Failed to create Midtrans QRIS charge'
      );
    }

    // 200/201 = success for charge creation.
    if (!['200', '201'].includes(response.status_code)) {
      throw new BadRequestException(
        response.status_message || 'Midtrans rejected the charge request'
      );
    }

    const qrAction = response.actions?.find((a) => a.name === 'generate-qr-code');

    const transaction = this.paymentRepo.create({
      orderId,
      transactionId: response.transaction_id,
      purpose: dto.purpose,
      referenceId: dto.referenceId,
      amount: dto.amount,
      acquirer,
      qrCodeUrl: qrAction?.url,
      status: PaymentStatus.PENDING,
      transactionStatus: response.transaction_status,
      customerName: [dto.customerFirstName, dto.customerLastName]
        .filter(Boolean)
        .join(' '),
      customerEmail: dto.customerEmail,
      phoneNumber: dto.phoneNumber,
      productDetails: dto.productDetails
    });

    return this.paymentRepo.save(transaction);
  }

  /**
   * Actively polls Midtrans for the current status of a transaction and
   * syncs the local record. Useful for a "check now" button, or as a
   * safety net alongside the webhook (e.g. a cron sweeping PENDING
   * transactions older than a few minutes — QRIS defaults to a short expiry).
   */
  async checkStatus(orderId: string): Promise<PaymentTransaction> {
    const transaction = await this.paymentRepo.findOne({ where: { orderId } });
    if (!transaction) {
      throw new NotFoundException(`Transaction ${orderId} not found`);
    }

    if (transaction.status !== PaymentStatus.PENDING) {
      return transaction;
    }

    const { data } = await firstValueFrom(
      this.httpService.get<MidtransStatusResponse>(
        `${this.baseUrl}${MIDTRANS_ENDPOINT.status(orderId)}`,
        { headers: { Accept: 'application/json', Authorization: this.authHeader } }
      )
    );

    return this.applyStatus(transaction, data.transaction_status);
  }

  /**
   * Verifies the signature on an incoming Midtrans notification.
   * Formula: SHA512(order_id + status_code + gross_amount + serverKey)
   */
  verifyNotificationSignature(payload: MidtransNotificationDto): boolean {
    const expected = buildNotificationSignature(
      payload.order_id,
      payload.status_code,
      payload.gross_amount,
      this.options.serverKey
    );
    return expected === payload.signature_key;
  }

  /**
   * Processes a verified Midtrans notification: updates the transaction
   * and emits an event so other modules (billing/voucher/reseller) can act.
   * Idempotent — safe to call more than once for the same order id
   * (Midtrans retries notifications until it gets a 200 response).
   */
  async handleNotification(payload: MidtransNotificationDto): Promise<void> {
    if (!this.verifyNotificationSignature(payload)) {
      this.logger.warn(`Rejected Midtrans notification with bad signature: ${payload.order_id}`);
      throw new BadRequestException('Invalid signature');
    }

    const transaction = await this.paymentRepo.findOne({
      where: { orderId: payload.order_id }
    });
    if (!transaction) {
      this.logger.warn(`Notification for unknown order_id: ${payload.order_id}`);
      throw new NotFoundException('Transaction not found');
    }

    // Idempotency: don't re-process or re-emit for an already-settled transaction.
    if (transaction.status !== PaymentStatus.PENDING) {
      return;
    }

    transaction.rawNotification = { ...payload };
    transaction.transactionId = payload.transaction_id || transaction.transactionId;

    await this.applyStatus(transaction, payload.transaction_status);
  }

  /**
   * Central place that maps a Midtrans transaction_status string onto
   * our internal PaymentStatus, saves, and emits the right event.
   * Used by both the polling path (checkStatus) and the webhook path
   * (handleNotification) so their behavior never drifts apart.
   */
  private async applyStatus(
    transaction: PaymentTransaction,
    transactionStatus: string
  ): Promise<PaymentTransaction> {
    transaction.transactionStatus = transactionStatus;

    switch (transactionStatus) {
      case MidtransTransactionStatus.SETTLEMENT:
      case MidtransTransactionStatus.CAPTURE:
        return this.markPaid(transaction);

      case MidtransTransactionStatus.DENY:
      case MidtransTransactionStatus.CANCEL:
        transaction.status = PaymentStatus.FAILED;
        return this.markFailed(transaction);

      case MidtransTransactionStatus.EXPIRE:
        transaction.status = PaymentStatus.EXPIRED;
        return this.markFailed(transaction);

      case MidtransTransactionStatus.PENDING:
      default:
        // Still waiting — leave as PENDING, just persist the raw status.
        return this.paymentRepo.save(transaction);
    }
  }

  private async markPaid(transaction: PaymentTransaction): Promise<PaymentTransaction> {
    transaction.status = PaymentStatus.PAID;
    transaction.paidAt = new Date();

    const saved = await this.paymentRepo.save(transaction);
    this.eventEmitter.emit(MIDTRANS_EVENTS.PAID, new PaymentStatusChangedEvent(saved));
    return saved;
  }

  private async markFailed(transaction: PaymentTransaction): Promise<PaymentTransaction> {
    const saved = await this.paymentRepo.save(transaction);
    this.eventEmitter.emit(MIDTRANS_EVENTS.FAILED, new PaymentStatusChangedEvent(saved));
    return saved;
  }
}
