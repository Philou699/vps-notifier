import type { Catalog, CatalogPlan } from '../types.ts';
import { getJson } from './api.ts';

/** Only the "real" VPS plans, not the countless promo/commitment variants. */
const BASE_PLAN = /^vps-\d{4}-model\d+(\.LZ)?$/;
/** OVH catalog prices are expressed in 1e-8 of the currency unit. */
const PRICE_UNIT = 100_000_000;

interface RawPricing {
  capacities: string[];
  interval: number;
  intervalUnit?: string;
  commitment: number;
  mode: string;
  price: number;
}

interface RawCatalog {
  locale: { currencyCode: string; subsidiary: string; taxRate: number };
  plans: {
    planCode: string;
    invoiceName: string;
    product: string;
    pricings: RawPricing[];
    configurations: { name: string; values: string[] }[];
  }[];
  products: { name: string; description: string }[];
}

export function parseSpecs(description: string): Pick<CatalogPlan, 'vcpu' | 'ramGb' | 'diskGb'> {
  const num = (re: RegExp) => {
    const m = description.match(re);
    return m?.[1] ? Number(m[1]) : null;
  };
  return {
    vcpu: num(/(\d+)\s*vCPU/i),
    ramGb: num(/(\d+)\s*GB\s*RAM/i),
    diskGb: num(/(\d+)\s*GB\s*disk/i),
  };
}

function monthlyPrice(pricings: RawPricing[]): number | null {
  const candidates = pricings.filter(
    (p) => p.capacities.includes('renew') && p.interval === 1 && p.commitment === 0,
  );
  const best = candidates.find((p) => p.mode === 'default') ?? candidates[0];
  return best ? Math.round((best.price / PRICE_UNIT) * 100) / 100 : null;
}

/** Turns the ~6 MB OVH catalog into a tiny structure we can keep in KV. */
export function compactCatalog(raw: RawCatalog, now = new Date()): Catalog {
  const descriptions = new Map(raw.products.map((p) => [p.name, p.description]));
  const plans: CatalogPlan[] = [];
  for (const plan of raw.plans) {
    if (!BASE_PLAN.test(plan.planCode)) continue;
    const price = monthlyPrice(plan.pricings);
    if (price === null) continue;
    const description = descriptions.get(plan.product) ?? '';
    plans.push({
      planCode: plan.planCode,
      name: plan.invoiceName,
      description,
      ...parseSpecs(description),
      price,
      datacenters: plan.configurations.find((c) => c.name === 'vps_datacenter')?.values ?? [],
    });
  }
  plans.sort((a, b) => a.price - b.price || a.planCode.localeCompare(b.planCode));
  return {
    subsidiary: raw.locale.subsidiary,
    currency: raw.locale.currencyCode,
    taxRate: raw.locale.taxRate,
    updatedAt: now.toISOString(),
    plans,
  };
}

export async function fetchCatalog(
  fetchFn: typeof fetch,
  base: string,
  subsidiary: string,
): Promise<Catalog> {
  const url = `${base}/order/catalog/public/vps?ovhSubsidiary=${encodeURIComponent(subsidiary)}`;
  const raw = await getJson<RawCatalog>(fetchFn, url, 30_000);
  return compactCatalog(raw);
}
