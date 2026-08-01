import { HttpModule } from '@nestjs/axios';
import { DynamicModule, Module, Provider } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { MIDTRANS_MODULE_OPTIONS } from './midtrans.constants';
import { MidtransController } from './midtrans.controller';
import { PaymentTransaction } from './entities/payment-transaction.entity';
import {
  MidtransModuleAsyncOptions,
  MidtransModuleOptions,
  MidtransOptionsFactory
} from './interfaces/midtrans-module-options.interface';
import { MidtransService } from './midtrans.service';

@Module({})
export class MidtransModule {
  /** Static config, e.g. MidtransModule.forRoot({ serverKey: ..., env: 'sandbox' }) */
  static forRoot(options: MidtransModuleOptions): DynamicModule {
    return {
      module: MidtransModule,
      imports: [HttpModule, TypeOrmModule.forFeature([PaymentTransaction])],
      controllers: [MidtransController],
      providers: [
        { provide: MIDTRANS_MODULE_OPTIONS, useValue: options },
        MidtransService
      ],
      exports: [MidtransService]
    };
  }

  /**
   * Async config pulling from ConfigService, e.g.:
   *
   *   MidtransModule.forRootAsync({
   *     imports: [ConfigModule],
   *     inject: [ConfigService],
   *     useFactory: (config: ConfigService) => ({
   *       serverKey: config.get('MIDTRANS_SERVER_KEY'),
   *       clientKey: config.get('MIDTRANS_CLIENT_KEY'),
   *       env: config.get('MIDTRANS_ENV'),
   *       defaultAcquirer: 'gopay'
   *     })
   *   })
   */
  static forRootAsync(options: MidtransModuleAsyncOptions): DynamicModule {
    return {
      module: MidtransModule,
      imports: [
        HttpModule,
        TypeOrmModule.forFeature([PaymentTransaction]),
        ...(options.imports || [])
      ],
      controllers: [MidtransController],
      providers: [...this.createAsyncProviders(options), MidtransService],
      exports: [MidtransService]
    };
  }

  private static createAsyncProviders(options: MidtransModuleAsyncOptions): Provider[] {
    if (options.useFactory) {
      return [
        {
          provide: MIDTRANS_MODULE_OPTIONS,
          useFactory: options.useFactory,
          inject: options.inject || []
        }
      ];
    }

    const injectToken = options.useClass || options.useExisting;
    if (!injectToken) {
      throw new Error(
        'MidtransModule.forRootAsync requires one of useFactory, useClass, or useExisting'
      );
    }

    const providers: Provider[] = [
      {
        provide: MIDTRANS_MODULE_OPTIONS,
        useFactory: async (factory: MidtransOptionsFactory) =>
          factory.createMidtransOptions(),
        inject: [injectToken]
      }
    ];

    if (options.useClass) {
      providers.push({ provide: options.useClass, useClass: options.useClass });
    }

    return providers;
  }
}
