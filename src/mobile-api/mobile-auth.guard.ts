import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

const TOKEN_FILE = path.join(process.cwd(), 'data', 'mobile-tokens.json');

export interface MobileToken {
  token: string;
  resellerId: string;
  resellerName: string;
  telegramId: string;
  sessionId: string;   // router session
  createdAt: string;
  expiresAt: string;   // 30 days
  lastUsed: string;
}

@Injectable()
export class MobileAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const auth = req.headers['authorization'] || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : auth;
    if (!token) throw new UnauthorizedException('Token tidak ditemukan');
    const mToken = MobileTokenService.verify(token);
    if (!mToken) throw new UnauthorizedException('Token tidak valid atau sudah expired');
    req.mobileToken = mToken;
    return true;
  }
}

// Static helper — no injection needed
export class MobileTokenService {
  static generate(resellerId: string, resellerName: string, telegramId: string, sessionId: string): MobileToken {
    const token = crypto.randomBytes(32).toString('hex');
    const now   = new Date();
    const exp   = new Date(now);
    exp.setDate(exp.getDate() + 30);
    const mToken: MobileToken = {
      token, resellerId, resellerName, telegramId, sessionId,
      createdAt: now.toISOString(),
      expiresAt: exp.toISOString(),
      lastUsed:  now.toISOString(),
    };
    const tokens = MobileTokenService.loadAll();
    // Remove old tokens for same reseller
    const filtered = tokens.filter(t => t.resellerId !== resellerId);
    filtered.push(mToken);
    MobileTokenService.saveAll(filtered);
    return mToken;
  }

  static verify(token: string): MobileToken | null {
    const tokens = MobileTokenService.loadAll();
    const t = tokens.find(t => t.token === token);
    if (!t) return null;
    if (new Date(t.expiresAt) < new Date()) return null;
    // Update lastUsed
    t.lastUsed = new Date().toISOString();
    MobileTokenService.saveAll(tokens);
    return t;
  }

  static revoke(token: string): boolean {
    const tokens = MobileTokenService.loadAll();
    const newList = tokens.filter(t => t.token !== token);
    MobileTokenService.saveAll(newList);
    return newList.length < tokens.length;
  }

  static loadAll(): MobileToken[] {
    try {
      if (fs.existsSync(TOKEN_FILE)) return JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf8'));
    } catch {}
    return [];
  }

  static saveAll(tokens: MobileToken[]) {
    const dir = path.dirname(TOKEN_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(TOKEN_FILE, JSON.stringify(tokens, null, 2));
  }
}