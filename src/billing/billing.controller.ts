import { Controller, Get, Post, Put, Delete, Patch, Param, Query, Body, UseGuards } from '@nestjs/common';
import { BillingService, BillingCustomer } from './billing.service';
import { MikrotikService } from '../mikrotik/mikrotik.service';
import { ConfigService } from '../config/config.service';
import { AuthGuard } from '../auth/auth.guard';

@Controller('api/billing')
@UseGuards(AuthGuard)
export class BillingController {
  private telegramSvc: any = null;
  setTelegramService(tg: any) { this.telegramSvc = tg; }

  constructor(
    private readonly billingSvc: BillingService,
    private readonly mikrotikSvc: MikrotikService,
    private readonly configSvc: ConfigService,
  ) {}

  private getConn(sessionId: string) {
    const s = this.configSvc.getDecryptedSession(sessionId);
    if (!s) throw new Error(`Session not found`);
    return { ip: s.ip, user: s.user, password: s.password, port: s.port || 8728 };
  }

  // ── Stats ────────────────────────────────────────────────────────
  @Get(':session/stats')
  getStats(@Param('session') session: string) {
    return this.billingSvc.getStats(session);
  }

  // ── Customers ────────────────────────────────────────────────────
  @Get(':session/customers')
  getCustomers(@Param('session') session: string) {
    return this.billingSvc.loadCustomers(session);
  }

  @Get(':session/customers/:id')
  getCustomer(@Param('id') id: string) {
    return this.billingSvc.getCustomer(id) || { error: 'Not found' };
  }

  @Post(':session/customers')
  createCustomer(@Param('session') session: string, @Body() body: any) {
    return this.billingSvc.saveCustomer({ ...body, sessionId: session });
  }

  @Put(':session/customers/:id')
  updateCustomer(@Param('session') session: string, @Param('id') id: string, @Body() body: any) {
    return this.billingSvc.saveCustomer({ ...body, id, sessionId: session });
  }

  @Delete(':session/customers/:id')
  deleteCustomer(@Param('id') id: string) {
    return { success: this.billingSvc.deleteCustomer(id) };
  }

  // ── Invoices ─────────────────────────────────────────────────────
  @Get(':session/invoices')
  getInvoices(@Param('session') session: string, @Query('customerId') customerId?: string) {
    return this.billingSvc.loadInvoices(session, customerId);
  }

  @Post(':session/invoices/generate')
  generateInvoices(@Param('session') session: string) {
    return this.billingSvc.generateMonthlyInvoices(session);
  }

  @Post(':session/invoices/:id/pay')
  payInvoice(@Param('id') id: string, @Body() body: { paidBy?: string; note?: string }) {
    const inv = this.billingSvc.payInvoice(id, body.paidBy || 'Admin', body.note);
    return inv ? { success: true, invoice: inv } : { error: 'Not found' };
  }

  @Post(':session/invoices/manual')
  createManual(@Param('session') session: string, @Body() body: { customerId: string; period?: string; dueDate?: string }) {
    const cust = this.billingSvc.getCustomer(body.customerId);
    if (!cust) return { error: 'Customer not found' };
    return this.billingSvc.createInvoice(cust, body.period, body.dueDate);
  }

  // ── Auto actions ─────────────────────────────────────────────────
  @Post(':session/run-overdue')
  async runOverdue(@Param('session') session: string) {
    const overdue = this.billingSvc.getOverdueCustomers(session);
    if (!overdue.length) return { success: true, disabled: 0 };
    const { ip, user, password, port } = this.getConn(session);
    const client = await this.mikrotikSvc.createClient(ip, user, password, port);
    let disabled = 0;
    try {
      for (const { customer } of overdue) {
        try {
          if (customer.type === 'pppoe') {
            const secrets = await client.run('/ppp/secret/print', { '?name': customer.mikrotikUser });
            if (secrets[0]?.['.id']) {
              await client.run('/ppp/secret/disable', { '.id': secrets[0]['.id'] });
              disabled++;
            }
          } else {
            const users = await client.run('/ip/hotspot/user/print', { '?name': customer.mikrotikUser });
            if (users[0]?.['.id']) {
              await client.run('/ip/hotspot/user/disable', { '.id': users[0]['.id'] });
              disabled++;
            }
          }
          // Update customer status
          this.billingSvc.saveCustomer({ ...customer, status: 'suspended' });
        } catch {}
      }
    } finally { client.close(); }
    return { success: true, disabled, total: overdue.length };
  }

  @Post(':session/customers/:id/re-enable')
  async reEnable(@Param('session') session: string, @Param('id') id: string) {
    const cust = this.billingSvc.getCustomer(id);
    if (!cust) return { error: 'Not found' };
    const { ip, user, password, port } = this.getConn(session);
    const client = await this.mikrotikSvc.createClient(ip, user, password, port);
    try {
      if (cust.type === 'pppoe') {
        const s = await client.run('/ppp/secret/print', { '?name': cust.mikrotikUser });
        if (s[0]?.['.id']) await client.run('/ppp/secret/enable', { '.id': s[0]['.id'] });
      } else {
        const u = await client.run('/ip/hotspot/user/print', { '?name': cust.mikrotikUser });
        if (u[0]?.['.id']) await client.run('/ip/hotspot/user/enable', { '.id': u[0]['.id'] });
      }
      this.billingSvc.saveCustomer({ ...cust, status: 'active' });
      return { success: true };
    } finally { client.close(); }
  }

  // Quick import from PPPoE secrets/hotspot users
  @Post(':session/invoices/:id/send-reminder')
  async sendReminder(@Param('session') session: string, @Param('id') id: string) {
    const inv = this.billingSvc.getInvoice(id);
    if (!inv) return { error: 'Invoice not found' };
    const cust = this.billingSvc.getCustomer(inv.customerId);
    if (!cust?.telegramId) return { error: 'Pelanggan tidak memiliki Telegram ID' };
    if (!this.telegramSvc) return { error: 'Telegram service belum dikonfigurasi' };

    const daysLeft = this.billingSvc.getDaysUntilDue(inv.dueDate);
    const urgency = daysLeft <= 1 ? '🔴' : daysLeft <= 3 ? '🟡' : '🔵';
    const mon = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
    const dueDate = new Date(inv.dueDate);
    const dateStr = `${dueDate.getDate()} ${mon[dueDate.getMonth()]} ${dueDate.getFullYear()}`;

    let text = `${urgency} <b>Pengingat Tagihan</b>\n\n`;
    text += `Halo <b>${cust.name}</b>,\n\n`;
    text += `Tagihan internet Anda untuk periode <b>${inv.period}</b> `;
    if (daysLeft === 0) text += `<b>jatuh tempo HARI INI!</b>\n\n`;
    else if (daysLeft < 0) text += `sudah <b>melewati jatuh tempo</b> ${Math.abs(daysLeft)} hari!\n\n`;
    else text += `akan jatuh tempo dalam <b>${daysLeft} hari</b> (${dateStr}).\n\n`;
    text += `💰 Tagihan: <b>Rp ${Math.round(inv.amount).toLocaleString('id-ID')}</b>\n`;
    text += `📦 Paket: ${cust.profile}\n\nSilakan lakukan pembayaran. Terima kasih 🙏`;

    const ok = await this.telegramSvc.sendMessage(cust.telegramId, text);
    if (ok) this.billingSvc.markReminderSent(id);
    return ok ? { success: true } : { error: 'Gagal mengirim pesan Telegram' };
  }

  @Get(':session/import-users/:type')
  async importUsers(@Param('session') session: string, @Param('type') type: 'pppoe' | 'hotspot') {
    const { ip, user, password, port } = this.getConn(session);
    const client = await this.mikrotikSvc.createClient(ip, user, password, port);
    try {
      if (type === 'pppoe') {
        const secrets = await client.run('/ppp/secret/print');
        return secrets.map(s => ({
          username: s.name, profile: s.profile || '', comment: s.comment || '',
          service: s.service || 'pppoe',
        }));
      } else {
        const users = await client.run('/ip/hotspot/user/print');
        return users.map(u => ({
          username: u.name, profile: u.profile || '', comment: u.comment || '',
        }));
      }
    } finally { client.close(); }
  }
}