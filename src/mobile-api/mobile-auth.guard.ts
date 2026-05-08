import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException
} from "@nestjs/common";
import * as path from "path";
import * as fs from "fs";
import * as crypto from "crypto";

// Tambah interface
export interface MobileUserToken {
  token: string;
  userId: string;
  username: string;
  name: string;
  role: string;
  permissions: any;
  allowedSessions: any;
  createdAt: string;
  expiresAt: string;
  lastUsed: string;
}

const USER_TOKEN_FILE = path.join(
  process.cwd(),
  "data",
  "mobile-user-tokens.json"
);

export class MobileTokenService {
  static generate(
    userId: string,
    username: string,
    name: string,
    role: string,
    permissions: any,
    allowedSessions: any
  ): MobileUserToken {
    const token = crypto.randomBytes(32).toString("hex");
    const now = new Date();
    const exp = new Date(now);
    exp.setDate(exp.getDate() + 30);

    const mToken: MobileUserToken = {
      token,
      userId,
      username,
      name,
      role,
      permissions,
      allowedSessions,
      createdAt: now.toISOString(),
      expiresAt: exp.toISOString(),
      lastUsed: now.toISOString()
    };

    const tokens = MobileTokenService.loadAll();
    // Hapus token lama untuk user yang sama
    const filtered = tokens.filter((t) => t.userId !== userId);
    filtered.push(mToken);
    MobileTokenService.saveAll(filtered);
    return mToken;
  }

  static verify(token: string): MobileUserToken | null {
    const tokens = MobileTokenService.loadAll();
    const t = tokens.find((t) => t.token === token);
    if (!t) return null;
    if (new Date(t.expiresAt) < new Date()) return null;
    t.lastUsed = new Date().toISOString();
    MobileTokenService.saveAll(tokens);
    return t;
  }

  static revoke(token: string): boolean {
    const tokens = MobileTokenService.loadAll();
    const newList = tokens.filter((t) => t.token !== token);
    MobileTokenService.saveAll(newList);
    return newList.length < tokens.length;
  }

  static loadAll(): MobileUserToken[] {
    try {
      if (fs.existsSync(USER_TOKEN_FILE))
        return JSON.parse(fs.readFileSync(USER_TOKEN_FILE, "utf8"));
    } catch {}
    return [];
  }

  static saveAll(tokens: MobileUserToken[]) {
    const dir = path.dirname(USER_TOKEN_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(USER_TOKEN_FILE, JSON.stringify(tokens, null, 2));
  }
}

// Guard baru yang support kedua jenis token (reseller & user)
@Injectable()
export class MobileAuthGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();

    // 1. Ambil token dari header
    const auth = req.headers["authorization"] || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : auth;

    if (!token) {
      throw new UnauthorizedException(
        "Sesi tidak ditemukan, silakan login kembali"
      );
    }

    // 2. Verifikasi token menggunakan Service
    // Karena logic verify Anda sudah mengembalikan objek MobileUserToken,
    // kita cukup panggil satu kali saja.
    const decodedToken = MobileTokenService.verify(token);

    if (!decodedToken) {
      throw new UnauthorizedException("Sesi telah berakhir atau tidak valid");
    }

    // 3. Tempelkan data ke objek Request
    // Ini kuncinya agar Controller bisa tahu SIAPA yang sedang login.
    req.user = {
      id: decodedToken.userId,
      username: decodedToken.username,
      name: decodedToken.name,
      role: decodedToken.role,
      permissions: decodedToken.permissions
    };

    // Anda juga bisa menyimpan metadata token jika diperlukan
    req.mobileToken = decodedToken;

    return true;
  }
}
