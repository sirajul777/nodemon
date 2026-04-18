import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { BillingService } from './billing.service';
import { ConfigService } from '../config/config.service';

@Injectable()
export class BillingSchedulerService implements OnModuleInit {
  private readonly logger = new Logger(BillingSchedulerService.name);
  private telegramService: any = null;

  constructor(
    private readonly billingSvc: BillingService,
    private readonly configSvc: ConfigService,
  ) {}

  setTelegramService(tg: any) { this.telegramService = tg; }

  onModuleInit() {
    // Run at startup, then every hour
    setTimeout(() => this.runDaily(), 5000);
    setInterval(() => this.runDaily(), 60 * 60 * 1000);
  }

  async runDaily() {
    const sessions:any = this.configSvc.getSessions || [];
    // for (const session of sessions) {
      try {
        await this.processSession(sessions.id);
      } catch(e) {
        this.logger.error(`Billing error for ${sessions.id}: ${e}`);
      }
    // }
  }

  async processSession(sessionId: string) {
    const now = new Date();
    // Generate invoices on the 1st of each month at midnight
    if (now.getDate() === 1 && now.getHours() === 0) {
      const result = this.billingSvc.generateMonthlyInvoices(sessionId);
      this.logger.log(`Auto-generated invoices for ${sessionId}: ${result.created} created`);
    }

    // Send reminders
    const reminders = this.billingSvc.getRemindableInvoices(sessionId);
    for (const { customer, invoice, daysLeft } of reminders) {
      if (customer.telegramId && this.telegramService) {
        const msg = this.buildReminderMsg(customer, invoice, daysLeft);
        await this.telegramService.sendMessage(customer.telegramId, msg);
        this.billingSvc.markReminderSent(invoice.id);
        this.logger.log(`Reminder sent to ${customer.name} (${daysLeft} days left)`);
      }
    }

    // Check overdue — actual disable is triggered via API, just mark here
    const overdue = this.billingSvc.getOverdueCustomers(sessionId);
    if (overdue.length > 0) {
      this.logger.warn(`${overdue.length} overdue customers in ${sessionId}`);
    }
  }

  private buildReminderMsg(customer: any, invoice: any, daysLeft: number): string {
    const urgency = daysLeft <= 1 ? '🔴' : daysLeft <= 3 ? '🟡' : '🔵';
    const dateStr = new Date(invoice.dueDate).toLocaleDateString('id-ID', { dateStyle: 'long' });
    let text = `${urgency} <b>Pengingat Tagihan</b>\n\n`;
    text += `Halo <b>${customer.name}</b>,\n\n`;
    text += `Tagihan internet Anda untuk periode <b>${invoice.period}</b> `;
    if (daysLeft === 0) {
      text += `<b>jatuh tempo HARI INI!</b>\n\n`;
    } else if (daysLeft < 0) {
      text += `sudah <b>melewati jatuh tempo</b> ${Math.abs(daysLeft)} hari!\n\n`;
    } else {
      text += `akan jatuh tempo dalam <b>${daysLeft} hari</b> (${dateStr}).\n\n`;
    }
    text += `💰 Tagihan: <b>Rp ${Math.round(invoice.amount).toLocaleString('id-ID')}</b>\n`;
    text += `📦 Paket: ${customer.profile}\n`;
    text += `\nSilakan lakukan pembayaran sebelum jatuh tempo untuk menghindari pemutusan layanan.\n`;
    text += `\nTerima kasih 🙏`;
    return text;
  }
}