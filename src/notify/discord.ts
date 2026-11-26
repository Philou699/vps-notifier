import { describeLocation } from '../locations.ts';
import type { Offer } from '../types.ts';

export interface Restock {
  offer: Offer;
  filters: string[];
}

export interface FormatOptions {
  currency: string;
  taxRate: number;
  subsidiary: string;
}

interface Embed {
  title: string;
  url: string;
  color: number;
  description: string;
  fields: { name: string; value: string; inline?: boolean }[];
  footer: { text: string };
  timestamp: string;
}

const MAX_EMBEDS_PER_MESSAGE = 10;
const GREEN = 0x2ecc71;

const LANG: Record<string, string> = {
  FR: 'fr',
  DE: 'de',
  ES: 'es-es',
  IT: 'it',
  PL: 'pl',
  PT: 'pt',
  NL: 'nl',
  IE: 'en-ie',
  GB: 'en-gb',
  CA: 'en-ca',
  QC: 'fr-ca',
  US: 'en',
  AU: 'en-au',
  SG: 'en-sg',
  IN: 'en-in',
};

export function orderUrl(subsidiary: string): string {
  return `https://www.ovhcloud.com/${LANG[subsidiary.toUpperCase()] ?? 'en'}/vps/`;
}

export function formatPrice(amount: number, currency: string): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount);
}

function stockLabel(offer: Offer): string {
  const parts = [];
  if (offer.linux === 'available') parts.push('Linux');
  if (offer.windows === 'available') parts.push('Windows');
  return parts.join(' + ') || '—';
}

export function buildEmbed(restock: Restock, opts: FormatOptions, now: Date): Embed {
  const { plan, datacenter } = restock.offer;
  const withTax = plan.price * (1 + opts.taxRate / 100);
  return {
    title: `${plan.name} available in ${describeLocation(datacenter)}`,
    url: orderUrl(opts.subsidiary),
    color: GREEN,
    description: plan.description,
    fields: [
      {
        name: 'Price / month',
        value: `${formatPrice(plan.price, opts.currency)} excl. VAT (${formatPrice(withTax, opts.currency)} incl.)`,
        inline: true,
      },
      { name: 'In stock', value: stockLabel(restock.offer), inline: true },
      { name: 'Plan code', value: `\`${plan.planCode}\``, inline: true },
      { name: 'Matched filters', value: restock.filters.join(', ') || '—' },
    ],
    footer: { text: `vps-notifier · OVH ${opts.subsidiary}` },
    timestamp: now.toISOString(),
  };
}

export function buildMessages(restocks: Restock[], opts: FormatOptions, now = new Date()) {
  const embeds = restocks.map((r) => buildEmbed(r, opts, now));
  const messages = [];
  for (let i = 0; i < embeds.length; i += MAX_EMBEDS_PER_MESSAGE) {
    messages.push({
      username: 'OVH VPS notifier',
      content: i === 0 ? `🟢 **${restocks.length} OVH VPS offer(s) back in stock**` : undefined,
      embeds: embeds.slice(i, i + MAX_EMBEDS_PER_MESSAGE),
    });
  }
  return messages;
}

async function post(fetchFn: typeof fetch, webhookUrl: string, body: unknown): Promise<Response> {
  return fetchFn(webhookUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export async function sendDiscord(
  fetchFn: typeof fetch,
  webhookUrl: string,
  restocks: Restock[],
  opts: FormatOptions,
): Promise<void> {
  for (const message of buildMessages(restocks, opts)) {
    let res = await post(fetchFn, webhookUrl, message);
    if (res.status === 429) {
      const retryAfter = Number(res.headers.get('retry-after') ?? '1');
      await new Promise((r) => setTimeout(r, Math.min(retryAfter, 10) * 1000));
      res = await post(fetchFn, webhookUrl, message);
    }
    if (!res.ok) {
      throw new Error(`Discord webhook failed: HTTP ${res.status} ${await res.text()}`);
    }
  }
}
