import { Controller, Get, Post, Body, Req } from '@nestjs/common';
import { Request } from 'express';

@Controller('api/session')
export class SessionController {
  @Get('active')
  getActive(@Req() req: Request) {
    const s = req.session as any;
    return {
      authenticated: !!s.mikhmon,
      username: s.mikhmon || null,
      activeRouter: s.activeRouter || null,
    };
  }

  @Post('router')
  setActiveRouter(@Req() req: Request, @Body() body: { sessionId: string }) {
    (req.session as any).activeRouter = body.sessionId;
    return { success: true };
  }
}
