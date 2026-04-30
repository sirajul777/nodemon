import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import * as session from "express-session";
import * as cookieParser from "cookie-parser";
import * as FileStore from "session-file-store";
import { Eta } from "eta"; // Import th
import { NestExpressApplication } from "@nestjs/platform-express";
import { join, resolve } from "path";

const FileStoreSession = FileStore(session);

require("dotenv").config();

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  // Use resolve to get an absolute, clean path
  const viewsDir = resolve(__dirname, "..", "views");

  // 1. Initialize Eta v3 with your views directory
  const eta = new Eta({ views: viewsDir, cache: false });

  // 2. Define the engine manually (renderFile no longer exists)
  app.engine("eta", (path: string, opts: any, callback: any) => {
    try {
      const templateName = path.replace(viewsDir, "").replace(/^[\\\/]/, "");
      const rendered = eta.render(templateName, opts);
      callback(null, rendered);
    } catch (err) {
      callback(err);
    }
  });

  app.setBaseViewsDir(viewsDir);
  app.setViewEngine("eta");

  // Static assets configuration (for your CSS/JS)
  app.useStaticAssets(resolve(__dirname, "..", "public"), {
    prefix: "/"
  });

  app.use(cookieParser());
  app.use(
    session({
      store: new FileStoreSession({
        path: "./data/sessions",
        logFn: () => {},
        retries: 5,
        reapInterval: 60 * 10 // Bersihkan session sampah setiap 10 menit
      }),
      name: "mikhmon.sid", // Beri nama spesifik agar tidak bentrok
      secret: process.env.SESSION_SECRET || "mikhmon-secret-key",
      resave: false, // FileStore lebih stabil dengan false
      saveUninitialized: false, // Jangan simpan session kosong
      rolling: true,
      cookie: {
        maxAge: 1000 * 60 * 60 * 24, // 1 hari
        secure: false, // Wajib false jika tidak pakai HTTPS
        httpOnly: true,
        sameSite: "lax", // Paling aman untuk refresh di Local IP
        path: "/"
      }
    })
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
