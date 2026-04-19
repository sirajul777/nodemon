import { Controller, Post, Body, Req, Res, Get } from '@nestjs/common';
import { AuthService } from './auth.service';
import { Request, Response } from 'express';

@Controller('api/auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('login')
  login(@Body() body: { username: string; password: string }, @Req() req: Request, @Res() res: Response) {
    // Try multi-user system first, then fall back to legacy single admin
    const result = this.authService.validateUserFull(body.username, body.password);
    if (result) {
      (req.session as any).mikhmon    = body.username;
      (req.session as any).userId     = result.id;
      (req.session as any).userRole   = result.role;
      (req.session as any).userPerms  = result.permissions;
      return res.json({
        success:     true,
        username:    body.username,
        name:        result.name,
        role:        result.role,
        permissions: result.permissions,
      });
    }
    return res.status(401).json({ success: false, message: 'Username atau password salah' });
  }

  @Post('logout')
  logout(@Req() req: Request, @Res() res: Response) {
    req.session.destroy(() => {});
    return res.json({ success: true });
  }

  @Get('me')
  me(@Req() req: Request) {
    const user = (req.session as any).mikhmon;
    if (!user) return { authenticated: false };
    return {
      authenticated: true,
      username:      user,
      role:          (req.session as any).userRole   || 'admin',
      permissions:   (req.session as any).userPerms  || null,
    };
  }

  @Post('change-password')
  changePassword(
    @Req() req: Request,
    @Res() res: Response,
    @Body() body: { oldPassword: string; newPassword: string },
  ) {
    const username = (req.session as any).mikhmon;
    if (!username) return res.status(401).json({ error: 'Tidak terautentikasi' });
    if (!body.oldPassword || !body.newPassword)
      return res.status(400).json({ error: 'oldPassword dan newPassword wajib diisi' });
    if (body.newPassword.length < 4)
      return res.status(400).json({ error: 'Password minimal 4 karakter' });

    const ok = this.authService.changePassword(username, body.oldPassword, body.newPassword);
    if (ok) return res.json({ success: true, message: 'Password berhasil diubah' });
    return res.status(400).json({ error: 'Password lama tidak sesuai' });
  }
}