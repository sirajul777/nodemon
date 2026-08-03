import { HttpModule } from '@nestjs/axios';
import { DynamicModule, Module, Provider } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { PAYHOOK_MODULE_OPTIONS } from './payhook.constants';
import { PayhookController } from './payhook.controller';
import { PaymentTransaction } from './entities/payment-transaction.entity';
import { VoucherOrderEntity } from './entities/voucher-order.entity';
import { PayhookCallbackLogEntity } from './entities/payhook-callback-log.entity';
import {
  PayhookModuleAsyncOptions,
  PayhookModuleOptions,
  PayhookOptionsFactory
} from './interfaces/payhook-module-options.interface';
import { PayhookService } from './payhook.service';
import { VoucherOrderService } from './voucher-order.service';
import { VoucherOrderController } from './voucher-order.controller';
import { MikrotikModule } from '../../mikrotik/mikrotik.module';
import { VoucherTypeModule } from '../../voucher-types/voucher-type.module';
import { TelegramModule } from '../../telegram/telegram.module';
import { PaymentConfigModule } from '../payment-config.module';

@Module({})
export class PayhookModule {
  /** Static config, e.g. PayhookModule.forRoot({ apiKey: ..., secretKey: ..., env: 'sandbox' }) */
  static forRoot(options: PayhookModuleOptions): DynamicModule {
    return {
      module: PayhookModule,
      imports: [
        HttpModule,
        TypeOrmModule.forFeature([
          PaymentTransaction,
          VoucherOrderEntity,
          PayhookCallbackLogEntity
        ]),
        MikrotikModule,
        VoucherTypeModule,
        TelegramModule,
        PaymentConfigModule
      ],
      controllers: [PayhookController, VoucherOrderController],
      providers: [
        { provide: PAYHOOK_MODULE_OPTIONS, useValue: options },
        PayhookService,
        VoucherOrderService
      ],
      exports: [PayhookService, VoucherOrderService]
    };
  }

  /**
   * Async config pulling from ConfigService, e.g.:
   *
   *   PayhookModule.forRootAsync({
   *     imports: [PaymentConfigModule],
   *     inject: [PaymentConfigService],
   *     useFactory: (config: PaymentConfigService) => config.getPayhookOptions()
   *   })
   */
  static forRootAsync(options: PayhookModuleAsyncOptions): DynamicModule {
    return {
      module: PayhookModule,
      imports: [
        HttpModule,
        TypeOrmModule.forFeature([
          PaymentTransaction,
          VoucherOrderEntity,
          PayhookCallbackLogEntity
        ]),
        MikrotikModule,
        VoucherTypeModule,
        TelegramModule,
        PaymentConfigModule,
        ...(options.imports || [])
      ],
      controllers: [PayhookController, VoucherOrderController],
      providers: [...this.createAsyncProviders(options), PayhookService, VoucherOrderService],
      exports: [PayhookService, VoucherOrderService]
    };
  }

  private static createAsyncProviders(options: PayhookModuleAsyncOptions): Provider[] {
    if (options.useFactory) {
      return [
        {
          provide: PAYHOOK_MODULE_OPTIONS,
          useFactory: options.useFactory,
          inject: options.inject || []
        }
      ];
    }

    const injectToken = options.useClass || options.useExisting;
    if (!injectToken) {
      throw new Error(
        'PayhookModule.forRootAsync requires one of useFactory, useClass, or useExisting'
      );
    }

    const providers: Provider[] = [
      {
        provide: PAYHOOK_MODULE_OPTIONS,
        useFactory: async (factory: PayhookOptionsFactory) =>
          factory.createPayhookOptions(),
        inject: [injectToken]
      }
    ];

    if (options.useClass) {
      providers.push({ provide: options.useClass, useClass: options.useClass });
    }

    return providers;
  }
}

