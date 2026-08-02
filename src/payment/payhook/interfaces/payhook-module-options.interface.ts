import { ModuleMetadata, Type } from '@nestjs/common';

export interface PayhookModuleOptions {
  /** API key from the PayHook dashboard. Keep secret. */
  apiKey: string;
  /** Secret key from the PayHook dashboard. Keep secret. */
  secretKey: string;
  /** Partner code from the PayHook dashboard. */
  partnerCode: string;
  /** Which PayHook environment to call. */
  env: 'sandbox' | 'production';
  /**
   * Full public URL PayHook will POST payment results (callbacks) to.
   * Must be reachable from the internet in production.
   * e.g. https://yourapp.com/payments/payhook/callback
   */
  callbackUrl: string;
  /** Payment method to charge. QRIS or GoPay (dynamic QR via GoPay merchant). */
  defaultMethod?: 'QRIS' | 'gopay';
}

export interface PayhookModuleAsyncOptions
  extends Pick<ModuleMetadata, 'imports'> {
  useFactory?: (
    ...args: any[]
  ) => Promise<PayhookModuleOptions> | PayhookModuleOptions;
  inject?: any[];
  useClass?: Type<PayhookOptionsFactory>;
  useExisting?: Type<PayhookOptionsFactory>;
}

export interface PayhookOptionsFactory {
  createPayhookOptions(): Promise<PayhookModuleOptions> | PayhookModuleOptions;
}

