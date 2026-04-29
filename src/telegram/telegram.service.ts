import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import { VoucherTypeService, VoucherType } from '../voucher-types/voucher-type.service';
import { BotResellerTelegramService } from '../reseller-bot/bot-reseller-telegram.service';
import { BotResellerService } from '../reseller-bot/bot-reseller.service';

export interface TelegramConfig {
  token: string;
  chatId: string;
  sessionId: string;
  notifSale: boolean;
  notifDaily: boolean;
  dailyTime: string;
  botEnabled: boolean;
  allowedUsers: string[];
  defaultProfile: string;
  welcomeMsg: string;
}

interface LogEntry { time: string; from: string; message: string; }

// Session state for multi-step conversations
interface UserState {
  step: string;           // 'select_profile' | 'select_qty' | 'confirm_beli' | 'confirm_generate'
  profile?: string;
  qty?: number;
  profiles?: any[];       // cached profile list
  expiresAt: number;
}

const INDO_CURR   = ['RP','Rp','rp','IDR','idr'];

// Tambah di atas @Injectable()
interface TopupRequest {
  id: string;
  resellerId: string;
  resellerName: string;
  telegramId: string;
  amount: number;
  note: string;
  requestedAt: string;
  status: 'pending' | 'approved' | 'rejected';
}


@Injectable()
export class TelegramService implements OnModuleInit {
  private readonly logger = new Logger(TelegramService.name);
  private polling = false;
  private lastUpdateId = 0;
  private dailyTimer: NodeJS.Timeout | null = null;
  private currentBotToken: string | null = null;

  // Per-user conversation state (chatId → state)
  private userStates = new Map<string, UserState>();

  private mikrotikService: any = null;
  private configService: any = null;

  private vtService: VoucherTypeService | null = null;
  private resellerSvc: BotResellerService | null = null;
  private resellerTgSvc: BotResellerTelegramService | null = null;

  private getFilePath(base: string, sessionId?: string): string {
    if (!sessionId) {
      // Fallback ke router pertama jika sessionId tidak diberikan
      const cfg = this.configService?.getAllSessions();
      sessionId = cfg ? Object.keys(cfg)[0] : 'default';
    }
    const filename = sessionId ? `${base.replace('.json', '')}-${sessionId}.json` : base;
    return path.join(process.cwd(), 'data', filename);
  }

  setServices(mikrotik: any, config: any, vtService?: VoucherTypeService, resellerSvc?: BotResellerService, resellerTgSvc?: BotResellerTelegramService) {
    this.mikrotikService = mikrotik;
    this.configService = config;
    if (vtService) this.vtService = vtService;
    if (resellerSvc) this.resellerSvc = resellerSvc;
    if (resellerTgSvc) this.resellerTgSvc = resellerTgSvc;
  }

  onModuleInit() {
    // Beri waktu sebentar agar ConfigService siap
    setTimeout(() => this.startPolling(), 5000);
    this.scheduleDailyReport();
    setInterval(() => this.cleanupStates(), 10 * 60 * 1000);
  }

  // ── Config ────────────────────────────────────────────

  getConfig(sessionId?: string): TelegramConfig | null {
    try {
      const file = this.getFilePath('telegram.json', sessionId);
      if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {}
    return null;
  }

  saveConfig(config: TelegramConfig): void {
    const file = this.getFilePath('telegram.json', config.sessionId);
    const dir = path.dirname(file);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(file, JSON.stringify(config, null, 2));
    
    // Restart polling jika token berubah atau bot baru diaktifkan
    this.polling = false; 
    setTimeout(() => this.startPolling(), 1000);
    this.scheduleDailyReport();
  }

  // ── Logs ──────────────────────────────────────────────

  getLogs(sessionId?: string): LogEntry[] {
    try {
      const file = this.getFilePath('telegram-log.json', sessionId);
      if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {}
    return [];
  }

  private addLog(from: string, message: string, sessionId?: string): void {
    const logs = this.getLogs(sessionId);
    logs.push({ time: new Date().toLocaleString('id-ID'), from, message });
    if (logs.length > 200) logs.splice(0, logs.length - 200);
    const file = this.getFilePath('telegram-log.json', sessionId);
    fs.writeFileSync(file, JSON.stringify(logs, null, 2));
  }

  // ── State management ──────────────────────────────────

  private setState(chatId: string, state: Partial<UserState>): void {
    const current = this.userStates.get(chatId) || { step: '', expiresAt: 0 };
    this.userStates.set(chatId, {
      ...current, ...state,
      expiresAt: Date.now() + 5 * 60 * 1000, // 5 min TTL
    });
  }

  private getState(chatId: string): UserState | null {
    const s = this.userStates.get(chatId);
    if (!s || s.expiresAt < Date.now()) { this.userStates.delete(chatId); return null; }
    return s;
  }

  private clearState(chatId: string): void {
    this.userStates.delete(chatId);
  }

  private cleanupStates(): void {
    const now = Date.now();
    for (const [id, s] of this.userStates) {
      if (s.expiresAt < now) this.userStates.delete(id);
    }
  }

  private readonly TOPUP_FILE = path.join(process.cwd(), 'data', 'topup-requests.json');

  private loadTopupRequests(): TopupRequest[] {
    try {
      if (fs.existsSync(this.TOPUP_FILE)) {
        return JSON.parse(fs.readFileSync(this.TOPUP_FILE, 'utf8'));
      }
    } catch {}
    return [];
  }

  private saveTopupRequests(requests: TopupRequest[]) {
    const dir = path.dirname(this.TOPUP_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(this.TOPUP_FILE, JSON.stringify(requests, null, 2));
  }

  private addTopupRequest(req: TopupRequest) {
    const requests = this.loadTopupRequests();
    requests.unshift(req);
    // Simpan max 100 request
    if (requests.length > 100) requests.splice(100);
    this.saveTopupRequests(requests);
  }

  // ── Telegram API ──────────────────────────────────────

  private async apiCall(token: string, method: string, body: any = {}): Promise<any> {
    return new Promise((resolve, reject) => {
      const bodyStr = JSON.stringify(body);
      const options = {
        hostname: 'api.telegram.org',
        path: `/bot${token}/${method}`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(bodyStr),
        },
        timeout: 30000,
      };
      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', d => data += d);
        res.on('end', () => {
          try { resolve(JSON.parse(data)); } catch { reject(new Error('Invalid JSON')); }
        });
      });
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
      req.write(bodyStr);
      req.end();
    });
  }

  async sendMessage(chatId: string, text: string, extra: any = {}): Promise<any> {
    const cfg = this.getConfig();
    if (!cfg?.token) return null;
    try {
      const res = await this.apiCall(cfg.token, 'sendMessage', {
        chat_id: chatId, text, parse_mode: 'HTML', ...extra,
      });
      return res;
    } catch (e) {
      this.logger.error('sendMessage error: ' + e);
      return null;
    }
  }

  private async editMessage(chatId: string, messageId: number, text: string, extra: any = {}): Promise<void> {
    const cfg = this.getConfig();
    if (!cfg?.token) return;
    try {
      await this.apiCall(cfg.token, 'editMessageText', {
        chat_id: chatId, message_id: messageId,
        text, parse_mode: 'HTML', ...extra,
      });
    } catch (e) {
      this.logger.warn('editMessage error: ' + e);
    }
  }

  private async answerCallback(callbackQueryId: string, text?: string): Promise<void> {
    const cfg = this.getConfig();
    if (!cfg?.token) return;
    try {
      await this.apiCall(cfg.token, 'answerCallbackQuery', {
        callback_query_id: callbackQueryId,
        text: text || '',
        show_alert: false,
      });
    } catch {}
  }

  async sendTest(token: string, chatId: string, sessionId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const res = await this.apiCall(token, 'sendMessage', {
        chat_id: chatId,
        text: `🤖 <b>MikHMon Bot Test</b>\n\n✅ Koneksi berhasil!\nSession: <code>${sessionId}</code>\nWaktu: ${new Date().toLocaleString('id-ID')}\n\nKetik /beli untuk membeli voucher.`,
        parse_mode: 'HTML',
      });
      if (res.ok) { this.addLog('SYSTEM', `Test sent to ${chatId}`); return { success: true }; }
      return { success: false, error: res.description || 'Failed' };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }

  // ── Polling ───────────────────────────────────────────

  private async startPolling(): Promise<void> {
    const cfg = this.getConfig();
    if (!cfg?.token || !cfg.botEnabled) return;
    if (this.polling) return;
    this.polling = true;
    this.logger.log('Telegram bot polling started');

    while (this.polling) {
      try {
        const cfg2 = this.getConfig();
        if (!cfg2?.token || !cfg2.botEnabled) { this.polling = false; break; }

        const res = await this.apiCall(cfg2.token, 'getUpdates', {
          offset: this.lastUpdateId + 1,
          timeout: 25,
          allowed_updates: ['message', 'callback_query'],
        });
        if (res.ok && res.result?.length) {
          for (const update of res.result) {
            this.lastUpdateId = update.update_id;
            if (update.message) await this.handleMessage(update.message);
            else if (update.callback_query) await this.handleCallback(update.callback_query);
          }
        }
      } catch (e) {
        if (this.polling) {
          this.logger.warn('Polling error: ' + e);
          await new Promise(r => setTimeout(r, 5000));
        }
      }
    }
    this.logger.log('Telegram bot polling stopped');
  }


  // ── Message Handler ───────────────────────────────────

  private async handleMessage(msg: any): Promise<void> {
    const chatId   = String(msg.chat.id);
    const userId   = String(msg.from.id);
    const username = msg.from.username || msg.from.first_name || userId;
    const text     = (msg.text || '').trim();
    const cfg      = this.getConfig();

    if (!cfg) return;

    const isAdmin   = chatId === cfg.chatId || cfg.allowedUsers?.includes(userId);
    const isSeller  = isAdmin; // same access level; can be extended later

    // Handle non-command text (e.g., user typed quantity during multi-step)
    if (!text.startsWith('/')) {
      const state = this.getState(chatId);
      if (state?.step === 'awaiting_qty') {
        await this.handleQtyInput(chatId, userId, username, text, cfg);
        return;
      }
      if (state?.step === 'awaiting_topup_amount') {
        await this.handleTopupAmountInput(chatId, userId, username, text, cfg);
        return;
      }
      return;
    }

    this.addLog(username, text);
    const [cmd, ...args] = text.split(' ');
    const command = cmd.toLowerCase().split('@')[0];

    // Auth check
    const openCmds = ['/start', '/help', '/cek', '/saldo', '/daftar', '/riwayat', '/profil', '/profile'];
    if (!openCmds.includes(command) && !isSeller) {
      await this.sendMessage(chatId,
        '⛔ Akses ditolak.\n\nHubungi admin untuk mendapatkan akses bot ini.'
      );
      return;
    }

    switch (command) {
      case '/start':
      case '/help':     await this.handleHelp(chatId, isAdmin); break;
      case '/beli':     await this.handleBeliMenu(chatId, userId, username, args, cfg, 'beli'); break;
      case '/generate': await this.handleBeliMenu(chatId, userId, username, args, cfg, 'generate'); break;
      case '/profil':
      case '/profile':  await this.handleProfil(chatId, cfg); break;
      case '/cek':      await this.handleCek(chatId, args, cfg); break;
      case '/status':   if(isAdmin) await this.handleStatus(chatId, cfg); break;
      case '/aktif':    if(isAdmin) await this.handleAktif(chatId, cfg); break;
      case '/rekap':
      case '/today':    if(isAdmin) await this.handleRekap(chatId, 'today', cfg); break;
      case '/bulan':
      case '/month':    if(isAdmin) await this.handleRekap(chatId, 'month', cfg); break;
      case '/pppoe':    if(isAdmin) await this.handlePppoe(chatId, cfg); break;
      case '/hapus':    if(isAdmin) await this.handleHapus(chatId, args, cfg); break;
      // Reseller commands
      case '/daftar':   await this.handleDaftar(chatId, userId, username, cfg); break;
      case '/saldo':    await this.handleSaldo(chatId, userId, cfg); break;
      case '/riwayat':  await this.handleRiwayat(chatId, userId, cfg); break;
    // Tambah di switch(command)
      case '/topup':    await this.handleTopupRequest(chatId, userId, username, args, cfg); break;
      case '/cektopup': await this.handleCekTopup(chatId, userId, cfg); break;
      case '/resellers': if(isAdmin) await this.handleListResellers(chatId, cfg); break;
      default:
        await this.sendMessage(chatId, '❓ Perintah tidak dikenal. Ketik /help.');
    }
  }

  // ── Callback Query Handler (inline keyboard) ──────────

  private async handleCallback(cb: any): Promise<void> {
    const chatId   = String(cb.message.chat.id);
    const userId   = String(cb.from.id);
    const username = cb.from.username || cb.from.first_name || userId;
    const data     = cb.data || '';
    const msgId    = cb.message.message_id;
    const cfg      = this.getConfig();

    if (!cfg) { await this.answerCallback(cb.id); return; }

    await this.answerCallback(cb.id); // acknowledge immediately

    // data format: "action:param1:param2"
    const [action, ...params] = data.split(':');

    switch (action) {
      case 'beli_prof':       await this.cbSelectProfile(chatId, userId, username, msgId, params[0], 'beli', cfg); break;
      case 'gen_prof':        await this.cbSelectProfile(chatId, userId, username, msgId, params[0], 'generate', cfg); break;
      case 'beli_qty':        await this.cbSelectQty(chatId, userId, username, msgId, params[0], parseInt(params[1]), 'beli', cfg); break;
      case 'gen_qty':         await this.cbSelectQty(chatId, userId, username, msgId, params[0], parseInt(params[1]), 'generate', cfg); break;
      case 'beli_confirm':    await this.cbConfirmBeli(chatId, userId, username, msgId, params[0], cfg); break;
      case 'gen_confirm':     await this.cbConfirmGenerate(chatId, userId, username, msgId, params[0], parseInt(params[1]), cfg); break;
      case 'cancel':          await this.cbCancel(chatId, msgId); break;
      case 'gen_qty_custom':  await this.cbAskCustomQty(chatId, userId, params[0], msgId, cfg); break;
      // Tambah di switch(action)
      case 'topup_approve': await this.cbTopupApprove(chatId, userId, msgId, params[0], cfg); break;
      case 'topup_reject':  await this.cbTopupReject(chatId, userId, msgId, params[0], cfg); break;
      // Tambah di switch(action)
      case 'topup_req':    await this.cbTopupSelectNominal(chatId, userId, username, msgId, parseInt(params[0]), cfg); break;
      case 'topup_custom': await this.cbTopupCustom(chatId, userId, msgId, cfg); break;
      // Di switch(action) di handleCallback
      case 'topup_confirm': await this.cbTopupConfirm(chatId, userId, username, msgId, parseInt(params[0]), cfg); break;
      case 'topup_back':    await this.handleTopupRequest(chatId, userId, username, [], cfg); break;
      default:
        this.logger.warn('Unknown callback: ' + data);
    }
  }

  // ── Callback: Pilih nominal topup ────────────────────────────
  private async cbTopupSelectNominal(
    chatId: string, userId: string, username: string,
    msgId: number, amount: number, cfg: TelegramConfig
  ): Promise<void> {
    const reseller = this.resellerSvc?.getByTelegramId(userId);
    if (!reseller) {
      await this.editMessage(chatId, msgId, '❌ Reseller tidak ditemukan.');
      return;
    }

    // Konfirmasi sebelum submit
    await this.editMessage(chatId, msgId,
      `💰 <b>Konfirmasi Request Topup</b>\n\n` +
      `👤 ${reseller.name}\n` +
      `💵 Jumlah: <b>Rp ${amount.toLocaleString('id-ID')}</b>\n` +
      `💳 Saldo saat ini: <b>Rp ${reseller.saldo.toLocaleString('id-ID')}</b>\n` +
      `💳 Saldo setelah topup: <b>Rp ${(reseller.saldo + amount).toLocaleString('id-ID')}</b>\n\n` +
      `Konfirmasi request?`,
      {
        reply_markup: {
          inline_keyboard: [[
            { text: '✅ Ya, Request Sekarang', callback_data: `topup_confirm:${amount}` },
            { text: '◀️ Kembali', callback_data: 'topup_back' },
            { text: '❌ Batal', callback_data: 'cancel' },
          ]],
        },
      }
    );
  }

  private async cbTopupConfirm(
    chatId: string, userId: string, username: string,
    msgId: number, amount: number, cfg: TelegramConfig
  ): Promise<void> {
    const reseller = this.resellerSvc?.getByTelegramId(userId);
    if (!reseller) {
      await this.editMessage(chatId, msgId, '❌ Reseller tidak ditemukan.');
      return;
    }

    // Cek pending lagi (double check)
    const requests   = this.loadTopupRequests();
    const hasPending = requests.find(
      r => r.telegramId === userId && r.status === 'pending'
    );
    if (hasPending) {
      await this.editMessage(chatId, msgId,
        `⏳ Masih ada request pending Rp ${hasPending.amount.toLocaleString('id-ID')}.\n` +
        `Tunggu admin memproses dulu.`
      );
      return;
    }

    await this.editMessage(chatId, msgId,
      `⏳ Mengirim request topup Rp ${amount.toLocaleString('id-ID')}...`
    );

    await this.processTopupRequest(chatId, userId, username, reseller, amount, '', cfg);
  }
// ── Callback: Custom nominal ──────────────────────────────────
  private async cbTopupCustom(
    chatId: string, userId: string, msgId: number, cfg: TelegramConfig
  ): Promise<void> {
    this.setState(chatId, { step: 'awaiting_topup_amount' });
    await this.editMessage(chatId, msgId,
      `✏️ <b>Nominal Custom</b>\n\n` +
      `Ketik jumlah topup yang diinginkan:\n` +
      `<i>Contoh: 75000</i>\n\n` +
      `Minimal: Rp 1.000`,
      {
        reply_markup: {
          inline_keyboard: [[
            { text: '◀️ Kembali', callback_data: 'topup_back' },
            { text: '❌ Batal', callback_data: 'cancel' },
          ]],
        },
      }
    );
  }
  // ── Callback: Admin approve topup ────────────────────────────
  private async cbTopupApprove(
    chatId: string, userId: string, msgId: number,
    reqId: string, cfg: TelegramConfig
  ): Promise<void> {
    // Hanya admin yang bisa approve
    if (chatId !== cfg.chatId && !cfg.allowedUsers?.includes(userId)) {
      await this.answerCallback('', 'Hanya admin yang bisa approve');
      return;
    }

    const requests = this.loadTopupRequests();
    const req      = requests.find(r => r.id === reqId);

    if (!req) {
      await this.editMessage(chatId, msgId, '❌ Request tidak ditemukan atau sudah diproses.');
      return;
    }
    if (req.status !== 'pending') {
      await this.editMessage(chatId, msgId,
        `⚠️ Request ini sudah diproses sebelumnya.\nStatus: ${req.status}`
      );
      return;
    }

    // Proses topup
    if (!this.resellerSvc) {
      await this.editMessage(chatId, msgId, '❌ Layanan reseller tidak tersedia.');
      return;
    }

    const result = this.resellerSvc.topup(
      req.resellerId,
      req.amount,
      `Topup via bot disetujui admin`,
      'Admin Bot',
    );

    if (!result) {
      await this.editMessage(chatId, msgId, '❌ Gagal memproses topup. Reseller tidak ditemukan.');
      return;
    }

    // Update status request
    req.status = 'approved';
    this.saveTopupRequests(requests);

    // Update pesan admin
    await this.editMessage(chatId, msgId,
      `✅ <b>Topup DISETUJUI</b>\n\n` +
      `👤 ${req.resellerName}\n` +
      `💰 +Rp ${req.amount.toLocaleString('id-ID')}\n` +
      `💳 Saldo baru: <b>Rp ${result.reseller.saldo.toLocaleString('id-ID')}</b>\n` +
      `🕐 ${new Date().toLocaleString('id-ID')}`
    );

    // Notif ke reseller
    await this.sendMessage(req.telegramId,
      `🎉 <b>Request Topup Disetujui!</b>\n\n` +
      `💰 Topup: <b>+Rp ${req.amount.toLocaleString('id-ID')}</b>\n` +
      `💳 Saldo sekarang: <b>Rp ${result.reseller.saldo.toLocaleString('id-ID')}</b>\n` +
      `🕐 ${new Date().toLocaleString('id-ID')}\n\n` +
      `Ketik /beli untuk mulai belanja! 🛒`
    );

    this.addLog('ADMIN', `Approve topup ${req.resellerName} Rp ${req.amount.toLocaleString('id-ID')}`);
  }

  // ── Callback: Admin reject topup ─────────────────────────────
  private async cbTopupReject(
    chatId: string, userId: string, msgId: number,
    reqId: string, cfg: TelegramConfig
  ): Promise<void> {
    // Hanya admin yang bisa reject
    if (chatId !== cfg.chatId && !cfg.allowedUsers?.includes(userId)) {
      return;
    }

    const requests = this.loadTopupRequests();
    const req      = requests.find(r => r.id === reqId);

    if (!req) {
      await this.editMessage(chatId, msgId, '❌ Request tidak ditemukan.');
      return;
    }
    if (req.status !== 'pending') {
      await this.editMessage(chatId, msgId,
        `⚠️ Request ini sudah diproses.\nStatus: ${req.status}`
      );
      return;
    }

    // Update status
    req.status = 'rejected';
    this.saveTopupRequests(requests);

    // Update pesan admin
    await this.editMessage(chatId, msgId,
      `❌ <b>Topup DITOLAK</b>\n\n` +
      `👤 ${req.resellerName}\n` +
      `💰 Rp ${req.amount.toLocaleString('id-ID')}\n` +
      `🕐 ${new Date().toLocaleString('id-ID')}`
    );

    // Notif ke reseller
    await this.sendMessage(req.telegramId,
      `❌ <b>Request Topup Ditolak</b>\n\n` +
      `💰 Jumlah: Rp ${req.amount.toLocaleString('id-ID')}\n` +
      `🕐 ${new Date().toLocaleString('id-ID')}\n\n` +
      `Hubungi admin untuk informasi lebih lanjut.`
    );

    this.addLog('ADMIN', `Reject topup ${req.resellerName} Rp ${req.amount.toLocaleString('id-ID')}`);
  }

  // ── /beli and /generate - Show Profile Menu ───────────

  private async handleBeliMenu(
    chatId: string, userId: string, username: string,
    args: string[], cfg: TelegramConfig, mode: 'beli' | 'generate'
  ): Promise<void> {
    if (!this.mikrotikService || !this.configService) {
      await this.sendMessage(chatId, '⚠️ Layanan belum siap. Coba lagi.'); return;
    }

    // If profile already provided as argument, skip menu
    if (args[0]) {
      if (mode === 'beli') {
        await this.executeBeli(chatId, userId, username, args[0], cfg);
      } else {
        const qty = parseInt(args[1]) || 1;
        await this.executeGenerate(chatId, username, args[0], qty, cfg);
      }
      return;
    }

    try {
      const s = this.configService.getDecryptedSession(cfg.sessionId);
      if (!s) { await this.sendMessage(chatId, '⚠️ Router tidak terkonfigurasi.'); return; }
      const isIndo = INDO_CURR.includes(s.currency);

      // Use VoucherType config if available, else fallback to MikroTik profiles
      let items: Array<{ id: string; name: string; price: number;sprice:number; profile: string; duration: string;validty?: string; _vt?: VoucherType, }> = [];

      if (this.vtService) {
        const vtList = this.vtService.getActive();
        if (vtList.length > 0) {
          items = vtList.map(vt => ({
            id: vt.id, name: vt.name, price: vt.price,sprice: vt.price,
            profile: vt.profile, duration: vt.duration, _vt: vt,
          }));
        }
      }

      // Fallback: read from MikroTik profile on-login prices
      if (!items.length) {
        const client = await this.mikrotikService.createClient(s.ip, s.user, s.password, s.port || 8728);
        let profiles: any[] = [];
        try { profiles = await client.run('/ip/hotspot/user/profile/print'); }
        finally { client.close(); }

        items = profiles
          .map(p => {
            const ol = this.parseOnLogin(p['on-login'] || '');
            return { id: p.name, name: p.name, price: ol.price, sprice: ol.sprice, profile: p.name, duration: ol.validity, validity: p.validity };
          })
          .filter(p => p.price > 0);
      }

      if (!items.length) {
        await this.sendMessage(chatId,
          '⚠️ Tidak ada tipe voucher aktif.\n\nMinta admin mengatur voucher di menu <b>Settings Voucher</b>.'
        );
        return;
      }

      // Cache items in state
      this.setState(chatId, { step: 'select_profile', profiles: items as any });

      const emoji = mode === 'beli' ? '🎟️' : '📦';
      const prefix = mode === 'beli' ? 'beli_prof' : 'gen_prof';
      const keyboard: any[][] = [];

      for (let i = 0; i < items.length; i += 2) {
        const row: any[] = [];
        for (let j = i; j < Math.min(i + 2, items.length); j++) {
          const item = items[j];
          const fmtPrice = isIndo
            ? `Rp ${Math.round(item.sprice).toLocaleString('id-ID')}`
            : `${s.currency} ${item.sprice.toFixed(2)}`;
          const label = `${emoji} ${item.name} — ${fmtPrice}`;
          row.push({ text: label, callback_data: `${prefix}:${item.id}` });
        }
        keyboard.push(row);
      }
      keyboard.push([{ text: '❌ Batal', callback_data: 'cancel' }]);

      const title = mode === 'beli'
        ? '🎟️ <b>Pilih Voucher</b>\n\nPilih jenis voucher:'
        : '📦 <b>Generate Voucher</b>\n\nPilih tipe voucher:';

      await this.sendMessage(chatId, title, { reply_markup: { inline_keyboard: keyboard } });
    } catch (e: any) {
      await this.sendMessage(chatId, `❌ Error: ${e.message}`);
    }
  }

  // ── Callback: Profile selected ────────────────────────

  private async cbSelectProfile(
    chatId: string, userId: string, username: string,
    msgId: number, itemId: string, mode: 'beli' | 'generate',
    cfg: TelegramConfig
  ): Promise<void> {
    const state = this.getState(chatId);
    const profiles = state?.profiles || [];
    // Support both VoucherType items (have .id) and MikroTik profile items (have .name)
    const p = profiles.find((x: any) => x.id === itemId || x.name === itemId);

    if (!p) {
      await this.editMessage(chatId, msgId, '❌ Voucher tidak ditemukan. Coba lagi dengan /beli.');
      this.clearState(chatId);
      return;
    }

    const s = this.configService.getDecryptedSession(cfg.sessionId);
    const isIndo = INDO_CURR.includes(s?.currency || '');

    // Resolve price and duration from VoucherType or profile on-login
    const price    = p.price;
    const sprice = p.sprice;
    const duration = p.duration;
    const aktif = p.validity;
    const displayName = p.name;
    const profileName = p.profile || p.name; // MikroTik profile to use

    const fmtPrice = isIndo
      ? `Rp ${Math.round(sprice).toLocaleString('id-ID')}`
      : `${s?.currency || ''} ${Number(sprice).toFixed(2)}`;

    const info = [
      `📦 Voucher: <b>${displayName}</b>`,
      `💰 Harga: <b>${fmtPrice}</b>`,
      `⏰ Masa aktif: <b>${duration}</b>`,
      // `⏰ Masa berlaku: <b>${aktif}</b>`,
      (p._vt?.codeLength) ? `🔑 Kode: ${p._vt.codeLength} karakter` : '',
    ].filter(Boolean).join('\n');

    // Store resolved profileName and itemId separately
    this.setState(chatId, { ...state, profile: profileName, _displayName: displayName, _price: price, _duration: duration, _itemId: itemId } as any);

    if (mode === 'beli') {
      // For /beli — just confirm (always qty=1)
      this.setState(chatId, { step: 'confirm_beli', profile: profileName });
      await this.editMessage(chatId, msgId,
        `${info}\n\n✅ Konfirmasi pembelian 1 voucher?`,
        {
          reply_markup: {
            inline_keyboard: [
              [
                { text: '✅ Ya, Beli Sekarang', callback_data: `beli_confirm:${profileName}` },
                { text: '❌ Batal', callback_data: 'cancel' },
              ],
            ],
          },
        }
      );
    } else {
      // For /generate — ask quantity
      this.setState(chatId, { step: 'select_qty', profile: profileName });
      const qtyOptions = [1, 5, 10, 20, 50];
      const qtyRows: any[][] = [];

      // 5 quick qty buttons in one row
      qtyRows.push(
        qtyOptions.map(q => ({ text: `${q}`, callback_data: `gen_qty:${profileName}:${q}` }))
      );
      // Custom qty button
      qtyRows.push([
        { text: '✏️ Jumlah lain (ketik angka)', callback_data: `gen_qty_custom:${profileName}` },
      ]);
      qtyRows.push([{ text: '❌ Batal', callback_data: 'cancel' }]);

      await this.editMessage(chatId, msgId,
        `${info}\n\n📊 <b>Pilih jumlah voucher yang akan digenerate:</b>`,
        { reply_markup: { inline_keyboard: qtyRows } }
      );
    }
  }

  // ── Callback: Ask custom qty ──────────────────────────

  private async cbAskCustomQty(
    chatId: string, userId: string, profileName: string,
    msgId: number, cfg: TelegramConfig
  ): Promise<void> {
    this.setState(chatId, { step: 'awaiting_qty', profile: profileName });
    await this.editMessage(chatId, msgId,
      `✏️ Ketik jumlah voucher yang diinginkan (1–200):\n\nProfile: <b>${profileName}</b>`,
      { reply_markup: { inline_keyboard: [[{ text: '❌ Batal', callback_data: 'cancel' }]] } }
    );
  }

  // ── Handle qty typed by user ──────────────────────────

  private async handleQtyInput(
    chatId: string, userId: string, username: string,
    text: string, cfg: TelegramConfig
  ): Promise<void> {
    const state = this.getState(chatId);
    if (!state?.profile) return;

    const qty = parseInt(text);
    if (isNaN(qty) || qty < 1 || qty > 200) {
      await this.sendMessage(chatId, '❌ Masukkan angka antara 1–200.');
      return;
    }

    // Show confirmation
    const s = this.configService.getDecryptedSession(cfg.sessionId);
    const isIndo = INDO_CURR.includes(s?.currency || '');
    const profiles = state.profiles || [];
    const p = profiles.find((x: any) => x.name === state.profile);
    const ol = p ? this.parseOnLogin(p['on-login'] || '') : { sprice: 0, price: 0, validity: '' };
    const totalPrice = (ol.sprice || ol.price) * qty;
    const fmtTotal = isIndo
      ? `Rp ${Math.round(totalPrice).toLocaleString('id-ID')}`
      : `${s?.currency || ''} ${totalPrice.toFixed(2)}`;

    this.setState(chatId, { step: 'confirm_generate', profile: state.profile, qty, profiles: state.profiles });

    await this.sendMessage(chatId,
      `📦 Profile: <b>${state.profile}</b>\n📊 Jumlah: <b>${qty} voucher</b>\n💰 Total: <b>${fmtTotal}</b>\n\nKonfirmasi generate?`,
      {
        reply_markup: {
          inline_keyboard: [
            [
              { text: `✅ Ya, Generate ${qty} Voucher`, callback_data: `gen_confirm:${state.profile}:${qty}` },
              { text: '❌ Batal', callback_data: 'cancel' },
            ],
          ],
        },
      }
    );
  }

  // ── Callback: Qty selected (quick) ────────────────────

  private async cbSelectQty(
    chatId: string, userId: string, username: string,
    msgId: number, profileName: string, qty: number,
    mode: 'beli' | 'generate', cfg: TelegramConfig
  ): Promise<void> {
    const state = this.getState(chatId);
    const s = this.configService.getDecryptedSession(cfg.sessionId);
    const isIndo = INDO_CURR.includes(s?.currency || '');
    const profiles = state?.profiles || [];
    const p = profiles.find((x: any) => x.name === profileName);
    const ol = p ? this.parseOnLogin(p['on-login'] || '') : { sprice: 0, price: 0, validity: '' };
    const totalPrice = (ol.sprice || ol.price) * qty;
    const fmtTotal = isIndo
      ? `Rp ${Math.round(totalPrice).toLocaleString('id-ID')}`
      : `${s?.currency || ''} ${totalPrice.toFixed(2)}`;

    this.setState(chatId, { step: 'confirm_generate', profile: profileName, qty, profiles });

    await this.editMessage(chatId, msgId,
      `📦 Profile: <b>${profileName}</b>\n📊 Jumlah: <b>${qty} voucher</b>\n💰 Total: <b>${fmtTotal}</b>${ol.validity ? `\n⏰ Masa aktif: <b>${ol.validity}</b>` : ''}\n\nKonfirmasi generate?`,
      {
        reply_markup: {
          inline_keyboard: [
            [
              { text: `✅ Ya, Generate ${qty} Voucher`, callback_data: `gen_confirm:${profileName}:${qty}` },
              { text: '◀️ Kembali', callback_data: `gen_prof:${profileName}` },
              { text: '❌ Batal', callback_data: 'cancel' },
            ],
          ],
        },
      }
    );
  }

  // ── Callback: Confirm Beli ────────────────────────────

  private async cbConfirmBeli(
    chatId: string, userId: string, username: string,
    msgId: number, profileName: string, cfg: TelegramConfig
  ): Promise<void> {
    this.clearState(chatId);
    await this.editMessage(chatId, msgId, `⏳ Membuat voucher <b>${profileName}</b>...`);
    await this.executeBeli(chatId, userId, username, profileName, cfg, msgId);
  }

  // ── Callback: Confirm Generate ────────────────────────

  private async cbConfirmGenerate(
    chatId: string, userId: string, username: string,
    msgId: number, profileName: string, qty: number, cfg: TelegramConfig
  ): Promise<void> {
    this.clearState(chatId);
    await this.editMessage(chatId, msgId, `⏳ Membuat <b>${qty}</b> voucher <b>${profileName}</b>...`);
    await this.executeGenerate(chatId, username, profileName, qty, cfg);
  }

  // ── Callback: Cancel ──────────────────────────────────

  private async cbCancel(chatId: string, msgId: number): Promise<void> {
    this.clearState(chatId);
    await this.editMessage(chatId, msgId, '❌ Dibatalkan.');
  }

  // ── Execute: Create 1 voucher ─────────────────────────

  private async executeBeli(
    chatId: string, userId: string, username: string,
    profileName: string, cfg: TelegramConfig, editMsgId?: number
  ): Promise<void> {
    try {
      const s = this.configService.getDecryptedSession(cfg.sessionId);
      if (!s) { await this.sendMessage(chatId, '⚠️ Router tidak terkonfigurasi.'); return; }
      const client = await this.mikrotikService.createClient(s.ip, s.user, s.password, s.port || 8728);
      try {
        const profiles = await client.run('/ip/hotspot/user/profile/print', { '?name': profileName });
        if (!profiles[0]) {
          const msg = `❌ Profile <b>${profileName}</b> tidak ditemukan.`;
          editMsgId ? await this.editMessage(chatId, editMsgId, msg) : await this.sendMessage(chatId, msg);
          return;
        }
        const ol = this.parseOnLogin(profiles[0]['on-login'] || '');
        const uname = this.randomStr(5);
        const upass  = this.randomStr(5);
        // SESUDAH
        const dateTag = new Date().toLocaleDateString('id-ID').replace(/\//g, '.').slice(0, 8);
        const params: Record<string, string> = {
          name: uname, password: upass, profile: profileName,
          comment: `up-${Date.now()}-${dateTag}-${username.toUpperCase()}`,
        };
        if (ol.validity) params['limit-uptime'] = ol.validity;
        await client.run('/ip/hotspot/user/add', params);

        const isIndo = INDO_CURR.includes(s.currency);
        const fmtPrice = (n: number) => isIndo
          ? `${s.currency} ${Math.round(n).toLocaleString('id-ID')}`
          : `${s.currency} ${n.toFixed(2)}`;

        const text = [
          `✅ <b>Voucher Berhasil Dibuat!</b>`,
          ``,
          `👤 Username : <code>${uname}</code>`,
          `🔑 Password : <code>${upass}</code>`,
          `📦 Profile  : ${profileName}`,
          ol.sprice ? `💰 Harga    : ${fmtPrice(ol.sprice)}` : '',
          ol.validity ? `⏰ Masa aktif: ${ol.validity}` : '',
          profiles[0]['rate-limit'] ? `📶 Kecepatan: ${profiles[0]['rate-limit']}` : '',
          ``,
          `🕐 ${new Date().toLocaleString('id-ID')}`,
        ].filter(x => x !== null && x !== undefined && (x !== '' || x === '')).join('\n').replace(/\n{3,}/g, '\n\n');

        if (editMsgId) {
          await this.editMessage(chatId, editMsgId, text, {
            reply_markup: {
              inline_keyboard: [[
                { text: '🎟️ Beli Lagi', callback_data: `beli_prof:${profileName}` },
                // { text: '📋 Lihat Profile', callback_data: 'show_profil' },
              ]],
            },
          });
        } else {
          await this.sendMessage(chatId, text);
        }

        this.addLog(username, `Beli ${profileName} → ${uname}`);

        // If reseller: deduct saldo
        if (this.resellerSvc) {
          const reseller = this.resellerSvc.getByTelegramId(userId);
          if (reseller && reseller.status === 'active') {
            const realprice = ol.price
            const sellPrice = ol.sprice;
            if (reseller.saldo >= realprice) {
              this.resellerSvc.deductSaldo(userId, realprice, profileName);
            } else {
              // Saldo tidak cukup — hapus user yang baru dibuat
              try {
                const usrs = await client.run('/ip/hotspot/user/print', { '?name': uname });
                if (usrs[0]?.['.id']) await client.run('/ip/hotspot/user/remove', { '.id': usrs[0]['.id'] });
              } catch {}
              const msg = `❌ Saldo tidak cukup.\nSaldo kamu: <b>Rp ${reseller.saldo.toLocaleString('id-ID')}</b>\nHarga voucher: <b>Rp ${sellPrice.toLocaleString('id-ID')}</b>\n\nHubungi admin untuk topup saldo.`;
              editMsgId ? await this.editMessage(chatId, editMsgId, msg) : await this.sendMessage(chatId, msg);
              return;
            }
          }
        }

        // Notify admin
        if (cfg.notifSale && cfg.chatId && chatId !== cfg.chatId) {
          await this.sendMessage(cfg.chatId,
            `🛒 <b>Penjualan Voucher</b>\n👤 Dari: @${username}\n🎫 ${profileName} → <code>${uname}</code>\n💰 ${ol.sprice ? fmtPrice(ol.sprice) : '—'}\n🕐 ${new Date().toLocaleString('id-ID')}`
          );
        }
      } finally { client.close(); }
    } catch (e: any) {
      const msg = `❌ Gagal membuat voucher: ${e.message}`;
      editMsgId ? await this.editMessage(chatId, editMsgId, msg) : await this.sendMessage(chatId, msg);
    }
  }

  // ── Execute: Generate batch ───────────────────────────

  private async executeGenerate(
    chatId: string, username: string,
    profileName: string, qty: number, cfg: TelegramConfig
  ): Promise<void> {
    if (qty > 200) qty = 200;
    try {
      const s = this.configService.getDecryptedSession(cfg.sessionId);
      if (!s) { await this.sendMessage(chatId, '⚠️ Router tidak terkonfigurasi.'); return; }
      const client = await this.mikrotikService.createClient(s.ip, s.user, s.password, s.port || 8728);
      try {
        const profiles = await client.run('/ip/hotspot/user/profile/print', { '?name': profileName });
        if (!profiles[0]) {
          await this.sendMessage(chatId, `❌ Profile <b>${profileName}</b> tidak ditemukan.`); return;
        }
        const ol = this.parseOnLogin(profiles[0]['on-login'] || '');

        const existing = await client.run('/ip/hotspot/user/print');
        const existingNames = new Set(existing.map((u: any) => u.name));
        const vouchers: { u: string; p: string }[] = [];
        let attempts = 0;

        while (vouchers.length < qty && attempts < qty * 10) {
          attempts++;
          const uname = this.randomStr(5);
          if (existingNames.has(uname)) continue;
          const upass = this.randomStr(5);
          existingNames.add(uname);
          const params: Record<string, string> = {
            name: uname, password: upass, profile: profileName,
            comment: `tg-${username}`,
          };
          if (ol.validity) params['limit-uptime'] = ol.validity;
          try { await client.run('/ip/hotspot/user/add', params); vouchers.push({ u: uname, p: upass }); } catch {}
        }

        const isIndo = INDO_CURR.includes(s.currency);
        const totalPrice = (ol.sprice || ol.price) * vouchers.length;
        const fmtTotal = isIndo
          ? `${s.currency} ${Math.round(totalPrice).toLocaleString('id-ID')}`
          : `${s.currency} ${totalPrice.toFixed(2)}`;

        // Send result in chunks of 15
        const chunkSize = 15;
        const totalChunks = Math.ceil(vouchers.length / chunkSize);

        for (let i = 0; i < vouchers.length; i += chunkSize) {
          const chunk = vouchers.slice(i, i + chunkSize);
          const chunkNum = Math.floor(i / chunkSize) + 1;
          let text = '';
          if (i === 0) {
            text = `✅ <b>${vouchers.length} Voucher ${profileName}</b>\n`;
            if (ol.sprice || ol.price) text += `💰 Total: <b>${fmtTotal}</b>\n`;
            if (ol.validity) text += `⏰ Masa aktif: <b>${ol.validity}</b>\n`;
            if (totalChunks > 1) text += `\n📄 Bagian 1/${totalChunks}:\n`;
            text += `\n<pre>`;
          } else {
            text = `📄 Bagian ${chunkNum}/${totalChunks}:\n<pre>`;
          }
          chunk.forEach((v, j) => {
            text += `${String(i + j + 1).padStart(3, ' ')}. ${v.u}  ${v.p}\n`;
          });
          text += `</pre>`;
          await this.sendMessage(chatId, text);
          if (i + chunkSize < vouchers.length) await new Promise(r => setTimeout(r, 400));
        }

        this.addLog(username, `Generate ${vouchers.length}x ${profileName}`);
      } finally { client.close(); }
    } catch (e: any) {
      await this.sendMessage(chatId, `❌ Error: ${e.message}`);
    }
  }

  // ── Command Handlers ──────────────────────────────────

  private async handleHelp(chatId: string, isAdmin: boolean): Promise<void> {
    let text = `🤖 <b>MikHMon Hotspot Bot</b>\n\n`;
    text += `📋 <b>Perintah:</b>\n\n`;
    text += `🎟️ /beli — Beli voucher (pilih profile via tombol)\n`;
    text += `📦 /generate — Generate batch voucher\n`;
    text += `🔍 /cek [user] — Cek status user\n`;
    text += `📋 /profil — Lihat daftar profile & harga\n\n`;
    // Di handleHelp, tambah di bagian perintah reseller
    text += `💰 /topup [jumlah] — Request topup saldo\n`;
    text += `📋 /cektopup — Cek status request topup\n`;
    if (isAdmin) {
      text += `⚙️ <b>Admin:</b>\n`;
      text += `/status — Info router\n/aktif — User aktif\n/rekap — Rekap hari ini\n/bulan — Rekap bulan ini\n/pppoe — PPPoE aktif\n/hapus [user] — Hapus user\n`;
      text += `\n💼 <b>Reseller Admin:</b>\n`;
      text += `/resellers — Daftar semua reseller\n`;
      text += `/topup — Topup saldo \n`;
    }
    await this.sendMessage(chatId, text);
  }

  private async handleProfil(chatId: string, cfg: TelegramConfig): Promise<void> {
    try {
      const s = this.configService.getDecryptedSession(cfg.sessionId);
      if (!s) { await this.sendMessage(chatId, '⚠️ Router tidak terkonfigurasi.'); return; }
      const client = await this.mikrotikService.createClient(s.ip, s.user, s.password, s.port || 8728);
      try {
        const profiles = await client.run('/ip/hotspot/user/profile/print');
        const isIndo = INDO_CURR.includes(s.currency);
        let text = `📦 <b>Daftar Profile Voucher</b>\n\n`;
        let hasPrice = false;
        for (const p of profiles) {
          const ol = this.parseOnLogin(p['on-login'] || '');
          if (!ol.sprice && !ol.price) continue;
          hasPrice = true;
          const price = isIndo
            ? `${s.currency} ${Math.round(ol.sprice || ol.price).toLocaleString('id-ID')}`
            : `${s.currency} ${(ol.sprice || ol.price).toFixed(2)}`;
          text += `🎫 <b>${p.name}</b>  →  ${price}`;
          if (ol.validity) text += `  ⏰ ${ol.validity}`;
          if (p['rate-limit']) text += `  📶 ${p['rate-limit']}`;
          text += `\n`;
        }
        if (!hasPrice) text += 'Belum ada profile dengan harga.\nHubungi admin.';
        else text += `\nKetik /beli untuk membeli voucher.`;
        await this.sendMessage(chatId, text);
      } finally { client.close(); }
    } catch (e: any) { await this.sendMessage(chatId, `❌ Error: ${e.message}`); }
  }

  private async handleCek(chatId: string, args: string[], cfg: TelegramConfig): Promise<void> {
    const username = args[0];
    if (!username) { await this.sendMessage(chatId, '❓ Gunakan: /cek [username]'); return; }
    try {
      const s = this.configService.getDecryptedSession(cfg.sessionId);
      const client = await this.mikrotikService.createClient(s.ip, s.user, s.password, s.port || 8728);
      try {
        const [users, actives] = await Promise.all([
          client.run('/ip/hotspot/user/print', { '?name': username }),
          client.run('/ip/hotspot/active/print', { '?user': username }),
        ]);
        if (!users[0]) { await this.sendMessage(chatId, `❌ User <code>${username}</code> tidak ditemukan.`); return; }
        const u = users[0], a = actives[0];
        let text = `🔍 <b>Info User: ${username}</b>\n\n`;
        text += `📦 Profile: ${u.profile || '—'}\n`;
        text += `📊 Status: ${a ? '🟢 Online' : '⚫ Offline'}\n`;
        if (a) text += `📍 IP: ${a.address || '—'}\n⏱️ Uptime: ${a.uptime || '—'}\n`;
        text += `💬 Comment: ${u.comment || '—'}\n`;
        if (u['limit-uptime']) text += `⏰ Limit Uptime: ${u['limit-uptime']}\n`;
        await this.sendMessage(chatId, text);
      } finally { client.close(); }
    } catch (e: any) { await this.sendMessage(chatId, `❌ Error: ${e.message}`); }
  }

  // ── Reseller handlers ────────────────────────────────────────

  private async handleDaftar(chatId: string, userId: string, username: string, cfg: TelegramConfig): Promise<void> {
    if (!this.resellerSvc) { await this.sendMessage(chatId, '⚠️ Layanan reseller belum aktif.'); return; }
    const existing = this.resellerSvc.getByTelegramId(userId);
    if (existing) {
      const isIndo = true;
      const saldoStr = `Rp ${existing.saldo.toLocaleString('id-ID')}`;
      await this.sendMessage(chatId,
        `ℹ️ Kamu sudah terdaftar sebagai reseller.\n\n` +
        `👤 Nama: <b>${existing.name}</b>\n` +
        `💰 Saldo: <b>${saldoStr}</b>\n` +
        `🎫 Total Voucher: <b>${existing.totalVoucher}</b>\n` +
        `📊 Status: <b>${existing.status === 'active' ? '✅ Aktif' : '❌ Nonaktif'}</b>\n\n` +
        `Ketik /saldo untuk cek saldo, /beli untuk beli voucher.`
      );
      return;
    }
    // Auto-register
    const displayName = username || `User${userId.slice(-4)}`;
    const cfg2 = this.getConfig();
    this.resellerSvc.upsert({
      name: displayName,
      username: username,
      telegramId: userId,
      // sessionId: cfg.sessionId,
      saldo: 0,
      status: 'active',
      // allowedProfiles: [],
      markup: 0,
    });
    this.addLog(username, 'Daftar reseller baru');

    // Notify admin
    if (cfg2?.chatId && chatId !== cfg2.chatId) {
      await this.sendMessage(cfg2.chatId,
        `🆕 <b>Reseller Baru Mendaftar</b>\n` +
        `👤 ${displayName} (@${username})\n` +
        `🆔 Telegram ID: <code>${userId}</code>\n` +
        `🕐 ${new Date().toLocaleString('id-ID')}`
      );
    }
    await this.sendMessage(chatId,
      `✅ <b>Pendaftaran Berhasil!</b>\n\n` +
      `Selamat datang, <b>${displayName}</b>!\n\n` +
      `💰 Saldo awal: <b>Rp 0</b>\n` +
      `Hubungi admin untuk topup saldo sebelum mulai beli voucher.\n\n` +
      `Ketik /saldo untuk cek saldo atau /beli untuk mulai.`
    );
  }

  private async handleSaldo(chatId: string, userId: string, cfg: TelegramConfig): Promise<void> {
    if (!this.resellerSvc) { await this.sendMessage(chatId, '⚠️ Layanan reseller belum aktif.'); return; }
    const reseller = this.resellerSvc.getByTelegramId(userId);
    if (!reseller) {
      await this.sendMessage(chatId, '❌ Kamu belum terdaftar sebagai reseller.\n\nKetik /daftar untuk mendaftar.');
      return;
    }
    const saldoStr = `Rp ${reseller.saldo.toLocaleString('id-ID')}`;
    const pendStr  = `Rp ${reseller.totalIncome.toLocaleString('id-ID')}`;
    await this.sendMessage(chatId,
      `💰 <b>Info Saldo Reseller</b>\n\n` +
      `👤 Nama: <b>${reseller.name}</b>\n` +
      `💳 Saldo: <b>${saldoStr}</b>\n` +
      `🎫 Total Voucher: <b>${reseller.totalVoucher}</b>\n` +
      `📊 Total Pendapatan: <b>${pendStr}</b>\n` +
      `📋 Status: ${reseller.status === 'active' ? '✅ Aktif' : '❌ Nonaktif'}\n\n` +
      `Ketik /beli untuk membeli voucher.`
    );
  }

  private async handleTopupAmountInput(
    chatId: string, userId: string, username: string,
    text: string, cfg: TelegramConfig
  ): Promise<void> {
    const amount = parseInt(text.replace(/\D/g, '')); // hapus non-angka
    if (isNaN(amount) || amount < 1000) {
      await this.sendMessage(chatId,
        '❌ Nominal tidak valid. Minimal Rp 1.000\n\nKetik ulang nominalnya:'
      );
      return;
    }

    this.clearState(chatId);

    const reseller = this.resellerSvc?.getByTelegramId(userId);
    if (!reseller) return;

    // Tampil konfirmasi
    await this.sendMessage(chatId,
      `💰 <b>Konfirmasi Request Topup</b>\n\n` +
      `👤 ${reseller.name}\n` +
      `💵 Jumlah: <b>Rp ${amount.toLocaleString('id-ID')}</b>\n` +
      `💳 Saldo saat ini: <b>Rp ${reseller.saldo.toLocaleString('id-ID')}</b>\n` +
      `💳 Saldo setelah topup: <b>Rp ${(reseller.saldo + amount).toLocaleString('id-ID')}</b>\n\n` +
      `Konfirmasi request?`,
      {
        reply_markup: {
          inline_keyboard: [[
            { text: '✅ Ya, Request Sekarang', callback_data: `topup_confirm:${amount}` },
            { text: '❌ Batal', callback_data: 'cancel' },
          ]],
        },
      }
    );
  }

  // ── Reseller request topup ────────────────────────────────────
  private async handleTopupRequest(
    chatId: string, userId: string, username: string,
    args: string[], cfg: TelegramConfig
  ): Promise<void> {
    if (!this.resellerSvc) {
      await this.sendMessage(chatId, '⚠️ Layanan reseller belum aktif.');
      return;
    }

    const reseller = this.resellerSvc.getByTelegramId(userId);
    if (!reseller) {
      await this.sendMessage(chatId,
        '❌ Kamu belum terdaftar sebagai reseller.\nKetik /daftar untuk mendaftar.'
      );
      return;
    }
    if (reseller.status !== 'active') {
      await this.sendMessage(chatId, '❌ Akun reseller kamu tidak aktif.');
      return;
    }

    // Cek pending request dulu
    const requests  = this.loadTopupRequests();
    const hasPending = requests.find(
      r => r.telegramId === userId && r.status === 'pending'
    );
    if (hasPending) {
      await this.sendMessage(chatId,
        `⏳ Kamu masih punya request topup yang belum diproses.\n\n` +
        `💰 Jumlah: <b>Rp ${hasPending.amount.toLocaleString('id-ID')}</b>\n` +
        `🕐 Dikirim: ${new Date(hasPending.requestedAt).toLocaleString('id-ID')}\n\n` +
        `Tunggu admin memproses request sebelumnya.\n` +
        `Ketik /cektopup untuk cek status.`
      );
      return;
    }

    // Kalau ada angka langsung di args — proses langsung
    if (args[0] && !isNaN(parseInt(args[0]))) {
      const amount = parseInt(args[0]);
      if (amount < 1000) {
        await this.sendMessage(chatId, '❌ Minimal topup Rp 1.000');
        return;
      }
      await this.processTopupRequest(chatId, userId, username, reseller, amount, args.slice(1).join(' '), cfg);
      return;
    }

    // Tampil menu pilihan nominal dengan tombol
    const nominals = [50000, 100000, 150000, 200000, 300000, 500000];
    const keyboard: any[][] = [];

    // 2 tombol per baris
    for (let i = 0; i < nominals.length; i += 2) {
      const row: any[] = [];
      for (let j = i; j < Math.min(i + 2, nominals.length); j++) {
        row.push({
          text: `Rp ${nominals[j].toLocaleString('id-ID')}`,
          callback_data: `topup_req:${nominals[j]}`,
        });
      }
      keyboard.push(row);
    }

    // Tombol custom
    keyboard.push([{ text: '✏️ Nominal Lain', callback_data: 'topup_custom' }]);
    keyboard.push([{ text: '❌ Batal', callback_data: 'cancel' }]);

    await this.sendMessage(chatId,
      `💰 <b>Request Topup Saldo</b>\n\n` +
      `👤 ${reseller.name}\n` +
      `💳 Saldo saat ini: <b>Rp ${reseller.saldo.toLocaleString('id-ID')}</b>\n\n` +
      `Pilih nominal topup:`,
      { reply_markup: { inline_keyboard: keyboard } }
    );
  }
  private async processTopupRequest(
    chatId: string, userId: string, username: string,
    reseller: any, amount: number, note: string, cfg: TelegramConfig
  ): Promise<void> {
    const reqId = `TR-${Date.now()}`;
    const topupReq: TopupRequest = {
      id:           reqId,
      resellerId:   reseller.id,
      resellerName: reseller.name,
      telegramId:   userId,
      amount,
      note,
      requestedAt:  new Date().toISOString(),
      status:       'pending',
    };
    this.addTopupRequest(topupReq);

    // Konfirmasi ke reseller
    await this.sendMessage(chatId,
      `✅ <b>Request Topup Terkirim!</b>\n\n` +
      `💰 Jumlah: <b>Rp ${amount.toLocaleString('id-ID')}</b>\n` +
      `${note ? `📝 Catatan: ${note}\n` : ''}` +
      `🕐 ${new Date().toLocaleString('id-ID')}\n\n` +
      `Tunggu konfirmasi admin.\nKetik /cektopup untuk cek status.`
    );

    // Notif ke admin
    if (cfg.chatId) {
      await this.sendMessage(cfg.chatId,
        `💰 <b>Request Topup Saldo</b>\n\n` +
        `👤 <b>${reseller.name}</b>\n` +
        `🆔 ID: <code>${reseller.id}</code>\n` +
        `📱 @${username} (<code>${userId}</code>)\n` +
        `💵 Jumlah: <b>Rp ${amount.toLocaleString('id-ID')}</b>\n` +
        `${note ? `📝 Catatan: ${note}\n` : ''}` +
        `💳 Saldo saat ini: <b>Rp ${reseller.saldo.toLocaleString('id-ID')}</b>\n` +
        `🕐 ${new Date().toLocaleString('id-ID')}\n\n` +
        `<i>ID: ${reqId}</i>`,
        {
          reply_markup: {
            inline_keyboard: [[
              { text: `✅ Approve Rp ${amount.toLocaleString('id-ID')}`, callback_data: `topup_approve:${reqId}` },
              { text: '❌ Reject', callback_data: `topup_reject:${reqId}` },
            ]],
          },
        }
      );
    }

    this.addLog(username, `Request topup Rp ${amount.toLocaleString('id-ID')}`);
  }

  // ── Cek status topup ──────────────────────────────────────────
  private async handleCekTopup(
    chatId: string, userId: string, cfg: TelegramConfig
  ): Promise<void> {
    const requests = this.loadTopupRequests();
    const myReqs   = requests
      .filter(r => r.telegramId === userId)
      .slice(0, 5);

    if (!myReqs.length) {
      await this.sendMessage(chatId, '📭 Belum ada riwayat request topup.');
      return;
    }

    const STATUS = {
      pending:  '⏳ Menunggu',
      approved: '✅ Disetujui',
      rejected: '❌ Ditolak',
    };

    let text = `📋 <b>Riwayat Request Topup (5 terakhir)</b>\n\n`;
    myReqs.forEach((r, i) => {
      const dt = new Date(r.requestedAt).toLocaleString('id-ID', {
        dateStyle: 'short', timeStyle: 'short'
      });
      text += `${i+1}. <b>Rp ${r.amount.toLocaleString('id-ID')}</b>\n`;
      text += `   Status: ${STATUS[r.status]}\n`;
      text += `   Waktu: ${dt}\n`;
      if (r.note) text += `   Catatan: ${r.note}\n`;
      text += '\n';
    });

    await this.sendMessage(chatId, text);
  }

  private async handleRiwayat(chatId: string, userId: string, cfg: TelegramConfig): Promise<void> {
    if (!this.resellerSvc) { await this.sendMessage(chatId, '⚠️ Layanan reseller belum aktif.'); return; }
    const reseller = this.resellerSvc.getByTelegramId(userId);
    if (!reseller) {
      await this.sendMessage(chatId, '❌ Kamu belum terdaftar sebagai reseller.\nKetik /daftar untuk mendaftar.');
      return;
    }
    const history = [...(reseller[0] || [])].reverse().slice(0, 20);
    if (!history.length) {
      await this.sendMessage(chatId, '📜 Belum ada riwayat pembelian.');
      return;
    }
    let text = `📜 <b>Riwayat Pembelian (${history.length} terakhir)</b>\n\n`;
    history.forEach((p, i) => {
      text += `${i+1}. <code>${p.username}</code> — ${p.profileName} — Rp ${p.paidSaldo.toLocaleString('id-ID')} — ${p.at}\n`;
    });
    await this.sendMessage(chatId, text);
  }

  private async handleTopupCmd(chatId: string, args: string[], cfg: TelegramConfig): Promise<void> {
    if (!this.resellerSvc) { await this.sendMessage(chatId, '⚠️ Layanan reseller belum aktif.'); return; }
    // /topup [id_atau_telegramid] [jumlah] [catatan]
    if (args.length < 2) {
      await this.sendMessage(chatId, '❓ Format: /topup [ID_reseller] [jumlah] [catatan]\n\nContoh: /topup RS-123 50000 Transfer BRI');
      return;
    }
    const idOrTgId = args[0];
    const amount   = parseInt(args[1]);
    const note     = args.slice(2).join(' ') || 'Topup by admin';

    if (isNaN(amount) || amount <= 0) {
      await this.sendMessage(chatId, '❌ Jumlah harus berupa angka positif.');
      return;
    }

    // Find by ID or telegramId
    let reseller = this.resellerSvc.getById(idOrTgId) || this.resellerSvc.getByTelegramId(idOrTgId);
    if (!reseller) {
      await this.sendMessage(chatId, `❌ Reseller dengan ID/TelegramID <code>${idOrTgId}</code> tidak ditemukan.\n\nKetik /resellers untuk melihat daftar.`);
      return;
    }

    const updated = this.resellerSvc.topup(reseller.id, amount, note, 'Admin');
    if (!updated) { await this.sendMessage(chatId, '❌ Topup gagal.'); return; }

    const amtStr  = `Rp ${amount.toLocaleString('id-ID')}`;
    const newSaldo = `Rp ${updated.reseller.saldo.toLocaleString('id-ID')}`;

    // Notify admin
    await this.sendMessage(chatId,
      `✅ <b>Topup Berhasil</b>\n\n` +
      `👤 Reseller: <b>${updated.reseller.name}</b>\n` +
      `💰 Topup: <b>+${amtStr}</b>\n` +
      `💳 Saldo baru: <b>${newSaldo}</b>\n` +
      `📝 Catatan: ${note}`
    );

    // Notify reseller
    await this.sendMessage(updated.reseller.id,
      `💰 <b>Saldo Ditopup!</b>\n\n` +
      `✅ Tambah: <b>+${amtStr}</b>\n` +
      `💳 Saldo sekarang: <b>${newSaldo}</b>\n` +
      `📝 ${note}\n` +
      `🕐 ${new Date().toLocaleString('id-ID')}\n\n` +
      `Ketik /beli untuk mulai belanja!`
    );
  }

  private async handleListResellers(chatId: string, cfg: TelegramConfig): Promise<void> {
    if (!this.resellerSvc) { await this.sendMessage(chatId, '⚠️ Layanan reseller belum aktif.'); return; }
    const resellers = this.resellerSvc.loadAll();
    if (!resellers.length) {
      await this.sendMessage(chatId, '📭 Belum ada reseller terdaftar.');
      return;
    }
    let text = `💼 <b>Daftar Reseller (${resellers.length})</b>\n\n`;
    resellers.slice(0, 20).forEach((r, i) => {
      const saldo = `Rp ${r.saldo.toLocaleString('id-ID')}`;
      text += `${i+1}. <b>${r.name}</b> ${r.username ? `(@${r.username})` : ''}\n`;
      text += `   🆔 <code>${r.id}</code> · TG: <code>${r.telegramId}</code>\n`;
      text += `   💳 ${saldo} · 🎫 ${r.saldo} · ${r.status === 'active' ? '✅' : '❌'}\n\n`;
    });
    text += `\nUntuk topup: /topup [ID] [jumlah] [catatan]`;
    await this.sendMessage(chatId, text);
  }

  private async handleStatus(chatId: string, cfg: TelegramConfig): Promise<void> {
    try {
      const s = this.configService.getDecryptedSession(cfg.sessionId);
      const client = await this.mikrotikService.createClient(s.ip, s.user, s.password, s.port || 8728);
      try {
        const [res, identity, active, users] = await Promise.all([
          client.run('/system/resource/print'),
          client.run('/system/identity/print'),
          client.run('/ip/hotspot/active/print', { 'count-only': '' }),
          client.run('/ip/hotspot/user/print', { 'count-only': '' }),
        ]);
        const r = res[0] || {};
        let text = `📡 <b>Status Router</b>\n\n`;
        text += `🏷️ ${identity[0]?.name || '—'} | ${r['board-name'] || '—'}\n`;
        text += `🔧 RouterOS ${r.version || '—'}\n`;
        text += `⏱️ Uptime: ${r.uptime || '—'}\n`;
        text += `🔥 CPU: ${r['cpu-load'] || 0}%  💾 RAM: ${this.fmtB(r['free-memory'])}\n\n`;
        text += `👥 HS Active: <b>${active[0]?.ret ?? active.length}</b> / Total: <b>${users[0]?.ret ?? users.length}</b>\n`;
        text += `\n🕐 ${new Date().toLocaleString('id-ID')}`;
        await this.sendMessage(chatId, text);
      } finally { client.close(); }
    } catch (e: any) { await this.sendMessage(chatId, `❌ Error: ${e.message}`); }
  }

  private async handleAktif(chatId: string, cfg: TelegramConfig): Promise<void> {
    try {
      const s = this.configService.getDecryptedSession(cfg.sessionId);
      const active = await this.mikrotikService.run(s.ip, s.user, s.password, '/ip/hotspot/active/print', {}, s.port || 8728);
      if (!active.length) { await this.sendMessage(chatId, '📭 Tidak ada user hotspot aktif.'); return; }
      let text = `👥 <b>HS Aktif (${active.length})</b>\n\n<pre>`;
      active.slice(0, 25).forEach((u: any, i: number) => {
        text += `${String(i+1).padStart(2,' ')}. ${(u.user||'—').padEnd(8)} ${u.address||'—'}\n`;
      });
      text += `</pre>`;
      if (active.length > 25) text += `\n... dan ${active.length - 25} lainnya`;
      await this.sendMessage(chatId, text);
    } catch (e: any) { await this.sendMessage(chatId, `❌ Error: ${e.message}`); }
  }

  private async handleRekap(chatId: string, period: 'today' | 'month', cfg: TelegramConfig): Promise<void> {
    try {
      const s = this.configService.getDecryptedSession(cfg.sessionId);
      const now = new Date();
      const months = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
      const mm = months[now.getMonth()], yyyy = now.getFullYear();
      const dd = String(now.getDate()).padStart(2, '0');
      const idbl = `${mm}${yyyy}`, idhr = `${mm}/${dd}/${yyyy}`;

      const client = await this.mikrotikService.createClient(s.ip, s.user, s.password, s.port || 8728);
      try {
        const scripts = await client.run('/system/script/print', { '?owner': idbl });
        const filtered = period === 'today'
          ? scripts.filter((r: any) => (r.name || '').split('-|-')[0] === idhr)
          : scripts;

        let totalIncome = 0;
        const resellerMap: Record<string, { vcr: number; income: number }> = {};
        filtered.forEach((r: any) => {
          const parts = (r.name || '').split('-|-');
          const price = parseFloat(parts[3]) || 0;
          const tag = this.extractTag(parts[8] || '');
          totalIncome += price;
          if (!resellerMap[tag]) resellerMap[tag] = { vcr: 0, income: 0 };
          resellerMap[tag].vcr++;
          resellerMap[tag].income += price;
        });

        const isIndo = INDO_CURR.includes(s.currency);
        const fmt = (n: number) => isIndo ? `${s.currency} ${Math.round(n).toLocaleString('id-ID')}` : `${s.currency} ${n.toFixed(2)}`;
        const label = period === 'today' ? `Hari Ini ${dd}/${mm}/${yyyy}` : `Bulan ${mm} ${yyyy}`;

        let text = `📊 <b>Rekap ${label}</b>\n\n🎟️ Voucher: <b>${filtered.length}</b>\n💰 Income: <b>${fmt(totalIncome)}</b>`;
        const rsList = Object.entries(resellerMap).sort((a,b) => b[1].income - a[1].income);
        if (rsList.length > 1) {
          text += `\n\n📋 <b>Per Reseller:</b>\n`;
          rsList.slice(0, 10).forEach(([tag, d]) => {
            text += `  • ${tag}: ${d.vcr}vcr — ${fmt(d.income)}\n`;
          });
        }
        text += `\n🕐 ${new Date().toLocaleString('id-ID')}`;
        await this.sendMessage(chatId, text);
      } finally { client.close(); }
    } catch (e: any) { await this.sendMessage(chatId, `❌ Error: ${e.message}`); }
  }

  private async handlePppoe(chatId: string, cfg: TelegramConfig): Promise<void> {
    try {
      const s = this.configService.getDecryptedSession(cfg.sessionId);
      const active = await this.mikrotikService.run(s.ip, s.user, s.password, '/ppp/active/print', {}, s.port || 8728);
      if (!active.length) { await this.sendMessage(chatId, '📭 Tidak ada koneksi PPPoE aktif.'); return; }
      let text = `🔌 <b>PPPoE Aktif (${active.length})</b>\n\n<pre>`;
      active.slice(0, 20).forEach((u: any, i: number) => {
        text += `${String(i+1).padStart(2,' ')}. ${(u.name||'—').padEnd(12)} ${u.address||'—'}\n`;
      });
      text += `</pre>`;
      await this.sendMessage(chatId, text);
    } catch (e: any) { await this.sendMessage(chatId, `❌ Error: ${e.message}`); }
  }

  private async handleHapus(chatId: string, args: string[], cfg: TelegramConfig): Promise<void> {
    const username = args[0];
    if (!username) { await this.sendMessage(chatId, '❓ Gunakan: /hapus [username]'); return; }
    try {
      const s = this.configService.getDecryptedSession(cfg.sessionId);
      const client = await this.mikrotikService.createClient(s.ip, s.user, s.password, s.port || 8728);
      try {
        const users = await client.run('/ip/hotspot/user/print', { '?name': username });
        if (!users[0]?.['.id']) { await this.sendMessage(chatId, `❌ User <code>${username}</code> tidak ditemukan.`); return; }
        await client.run('/ip/hotspot/user/remove', { '.id': users[0]['.id'] });
        await this.sendMessage(chatId, `✅ User <code>${username}</code> berhasil dihapus.`);
        this.addLog('ADMIN', `Hapus: ${username}`);
      } finally { client.close(); }
    } catch (e: any) { await this.sendMessage(chatId, `❌ Error: ${e.message}`); }
  }

  // ── Daily Report ──────────────────────────────────────

  // private async handleSaldo(chatId: string, userId: string, cfg: TelegramConfig): Promise<void> {
  //   if (!this.resellerTgSvc) { await this.sendMessage(chatId, '⚠️ Fitur reseller tidak tersedia.'); return; }
  //   await this.sendMessage(chatId, this.resellerTgSvc.buildSaldoInfo(userId));
  // }

  // private async handleDaftar(chatId: string, userId: string, username: string, cfg: TelegramConfig): Promise<void> {
  //   if (!this.resellerTgSvc) { await this.sendMessage(chatId, '⚠️ Fitur reseller tidak tersedia.'); return; }
  //   const info = this.resellerTgSvc.buildDaftarInfo(userId, username);
  //   await this.sendMessage(chatId, info.text);
  // }

  // private async handleRiwayat(chatId: string, userId: string, cfg: TelegramConfig): Promise<void> {
  //   if (!this.resellerTgSvc) { await this.sendMessage(chatId, '⚠️ Fitur reseller tidak tersedia.'); return; }
  //   const r = this.resellerTgSvc.getActiveReseller(userId);
  //   if (!r) { await this.sendMessage(chatId, '❌ Kamu belum terdaftar sebagai reseller.'); return; }
  //   // Reuse saldo info which includes recent logs
  //   await this.sendMessage(chatId, this.resellerTgSvc.buildSaldoInfo(userId));
  // }

  private scheduleDailyReport(): void {
    if (this.dailyTimer) { clearTimeout(this.dailyTimer); this.dailyTimer = null; }
    const cfg = this.getConfig();
    if (!cfg?.notifDaily || !cfg.dailyTime || !cfg.token) return;
    const [h, m] = cfg.dailyTime.split(':').map(Number);
    const now = new Date(), target = new Date();
    target.setHours(h, m, 0, 0);
    if (target <= now) target.setDate(target.getDate() + 1);
    const delay = target.getTime() - now.getTime();
    this.dailyTimer = setTimeout(async () => {
      await this.handleRekap(cfg.chatId, 'today', cfg);
      this.scheduleDailyReport();
    }, delay);
    this.logger.log(`Daily report scheduled at ${cfg.dailyTime}`);
  }

  // ── Helpers ───────────────────────────────────────────

  private randomStr(len: number): string {
    const chars = 'abcdefghjkmnprstuvwxyz23456789';
    return Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  }

  private parseOnLogin(onLogin: string): { expmode: string; price: number; validity: string; sprice: number } {
    const empty = { expmode: '', price: 0, validity: '', sprice: 0 };
    if (!onLogin) return empty;
    const match = onLogin.match(/:put \("([^"]*)"\)/);
    if (!match) return empty;
    const p = match[1].split(',');
    return { expmode: p[1]?.trim()||'', price: parseFloat(p[2])||0, validity: p[3]?.trim()||'', sprice: parseFloat(p[4])||0 };
  }

  private extractTag(comment: string): string {
    if (!comment) return '(no comment)';
    const match = comment.match(/^up-\d+-[\d.]+-(.+)$/i);
    return match ? match[1].toUpperCase() : comment.toUpperCase();
  }

  private fmtB(b: string): string {
    const n = parseInt(b);
    if (!n) return '—';
    if (n > 1e9) return (n/1e9).toFixed(1)+' GB';
    if (n > 1e6) return (n/1e6).toFixed(1)+' MB';
    return (n/1e3).toFixed(0)+' KB';
  }
}