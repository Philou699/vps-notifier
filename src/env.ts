export interface Env {
  VPS_NOTIFIER: KVNamespace;
  DISCORD_WEBHOOK_URL?: string;
  /** OVH subsidiary used for prices and availability (FR, DE, GB, CA, US…). */
  OVH_SUBSIDIARY?: string;
  /** "eu" (default), "ca" or "us". */
  OVH_ENDPOINT?: string;
  /** JSON array of filters, see README. */
  FILTERS?: string;
  /** "true" to compare `maxPrice` against the price including VAT. */
  PRICE_WITH_TAX?: string;
  /** "true" to send notifications for everything available on the very first run. */
  NOTIFY_ON_FIRST_RUN?: string;
}
