// Tambah interface
export interface MobileUserToken {
  token:       string;
  userId:      string;
  username:    string;
  name:        string;
  role:        string;
  permissions: any;
  createdAt:   string;
  expiresAt:   string;
  lastUsed:    string;
}

const USER_TOKEN_FILE = path.join(process.cwd(), 'data', 'mobile-user-tokens.json');

export class MobileUserTokenService {
  static generate(
    userId: string, username: string, name: string,
    role: string, permissions: any
  ): MobileUserToken {
    const token = crypto.randomBytes(32).toString('hex');
    const now   = new Date();
    const exp   = new Date(now);
    exp.setDate(exp.getDate() + 30);

    const mToken: MobileUserToken = {
      token, userId, username, name, role, permissions,
      createdAt: now.toISOString(),
      expiresAt: exp.toISOString(),
      lastUsed:  now.toISOString(),
    };

    const tokens = MobileUserTokenService.loadAll();
    // Hapus token lama untuk user yang sama
    const filtered = tokens.filter(t => t.userId !== userId);
    filtered.push(mToken);
    MobileUserTokenService.saveAll(filtered);
    return mToken;
  }

  static verify(token: string): MobileUserToken | null {
    const tokens = MobileUserTokenService.loadAll();
    const t = tokens.find(t => t.token === token);
    if (!t) return null;
    if (new Date(t.expiresAt) < new Date()) return null;
    t.lastUsed = new Date().toISOString();
    MobileUserTokenService.saveAll(tokens);
    return t;
  }

  static revoke(token: string): boolean {
    const tokens  = MobileUserTokenService.loadAll();
    const newList = tokens.filter(t => t.token !== token);
    MobileUserTokenService.saveAll(newList);
    return newList.length < tokens.length;
  }

  static loadAll(): MobileUserToken[] {
    try {
      if (fs.existsSync(USER_TOKEN_FILE)) 
        return JSON.parse(fs.readFileSync(USER_TOKEN_FILE, 'utf8'));
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
  canActivate(context: ExecutionContext): boolean {
    const req  = context.switchToHttp().getRequest();
    const auth = req.headers['authorization'] || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : auth;
    if (!token) throw new UnauthorizedException('Token tidak ditemukan');

    // Coba token reseller dulu
    const resellerToken = MobileTokenService.verify(token);
    if (resellerToken) {
      req.mobileToken = resellerToken;
      req.tokenType   = 'reseller';
      return true;
    }

    // Coba token user (reseller/collector login dengan username/password)
    const userToken = MobileUserTokenService.verify(token);
    if (userToken) {
      req.mobileToken = userToken;
      req.tokenType   = 'user';
      return true;
    }

    throw new UnauthorizedException('Token tidak valid atau sudah expired');
  }
}