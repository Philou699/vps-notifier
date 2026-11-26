import type { Env } from '../src/env.ts';
import type { Catalog, CatalogPlan } from '../src/types.ts';

export class MemoryKV {
  store = new Map<string, string>();
  puts = 0;
  async get(key: string, type?: string) {
    const v = this.store.get(key);
    if (v === undefined) return null;
    return type === 'json' ? JSON.parse(v) : v;
  }
  async put(key: string, value: string) {
    this.puts++;
    this.store.set(key, value);
  }
}

export function makeEnv(overrides: Partial<Env> = {}): Env & { VPS_NOTIFIER: MemoryKV } {
  return {
    VPS_NOTIFIER: new MemoryKV(),
    OVH_SUBSIDIARY: 'FR',
    DISCORD_WEBHOOK_URL: 'https://discord.test/webhook',
    ...overrides,
  } as unknown as Env & { VPS_NOTIFIER: MemoryKV };
}

export const plan = (p: Partial<CatalogPlan> & { planCode: string }): CatalogPlan => ({
  name: p.planCode,
  description: 'VPS 2 vCPU 4 GB RAM 40 GB disk',
  vcpu: 2,
  ramGb: 4,
  diskGb: 40,
  price: 4.49,
  datacenters: [],
  ...p,
});

export const testCatalog: Catalog = {
  subsidiary: 'FR',
  currency: 'EUR',
  taxRate: 20,
  updatedAt: '2026-11-26T00:00:00.000Z',
  plans: [
    plan({ planCode: 'vps-2027-model1', name: 'VPS-1 2027', price: 4.49 }),
    plan({ planCode: 'vps-2027-model2', name: 'VPS-2 2027', price: 8.49, vcpu: 4, ramGb: 8 }),
    plan({ planCode: 'vps-2027-model1.LZ', name: 'VPS-1 LZ 2027', price: 5.49 }),
  ],
};

type DcStatus = { datacenter: string; linux?: string; windows?: string };

/** Fake fetch: OVH availability per plan + recording of Discord calls. */
export function fakeFetch(stock: Record<string, DcStatus[] | 'error'>) {
  const discordCalls: unknown[] = [];
  const ovhCalls: string[] = [];
  const fn = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.startsWith('https://discord.test')) {
      discordCalls.push(JSON.parse(String(init?.body)));
      return new Response(null, { status: 204 });
    }
    ovhCalls.push(url);
    const code = new URL(url).searchParams.get('planCode')!;
    const s = stock[code];
    if (s === 'error') return new Response('boom', { status: 500 });
    return Response.json({
      datacenters: (s ?? []).map((d) => ({
        datacenter: d.datacenter,
        status: d.linux ?? 'out-of-stock',
        linuxStatus: d.linux ?? 'out-of-stock',
        windowsStatus: d.windows ?? 'out-of-stock',
      })),
    });
  }) as typeof fetch;
  return { fn, discordCalls, ovhCalls };
}
