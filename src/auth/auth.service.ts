import { Injectable } from '@nestjs/common';
import { ConfigService } from '../config/config.service';

// Lazy-inject UserService to avoid circular dependency
let userServiceRef: any = null;

@Injectable()
export class AuthService {
  constructor(private configService: ConfigService) {}

  setUserService(svc: any) { userServiceRef = svc; }

  /**
   * Validate against multi-user system first,
   * then fall back to legacy single-admin in config.json
   */
  validateUserFull(username: string, password: string): any | null {
    // Try multi-user system
    if (userServiceRef) {
      try {
        const u = userServiceRef.validate(username, password);
        if (u) return u;
      } catch {}
    }
    // Fall back to legacy config admin
    if (this.configService.validateAdmin(username, password)) {
      return {
        id:       'legacy-admin',
        username,
        name:     username,
        role:     'admin',
        active:   true,
        permissions: {
          viewDashboard:  true, manageVoucher:  true, manageBilling:  true,
          manageReseller: true, managePppoe:    true, manageHotspot:  true,
          viewReport:     true, manageSystem:   true,
        },
      };
    }
    return null;
  }

  validateUser(username: string, password: string): boolean {
    return this.validateUserFull(username, password) !== null;
  }

  changePassword(username: string, oldPassword: string, newPassword: string): boolean {
    // Try multi-user system
    if (userServiceRef) {
      const u = userServiceRef.getByUsername(username);
      if (u) return userServiceRef.changePassword(u.id, oldPassword, newPassword);
    }
    // Legacy admin
    if (this.configService.validateAdmin(username, oldPassword)) {
      return this.configService.changeAdminPassword(username, newPassword);
    }
    return false;
  }
}