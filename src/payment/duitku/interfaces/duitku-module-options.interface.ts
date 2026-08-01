import { ModuleMetadata, Type } from '@nestjs/common';

export interface DuitkuModuleOptions {
  /** Merchant code from Duitku dashboard. */
  merchantCode: string;
  /** API key from Duitku dashboard. Keep this secret, never expose to frontend. */
  apiKey: string;
  /** Which Duitku environment to call. */
  env: 'sandbox' | 'production';
  /**
   * Full public URL Duitku will POST payment results to.
   * Must be reachable from the internet (not localhost) in production.
   * e.g. https://yourapp.com/api/payments/duitku/callback
   */
  callbackUrl: string;
  /**
   * Full public URL the customer is redirected to after leaving the
   * Duitku payment page (paid, pending, or canceled).
   * e.g. https://yourapp.com/payment/return
   */
  returnUrl: string;
  /** Default QRIS expiry in minutes if not overridden per-request. Duitku default/min is 10, max 60. */
  defaultExpiryMinutes?: number;
}

export interface DuitkuModuleAsyncOptions
  extends Pick<ModuleMetadata, 'imports'> {
  useFactory?: (
    ...args: any[]
  ) => Promise<DuitkuModuleOptions> | DuitkuModuleOptions;
  inject?: any[];
  useClass?: Type<DuitkuOptionsFactory>;
  useExisting?: Type<DuitkuOptionsFactory>;
}

export interface DuitkuOptionsFactory {
  createDuitkuOptions(): Promise<DuitkuModuleOptions> | DuitkuModuleOptions;
}
