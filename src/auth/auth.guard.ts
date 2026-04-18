import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';

@Injectable()
export class AuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    if (!(request.session as any)?.mikhmon) {
      throw new UnauthorizedException('Please login first');
    }
    return true;
  }
}
