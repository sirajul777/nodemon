import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PaymentConfigEntity } from './payment-config.entity';
import { PaymentConfigService } from './payment-config.service';

@Module({
  imports: [TypeOrmModule.forFeature([PaymentConfigEntity])],
  providers: [PaymentConfigService],
  exports: [PaymentConfigService],
})
export class PaymentConfigModule {}

