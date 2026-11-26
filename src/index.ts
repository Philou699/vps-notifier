import { loadCatalog, refreshCatalog, runCheck } from './check.ts';
import { loadState } from './state.ts';
import type { Env } from './env.ts';

/** Must match the daily trigger in wrangler.toml. */
const CATALOG_CRON = '17 4 * * *';

export default {
  async scheduled(event, env, ctx) {
    const deps = { fetch: fetch.bind(globalThis), log: console.log };
    if (event.cron === CATALOG_CRON) {
      await refreshCatalog(env, deps);
      return;
    }
    const result = await runCheck(env, deps);
    console.log(
      `checked ${result.watchedPlans} plans / ${result.offers} offers, ` +
        `${result.restocks.length} restock(s), ${result.errors.length} error(s)` +
        (result.firstRun ? ' (first run: baseline recorded)' : ''),
    );
    void ctx;
  },

  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/health') return new Response('ok');
    if (url.pathname === '/' || url.pathname === '/status') {
      const [state, catalog] = await Promise.all([loadState(env.VPS_NOTIFIER), loadCatalog(env)]);
      const available = Object.entries(state ?? {})
        .filter(([, s]) => s.linux === 'available' || s.windows === 'available')
        .map(([key, s]) => ({ offer: key, ...s }));
      return Response.json({
        catalog: {
          subsidiary: catalog.subsidiary,
          updatedAt: catalog.updatedAt,
          plans: catalog.plans.length,
        },
        tracked: Object.keys(state ?? {}).length,
        available,
      });
    }
    return new Response('Not found', { status: 404 });
  },
} satisfies ExportedHandler<Env>;
