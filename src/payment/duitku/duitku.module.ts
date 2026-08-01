import { HttpModule } from '@nestjs/axios';
import { DynamicModule, Module, Provider } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { DUITKU_MODULE_OPTIONS } from './duitku.constants';
import { DuitkuController } from './duitku.controller';
import { PaymentTransaction } from './entities/payment-transaction.entity';
import {
  DuitkuModuleAsyncOptions,
  DuitkuModuleOptions,
  DuitkuOptionsFactory
} from './interfaces/duitku-module-options.interface';
import { DuitkuService } from './duitku.service';

@Module({})
export class DuitkuModule {
  /** Static config, e.g. DuitkuModule.forRoot({ merchantCode: ..., apiKey: ... }) */
  static forRoot(options: DuitkuModuleOptions): DynamicModule {
    return {
      module: DuitkuModule,
      imports: [HttpModule, TypeOrmModule.forFeature([PaymentTransaction])],
      controllers: [DuitkuController],
      providers: [
        { provide: DUITKU_MODULE_OPTIONS, useValue: options },
        DuitkuService
      ],
      exports: [DuitkuService]
    };
  }

  /**
   * Async config pulling from ConfigService, e.g.:
   *
   *   DuitkuModule.forRootAsync({
   *     imports: [ConfigModule],
   *     inject: [ConfigService],
   *     useFactory: (config: ConfigService) => ({
   *       merchantCode: config.get('DUITKU_MERCHANT_CODE'),
   *       apiKey: config.get('DUITKU_API_KEY'),
   *       env: config.get('DUITKU_ENV'),
   *       callbackUrl: config.get('DUITKU_CALLBACK_URL'),
   *       returnUrl: config.get('DUITKU_RETURN_URL')
   *     })
   *   })
   */
  static forRootAsync(options: DuitkuModuleAsyncOptions): DynamicModule {
    return {
      module: DuitkuModule,
      imports: [
        HttpModule,
        TypeOrmModule.forFeature([PaymentTransaction]),
        ...(options.imports || [])
      ],
      controllers: [DuitkuController],
      providers: [...this.createAsyncProviders(options), DuitkuService],
      exports: [DuitkuService]
    };
  }

  private static createAsyncProviders(options: DuitkuModuleAsyncOptions): Provider[] {
    if (options.useFactory) {
      return [
        {
          provide: DUITKU_MODULE_OPTIONS,
          useFactory: options.useFactory,
          inject: options.inject || []
        }
      ];
    }

    const injectToken = options.useClass || options.useExisting;
    if (!injectToken) {
      throw new Error(
        'DuitkuModule.forRootAsync requires one of useFactory, useClass, or useExisting'
      );
    }

    const providers: Provider[] = [
      {
        provide: DUITKU_MODULE_OPTIONS,
        useFactory: async (factory: DuitkuOptionsFactory) =>
          factory.createDuitkuOptions(),
        inject: [injectToken]
      }
    ];

    if (options.useClass) {
      providers.push({ provide: options.useClass, useClass: options.useClass });
    }

    return providers;
  }
}
