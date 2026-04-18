import { Module } from '@nestjs/common';
import { PppoeController } from './pppoe.controller';
import { MikrotikModule } from '../mikrotik/mikrotik.module';
@Module({ imports: [MikrotikModule], controllers: [PppoeController] })
export class PppoeModule {}