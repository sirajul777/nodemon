import { Module, Global } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigService } from './config.service';
import { ConfigController } from './config.controller';
import { RouterSessionEntity } from '../database/entities/router-session.entity';
import { AppConfigEntity } from '../database/entities/config.entity';

@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([RouterSessionEntity, AppConfigEntity]),
  ],
  providers: [ConfigService],
  controllers: [ConfigController],
  exports: [ConfigService],
})
export class ConfigModule {}

