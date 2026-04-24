import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import * as session from 'express-session';
import * as cookieParser from 'cookie-parser';
import * as FileStore from 'session-file-store';

const FileStoreSession = FileStore(session);

require('dotenv').config()

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.use(cookieParser());
  app.use(
    session({
      store: new FileStoreSession({
        path: './data/sessions',
        logFn: () => {},
        retries: 5,
        reapInterval: 60 * 10 // Bersihkan session sampah setiap 10 menit
      }),
      name: 'mikhmon.sid', // Beri nama spesifik agar tidak bentrok
      secret: process.env.SESSION_SECRET || 'mikhmon-secret-key',
      resave: false, // FileStore lebih stabil dengan false
      saveUninitialized: false, // Jangan simpan session kosong
      rolling: true,
      cookie: { 
        maxAge: 1000 * 60 * 60 * 24, // 1 hari
        secure: false, // Wajib false jika tidak pakai HTTPS
        httpOnly: true,
        sameSite: 'lax', // Paling aman untuk refresh di Local IP
        path: '/'
      },
    }),
  );

  app.enableCors({ 
    origin: true, 
    credentials: true 
  });
  const port = process.env.PORT || 3000;
  await app.listen(port);
  console.log(`MikHMon NestJS running on http://localhost:${port}`);
}
bootstrap();
