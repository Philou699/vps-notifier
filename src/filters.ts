import { isLocalZone, locate, type Region } from './locations.ts';
import type { Offer } from './types.ts';

export type OsFilter = 'linux' | 'windows' | 'any';

export interface Filter {
  /** Shown in the notification. */
  name?: string;
  /** Maximum monthly price (excl. VAT unless PRICE_WITH_TAX=true). */
  maxPrice?: number;
  /** Exact plan codes, e.g. "vps-2027-model1". */
  plans?: string[];
  /** Datacenter codes, e.g. "GRA", "SBG", "EU-WEST-LZ-AMS". */
  datacenters?: string[];
  /** ISO country codes, e.g. "FR", "DE". */
  countries?: string[];
  regions?: Region[];
  minVcpu?: number;
  minRamGb?: number;
  minDiskGb?: number;
  /** Which OS stock to watch. Default: linux. */
  os?: OsFilter;
  /** Include Local Zone plans (".LZ"). Default: true. */
  includeLocalZones?: boolean;
}

const REGIONS: Region[] = ['europe', 'north-america', 'asia-pacific'];
const OS: OsFilter[] = ['linux', 'windows', 'any'];

export class FilterConfigError extends Error {}

function assertStringArray(value: unknown, field: string, i: number): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.some((v) => typeof v !== 'string' || v === '')) {
    throw new FilterConfigError(`FILTERS[${i}].${field} must be an array of non-empty strings`);
  }
  return value as string[];
}

function assertNumber(value: unknown, field: string, i: number): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new FilterConfigError(`FILTERS[${i}].${field} must be a positive number`);
  }
  return value;
}

const KNOWN_KEYS = new Set([
  'name',
  'maxPrice',
  'plans',
  'datacenters',
  'countries',
  'regions',
  'minVcpu',
  'minRamGb',
  'minDiskGb',
  'os',
  'includeLocalZones',
]);

/** Parses and validates the FILTERS env var. No filter at all means "notify for everything". */
export function parseFilters(raw: string | undefined): Filter[] {
  if (raw === undefined || raw.trim() === '') return [{ name: 'Everything' }];
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    throw new FilterConfigError(`FILTERS is not valid JSON: ${(e as Error).message}`);
  }
  const list = Array.isArray(data) ? data : [data];
  if (list.length === 0) return [{ name: 'Everything' }];

  return list.map((f, i): Filter => {
    if (typeof f !== 'object' || f === null || Array.isArray(f)) {
      throw new FilterConfigError(`FILTERS[${i}] must be an object`);
    }
    const o = f as Record<string, unknown>;
    for (const key of Object.keys(o)) {
      if (!KNOWN_KEYS.has(key)) throw new FilterConfigError(`FILTERS[${i}]: unknown key "${key}"`);
    }
    if (o.name !== undefined && typeof o.name !== 'string') {
      throw new FilterConfigError(`FILTERS[${i}].name must be a string`);
    }
    const regions = assertStringArray(o.regions, 'regions', i);
    if (regions?.some((r) => !REGIONS.includes(r as Region))) {
      throw new FilterConfigError(`FILTERS[${i}].regions must only contain ${REGIONS.join(', ')}`);
    }
    if (o.os !== undefined && !OS.includes(o.os as OsFilter)) {
      throw new FilterConfigError(`FILTERS[${i}].os must be one of ${OS.join(', ')}`);
    }
    if (o.includeLocalZones !== undefined && typeof o.includeLocalZones !== 'boolean') {
      throw new FilterConfigError(`FILTERS[${i}].includeLocalZones must be a boolean`);
    }
    return {
      name: o.name as string | undefined,
      maxPrice: assertNumber(o.maxPrice, 'maxPrice', i),
      plans: assertStringArray(o.plans, 'plans', i),
      datacenters: assertStringArray(o.datacenters, 'datacenters', i)?.map((d) => d.toUpperCase()),
      countries: assertStringArray(o.countries, 'countries', i)?.map((c) => c.toUpperCase()),
      regions: regions as Region[] | undefined,
      minVcpu: assertNumber(o.minVcpu, 'minVcpu', i),
      minRamGb: assertNumber(o.minRamGb, 'minRamGb', i),
      minDiskGb: assertNumber(o.minDiskGb, 'minDiskGb', i),
      os: o.os as OsFilter | undefined,
      includeLocalZones: o.includeLocalZones as boolean | undefined,
    };
  });
}

export function isAvailableFor(offer: Offer, os: OsFilter = 'linux'): boolean {
  if (os === 'linux') return offer.linux === 'available';
  if (os === 'windows') return offer.windows === 'available';
  return offer.linux === 'available' || offer.windows === 'available';
}

/** Does this offer match the filter, ignoring stock? */
export function matches(offer: Offer, filter: Filter, priceOf: (price: number) => number): boolean {
  const { plan, datacenter } = offer;
  const dc = datacenter.toUpperCase();
  const loc = locate(dc);

  if (filter.maxPrice !== undefined && priceOf(plan.price) > filter.maxPrice) return false;
  if (filter.plans && !filter.plans.includes(plan.planCode)) return false;
  if (filter.datacenters && !filter.datacenters.includes(dc)) return false;
  if (filter.countries && (!loc || !filter.countries.includes(loc.country))) return false;
  if (filter.regions && (!loc || !filter.regions.includes(loc.region))) return false;
  if (filter.minVcpu !== undefined && (plan.vcpu ?? 0) < filter.minVcpu) return false;
  if (filter.minRamGb !== undefined && (plan.ramGb ?? 0) < filter.minRamGb) return false;
  if (filter.minDiskGb !== undefined && (plan.diskGb ?? 0) < filter.minDiskGb) return false;
  if (filter.includeLocalZones === false && isLocalZone(dc)) return false;
  return true;
}

/** Plans that at least one filter could match, so we don't poll the others. */
export function plansToWatch(
  plans: Offer['plan'][],
  filters: Filter[],
  priceOf: (price: number) => number,
): Offer['plan'][] {
  return plans.filter((plan) =>
    filters.some((f) => {
      if (f.maxPrice !== undefined && priceOf(plan.price) > f.maxPrice) return false;
      if (f.plans && !f.plans.includes(plan.planCode)) return false;
      if (f.includeLocalZones === false && plan.planCode.endsWith('.LZ')) return false;
      return true;
    }),
  );
}
