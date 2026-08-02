import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY, PermissionKey } from './permissions.decorator';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<PermissionKey[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required || required.length === 0) return true;

    const req = context.switchToHttp().getRequest();
    const session = req.session || {};

    // Admin always has full access
    if (session.userRole === 'admin') return true;

    const perms = session.userPerms || {};
    const allowed = required.some((p) => perms[p] === true);
    if (!allowed) {
      throw new ForbiddenException('Anda tidak memiliki akses ke fitur ini');
    }
    return true;
  }
}

