import { Injectable } from '@nestjs/common';
import { ConfigService } from '../config/config.service';

@Injectable()
export class AuthService {
  constructor(private configService: ConfigService) {}

  validateUser(username: string, password: string): boolean {
    return this.configService.validateAdmin(username, password);
  }
}
