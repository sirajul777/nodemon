import { Injectable } from '@nestjs/common';
import { MikrotikService, RosClient } from '../mikrotik/mikrotik.service';
import { ConfigService } from '../config/config.service';
import { ResellerService } from '../reseller/reseller.service';

export interface SellingRecord {
  date: string; time: string; username: string;
  price: number; profile: string; comment: string;
  resellerTag: string;
}

export interface ResellerSummary {
  tag: string;
  vouchers: number;
  total: number;
}

@Injectable()
export class ReportService {
  constructor(
    private mikrotikService: MikrotikService,
    private configService: ConfigService,
    private resellerService: ResellerService,
  ) {}

  private async getClient(sessionId: string) {
    const s = this.configService.getDecryptedSession(sessionId);
    if (!s) throw new Error(`Session "${sessionId}" not found`);
    const client = await this.mikrotikService.createClient(s.ip, s.user, s.password, s.port || 8728);
    const rosVersion = await this.mikrotikService.getRosVersion(client);
    return { client, rosVersion, currency: s.currency };
  }

  async getSelling(sessionId: string, filter: {
    idhr?: string; idbl?: string; prefix?: string;
    datacomments?: string; dataprofile?: string; reseller?: string;
  }) {
    const { client, rosVersion, currency } = await this.getClient(sessionId);
    try {
      const scripts = await this.mikrotikService.getSellingScripts(client, rosVersion, {
        idhr: filter.idhr, idbl: filter.idbl,
      });

      let records: SellingRecord[] = scripts.map(s => {
        const parsed = this.mikrotikService.parseScriptName(s.name || '');
        return {
          ...parsed,
          resellerTag: this.resellerService.extractResellerTag(parsed.comment),
        };
      });

      if (filter.prefix)       records = records.filter(r => r.username.startsWith(filter.prefix));
      if (filter.datacomments) records = records.filter(r => r.comment === filter.datacomments);
      if (filter.dataprofile)  records = records.filter(r => r.profile === filter.dataprofile);
      if (filter.reseller)     records = records.filter(r => r.resellerTag === filter.reseller.toUpperCase());

      const totalVouchers = records.length;
      const totalIncome = records.reduce((sum, r) => sum + r.price, 0);
      const isIndo = this.configService.isIndoCurrency(currency);

      // Group by reseller tag
      const resellerMap: Record<string, ResellerSummary> = {};
      records.forEach(r => {
        const tag = r.resellerTag;
        if (!resellerMap[tag]) resellerMap[tag] = { tag, vouchers: 0, total: 0 };
        resellerMap[tag].vouchers++;
        resellerMap[tag].total += r.price;
      });
      const resellerGroups = Object.values(resellerMap)
        .sort((a, b) => b.total - a.total);

      return {
        records,
        summary: { totalVouchers, totalIncome, currency, isIndo },
        resellerGroups,
        filter,
      };
    } finally {
      client.close();
    }
  }

  async getLiveReport(sessionId: string) {
    const { client, currency } = await this.getClient(sessionId);
    try {
      const now = new Date();
      const months = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
      const mm   = months[now.getMonth()];
      const dd   = String(now.getDate()).padStart(2, '0');
      const yyyy = now.getFullYear();
      const idhr = `${mm}/${dd}/${yyyy}`;
      const idbl = `${mm}${yyyy}`;

      const allScripts = await client.run('/system/script/print', {'?source': idhr });
      console.log(allScripts)
      let todayVouchers = 0, todayIncome = 0, monthIncome = 0;
      for (const row of allScripts) {
        const parsed = this.mikrotikService.parseScriptName(row.name || '');
        monthIncome += parsed.price;
        if (parsed.date === idhr) { todayVouchers++; todayIncome += parsed.price; }
      }
      return {
        today: { vouchers: todayVouchers, income: todayIncome },
        month: { vouchers: allScripts.length, income: monthIncome },
        currency,
        isIndo: this.configService.isIndoCurrency(currency),
      };
    } finally {
      client.close();
    }
  }

  async getResumeReport(sessionId: string, idbl: string) {
    const { client, currency } = await this.getClient(sessionId);
    try {
      const scripts = await client.run('/system/script/print', { '?owner': idbl });
      const mm   = idbl.slice(0, 3);
      const yyyy = idbl.slice(3);
      const monthNums: Record<string, number> = {
        jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12,
      };
      const monthNum = monthNums[mm] || 1;
      const daysInMonth = new Date(parseInt(yyyy), monthNum, 0).getDate();
      const now = new Date();
      const isCurrentMonth = monthNum === now.getMonth()+1 && parseInt(yyyy) === now.getFullYear();
      const maxDay = isCurrentMonth ? now.getDate() : daysInMonth;

      const dailyMap: Record<string, { date: string; vouchers: number; total: number }> = {};
      for (let d = 1; d <= maxDay; d++) {
        const dd = String(d).padStart(2, '0');
        dailyMap[`${mm}/${dd}/${yyyy}`] = { date: dd, vouchers: 0, total: 0 };
      }

      let totalIncome = 0;
      for (const row of scripts) {
        const parsed = this.mikrotikService.parseScriptName(row.name || '');
        totalIncome += parsed.price;
        if (dailyMap[parsed.date]) {
          dailyMap[parsed.date].vouchers++;
          dailyMap[parsed.date].total += parsed.price;
        }
      }
      return {
        daily: Object.values(dailyMap),
        summary: {
          totalVouchers: scripts.length, totalIncome,
          currency, isIndo: this.configService.isIndoCurrency(currency),
          month: mm, year: yyyy,
        },
      };
    } finally {
      client.close();
    }
  }

  async deleteReportData(sessionId: string, filter: { idhr?: string; idbl?: string }) {
    const { client, rosVersion } = await this.getClient(sessionId);
    try {
      const scripts = await this.mikrotikService.getSellingScripts(client, rosVersion, filter);
      for (const script of scripts) {
        if (script['.id']) await client.run('/system/script/remove', { '.id': script['.id'] });
      }
      return { success: true, deleted: scripts.length };
    } finally {
      client.close();
    }
  }
}