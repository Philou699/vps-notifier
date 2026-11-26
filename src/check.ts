import bundledCatalog from './data/catalog.json';
import { isAvailableFor, matches, parseFilters, plansToWatch } from './filters.ts';
import { sendDiscord, type Restock } from './notify/discord.ts';
import { apiBase } from './ovh/api.ts';
import { fetchAllAvailability } from './ovh/availability.ts';
import { fetchCatalog } from './ovh/catalog.ts';
import { loadState, nextState, offerKey, saveState, stateChanged } from './state.ts';
import type { Env } from './env.ts';
import type { Catalog, Offer } from './types.ts';

export const CATALOG_KEY = 'catalog:v1';

export interface Deps {
  fetch: typeof fetch;
  log?: (...args: unknown[]) => void;
}

export interface CheckResult {
  firstRun: boolean;
  watchedPlans: number;
  offers: number;
  restocks: Restock[];
  errors: string[];
}

const subsidiaryOf = (env: Env) => (env.OVH_SUBSIDIARY ?? 'FR').toUpperCase();

export async function loadCatalog(env: Env): Promise<Catalog> {
  const stored = await env.VPS_NOTIFIER.get<Catalog>(CATALOG_KEY, 'json');
  if (stored && stored.subsidiary === subsidiaryOf(env)) return stored;
  return bundledCatalog as Catalog;
}

export async function refreshCatalog(env: Env, deps: Deps): Promise<Catalog> {
  const catalog = await fetchCatalog(deps.fetch, apiBase(env.OVH_ENDPOINT), subsidiaryOf(env));
  if (catalog.plans.length === 0) throw new Error('OVH catalog returned no VPS plan');
  await env.VPS_NOTIFIER.put(CATALOG_KEY, JSON.stringify(catalog));
  deps.log?.(`catalog refreshed: ${catalog.plans.length} plans`);
  return catalog;
}

/** One polling round: fetch stock, diff with the previous round, notify restocks. */
export async function runCheck(env: Env, deps: Deps): Promise<CheckResult> {
  const log = deps.log ?? (() => {});
  const filters = parseFilters(env.FILTERS).map((f, i) => ({
    ...f,
    name: f.name ?? `filter #${i + 1}`,
  }));
  const subsidiary = subsidiaryOf(env);
  const catalog = await loadCatalog(env);
  const withTax = env.PRICE_WITH_TAX === 'true';
  const priceOf = (p: number) => (withTax ? p * (1 + catalog.taxRate / 100) : p);

  const watched = plansToWatch(catalog.plans, filters, priceOf);
  const { results, errors } = await fetchAllAvailability(
    deps.fetch,
    apiBase(env.OVH_ENDPOINT),
    subsidiary,
    watched.map((p) => p.planCode),
  );
  for (const e of errors) log(`availability error: ${e}`);

  const offers: Offer[] = [];
  for (const plan of watched) {
    for (const dc of results.get(plan.planCode) ?? []) {
      offers.push({ plan, datacenter: dc.datacenter, linux: dc.linux, windows: dc.windows });
    }
  }

  const previous = await loadState(env.VPS_NOTIFIER);
  const firstRun = previous === null;
  const notifyFirstRun = env.NOTIFY_ON_FIRST_RUN === 'true';

  const restocks: Restock[] = [];
  for (const offer of offers) {
    const before = previous?.[offerKey(offer)];
    // Unknown offer (first run, or plan newly watched): only record a baseline.
    if (!before && !(firstRun && notifyFirstRun)) continue;
    const prevOffer = before ? { ...offer, ...before } : undefined;
    const matched = filters.filter(
      (f) =>
        matches(offer, f, priceOf) &&
        isAvailableFor(offer, f.os) &&
        !(prevOffer && isAvailableFor(prevOffer, f.os)),
    );
    if (matched.length > 0) {
      restocks.push({ offer, filters: matched.map((f) => f.name) });
    }
  }

  if (restocks.length > 0) {
    log(`${restocks.length} restock(s): ${restocks.map((r) => offerKey(r.offer)).join(', ')}`);
    if (env.DISCORD_WEBHOOK_URL) {
      // If this throws, state is not saved and the notification is retried next minute.
      await sendDiscord(deps.fetch, env.DISCORD_WEBHOOK_URL, restocks, {
        currency: catalog.currency,
        taxRate: catalog.taxRate,
        subsidiary,
      });
    } else {
      log('DISCORD_WEBHOOK_URL is not set, skipping notification');
    }
  }

  const next = nextState(previous, offers, new Set(results.keys()));
  if (stateChanged(previous, next)) await saveState(env.VPS_NOTIFIER, next);

  return { firstRun, watchedPlans: watched.length, offers: offers.length, restocks, errors };
}
