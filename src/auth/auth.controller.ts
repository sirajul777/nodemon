import { Controller, Post, Body, Req, Res, Get } from '@nestjs/common';
import { AuthService } from './auth.service';
import { Request, Response } from 'express';

@Controller('api/auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('login')
  login(@Body() body: { username: string; password: string }, @Req() req: Request, @Res() res: Response) {
    const valid = this.authService.validateUser(body.username, body.password);
    if (valid) {
      (req.session as any).mikhmon = body.username;
      return res.json({ success: true, username: body.username });
    }
    return res.status(401).json({ success: false, message: 'Invalid username or password' });
  }

  @Post('logout')
  logout(@Req() req: Request, @Res() res: Response) {
    req.session.destroy(() => {});
    return res.json({ success: true });
  }

  @Get('me')
  me(@Req() req: Request) {
    const user = (req.session as any).mikhmon;
    if (user) return { authenticated: true, username: user };
    return { authenticated: false };
  }
}
