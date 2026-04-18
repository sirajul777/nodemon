import { Injectable, Logger } from '@nestjs/common';
import { RouterOSAPI } from 'node-routeros';

export interface MikrotikResponse {
  [key: string]: string;
}

@Injectable()
export class MikrotikService {
  private readonly logger = new Logger(MikrotikService.name);

  async createClient(ip: string, user: string, password: string, port = 8728): Promise<RosClient> {
    const client = new RosClient(ip, user, password, port, this.logger);
    await client.connect();
    return client;
  }

  async run(
    ip: string,
    user: string,
    password: string,
    command: string,
    params: Record<string, string> = {},
    port = 8728,
  ): Promise<MikrotikResponse[]> {
    const client = await this.createClient(ip, user, password, port);
    try {
      return await client.run(command, params);
    } finally {
      client.close();
    }
  }

  async getRosVersion(client: RosClient): Promise<string> {
    const res = await client.run('/system/resource/print');
    return res[0]?.version?.charAt(0) || '7';
  }

  async getSellingScripts(
    client: RosClient,
    rosVersion: string,
    filter: { idhr?: string; idbl?: string },
  ): Promise<MikrotikResponse[]> {
    const isROS7 = rosVersion !== '6';

    if (filter.idhr) {
      const parts  = filter.idhr.split('/');
      const idbl   = parts[0] + parts[2];
      if (isROS7) {
        const all = await client.run('/system/script/print', { '?owner': idbl });
        return all.filter(row => (row.name || '').split('-|-')[0] === filter.idhr);
      }
      return client.run('/system/script/print', { '?source': filter.idhr });
    }

    if (filter.idbl) {
      return client.run('/system/script/print', { '?owner': filter.idbl });
    }

    const now    = new Date();
    const months = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
    const idbl   = months[now.getMonth()] + now.getFullYear();
    if (isROS7) {
      return client.run('/system/script/print', { '?owner': idbl });
    }
    return client.run('/system/script/print', { '?comment': 'mikhmon' });
  }

  parseScriptName(name: string) {
    const parts = name.split('-|-');
    return {
      date:     parts[0] || '',
      time:     parts[1] || '',
      username: parts[2] || '',
      price:    parseFloat(parts[3]) || 0,
      profile:  parts[7] || '',
      comment:  parts[8] || '',
      raw:      parts,
    };
  }
}

export class RosClient {
  private api: RouterOSAPI;

  constructor(
    ip: string,
    user: string,
    password: string,
    port: number,
    private readonly logger: Logger,
  ) {
    this.api = new RouterOSAPI({
      host:     ip,
      user:     user,
      password: password,
      port:     port,
      timeout:  15,   // increased timeout
    });
  }

  async connect(): Promise<void> {
    await this.api.connect();
  }

  /**
   * Run a RouterOS API command.
   *
   * node-routeros v1.x write() API:
   *   api.write(command)            — no params
   *   api.write(command, [words])   — with params as string array
   *
   * Word formats:
   *   '?key=value'  → query filter
   *   '=key=value'  → set attribute
   *
   * IMPORTANT: Do NOT pass empty array [] — some builds hang on write(cmd, []).
   * Only pass words array when it has items.
   */
  async run(command: string, params: Record<string, string> = {}): Promise<MikrotikResponse[]> {
    const words: string[] = [];

    for (const [k, v] of Object.entries(params)) {
      if (k.startsWith('?')) {
        words.push(`${k}=${v}`);
      } else if (k.startsWith('=')) {
        words.push(`${k}=${v}`);
      } else if (k === 'count-only') {
        words.push('=count-only=');
      } else {
        words.push(`=${k}=${v}`);
      }
    }

    // Only pass words if non-empty — avoid hanging on write(cmd, [])
    const result = words.length > 0
      ? await this.api.write(command, words)
      : await this.api.write(command);

    return result as MikrotikResponse[];
  }

  close(): void {
    try { this.api.close(); } catch {}
  }
}