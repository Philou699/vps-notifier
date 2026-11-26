import type { DatacenterAvailability, StockStatus } from '../types.ts';
import { getJson } from './api.ts';

interface RawAvailability {
  datacenters: {
    datacenter: string;
    status: string;
    linuxStatus?: string;
    windowsStatus?: string;
  }[];
}

const toStatus = (s: string | undefined): StockStatus =>
  s === 'available' ? 'available' : 'out-of-stock';

export async function fetchAvailability(
  fetchFn: typeof fetch,
  base: string,
  subsidiary: string,
  planCode: string,
): Promise<DatacenterAvailability[]> {
  const url =
    `${base}/vps/order/rule/datacenter?ovhSubsidiary=${encodeURIComponent(subsidiary)}` +
    `&planCode=${encodeURIComponent(planCode)}`;
  const raw = await getJson<RawAvailability>(fetchFn, url);
  return raw.datacenters.map((d) => ({
    datacenter: d.datacenter,
    linux: toStatus(d.linuxStatus ?? d.status),
    windows: toStatus(d.windowsStatus ?? d.status),
  }));
}

/**
 * Fetches availability for several plans in parallel.
 * Plans that fail are simply missing from the result, so their previous state is kept.
 */
export async function fetchAllAvailability(
  fetchFn: typeof fetch,
  base: string,
  subsidiary: string,
  planCodes: string[],
): Promise<{ results: Map<string, DatacenterAvailability[]>; errors: string[] }> {
  const settled = await Promise.allSettled(
    planCodes.map((code) => fetchAvailability(fetchFn, base, subsidiary, code)),
  );
  const results = new Map<string, DatacenterAvailability[]>();
  const errors: string[] = [];
  settled.forEach((r, i) => {
    const code = planCodes[i]!;
    if (r.status === 'fulfilled') results.set(code, r.value);
    else errors.push(`${code}: ${r.reason instanceof Error ? r.reason.message : String(r.reason)}`);
  });
  return { results, errors };
}
