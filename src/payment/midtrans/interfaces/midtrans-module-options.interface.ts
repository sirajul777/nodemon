import { ModuleMetadata, Type } from '@nestjs/common';

export interface MidtransModuleOptions {
  /** Server key from Midtrans dashboard (Settings > Access Keys). Keep secret. */
  serverKey: string;
  /** Client key from Midtrans dashboard. Safe to expose to frontend if needed (not used server-side here). */
  clientKey?: string;
  /** Which Midtrans environment to call. */
  env: 'sandbox' | 'production';
  /** Which QRIS acquirer to charge through. Defaults to "gopay". */
  defaultAcquirer?: 'gopay' | 'airpay shopee';
}

export interface MidtransModuleAsyncOptions
  extends Pick<ModuleMetadata, 'imports'> {
  useFactory?: (
    ...args: any[]
  ) => Promise<MidtransModuleOptions> | MidtransModuleOptions;
  inject?: any[];
  useClass?: Type<MidtransOptionsFactory>;
  useExisting?: Type<MidtransOptionsFactory>;
}

export interface MidtransOptionsFactory {
  createMidtransOptions(): Promise<MidtransModuleOptions> | MidtransModuleOptions;
}
