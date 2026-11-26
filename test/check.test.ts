import { describe, expect, it } from 'vitest';
import { CATALOG_KEY, refreshCatalog, runCheck } from '../src/check.ts';
import { STATE_KEY } from '../src/state.ts';
import raw from './fixtures/catalog-raw.json';
import realAvailability from './fixtures/availability-vps-2027-model1.json';
import { fakeFetch, makeEnv, testCatalog } from './helpers.ts';

function setup(filters?: unknown, extra = {}) {
  const env = makeEnv({ FILTERS: filters ? JSON.stringify(filters) : undefined, ...extra });
  env.VPS_NOTIFIER.store.set(CATALOG_KEY, JSON.stringify(testCatalog));
  return env;
}

const OOS = [{ datacenter: 'GRA' }, { datacenter: 'BHS' }];
const GRA_IN = [{ datacenter: 'GRA', linux: 'available' }, { datacenter: 'BHS' }];

describe('runCheck', () => {
  it('records a baseline on first run without notifying', async () => {
    const env = setup();
    const f = fakeFetch({ 'vps-2027-model1': GRA_IN });
    const r = await runCheck(env, { fetch: f.fn });
    expect(r.firstRun).toBe(true);
    expect(f.discordCalls).toHaveLength(0);
    expect(env.VPS_NOTIFIER.store.has(STATE_KEY)).toBe(true);
  });

  it('notifies on first run when NOTIFY_ON_FIRST_RUN=true', async () => {
    const env = setup(undefined, { NOTIFY_ON_FIRST_RUN: 'true' });
    const f = fakeFetch({ 'vps-2027-model1': GRA_IN });
    await runCheck(env, { fetch: f.fn });
    expect(f.discordCalls).toHaveLength(1);
  });

  it('notifies once on out-of-stock -> available, then stays quiet', async () => {
    const env = setup([{ name: 'cheap FR', maxPrice: 5, countries: ['FR'] }]);
    await runCheck(env, { fetch: fakeFetch({ 'vps-2027-model1': OOS }).fn });

    const f = fakeFetch({ 'vps-2027-model1': GRA_IN });
    const r = await runCheck(env, { fetch: f.fn });
    expect(r.restocks).toHaveLength(1);
    expect(f.discordCalls).toHaveLength(1);
    const msg = f.discordCalls[0] as { embeds: { title: string; fields: { value: string }[] }[] };
    expect(msg.embeds[0]!.title).toContain('VPS-1 2027');
    expect(msg.embeds[0]!.title).toContain('Gravelines');
    expect(JSON.stringify(msg)).toContain('cheap FR');

    const puts = env.VPS_NOTIFIER.puts;
    const again = fakeFetch({ 'vps-2027-model1': GRA_IN });
    await runCheck(env, { fetch: again.fn });
    expect(again.discordCalls).toHaveLength(0);
    expect(env.VPS_NOTIFIER.puts).toBe(puts); // no KV write when nothing changed
  });

  it('only polls plans that a filter can match', async () => {
    const env = setup([{ maxPrice: 5 }]);
    const f = fakeFetch({});
    await runCheck(env, { fetch: f.fn });
    expect(f.ovhCalls).toHaveLength(1);
    expect(f.ovhCalls[0]).toContain('planCode=vps-2027-model1');
  });

  it('does not notify when the location filter excludes the restock', async () => {
    const env = setup([{ countries: ['CA'] }]);
    await runCheck(env, { fetch: fakeFetch({ 'vps-2027-model1': OOS }).fn });
    const f = fakeFetch({ 'vps-2027-model1': GRA_IN });
    await runCheck(env, { fetch: f.fn });
    expect(f.discordCalls).toHaveLength(0);
  });

  it('respects the os filter', async () => {
    const env = setup([{ os: 'windows' }]);
    await runCheck(env, { fetch: fakeFetch({ 'vps-2027-model1': OOS }).fn });
    const f = fakeFetch({ 'vps-2027-model1': GRA_IN });
    await runCheck(env, { fetch: f.fn });
    expect(f.discordCalls).toHaveLength(0);
  });

  it('keeps previous state when OVH errors, so recovery is not a fake restock', async () => {
    const env = setup([{ maxPrice: 5 }]);
    await runCheck(env, { fetch: fakeFetch({ 'vps-2027-model1': GRA_IN }).fn });
    const err = await runCheck(env, { fetch: fakeFetch({ 'vps-2027-model1': 'error' }).fn });
    expect(err.errors).toHaveLength(1);
    const f = fakeFetch({ 'vps-2027-model1': GRA_IN });
    await runCheck(env, { fetch: f.fn });
    expect(f.discordCalls).toHaveLength(0);
  });

  it('does not save state when Discord fails, so it retries next run', async () => {
    const env = setup([{ maxPrice: 5 }]);
    await runCheck(env, { fetch: fakeFetch({ 'vps-2027-model1': OOS }).fn });
    const failing = (async (input: RequestInfo | URL) =>
      String(input).startsWith('https://discord.test')
        ? new Response('nope', { status: 500 })
        : fakeFetch({ 'vps-2027-model1': GRA_IN }).fn(input)) as typeof fetch;
    await expect(runCheck(env, { fetch: failing })).rejects.toThrow(/Discord/);
    const f = fakeFetch({ 'vps-2027-model1': GRA_IN });
    await runCheck(env, { fetch: f.fn });
    expect(f.discordCalls).toHaveLength(1);
  });

  it('parses a real OVH availability response', async () => {
    const env = setup([{ plans: ['vps-2027-model1'] }], { NOTIFY_ON_FIRST_RUN: 'true' });
    const fetchFn = (async (input: RequestInfo | URL) =>
      String(input).startsWith('https://discord.test')
        ? new Response(null, { status: 204 })
        : Response.json(realAvailability)) as typeof fetch;
    const r = await runCheck(env, { fetch: fetchFn });
    expect(r.offers).toBe(realAvailability.datacenters.length);
  });
});

describe('refreshCatalog', () => {
  it('stores a compact catalog in KV', async () => {
    const env = makeEnv();
    await refreshCatalog(env, { fetch: (async () => Response.json(raw)) as typeof fetch });
    const stored = JSON.parse(env.VPS_NOTIFIER.store.get(CATALOG_KEY)!);
    expect(stored.plans.length).toBe(2);
  });
});
