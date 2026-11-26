import { describe, expect, it } from 'vitest';
import raw from './fixtures/catalog-raw.json';
import { compactCatalog, parseSpecs } from '../src/ovh/catalog.ts';
import bundled from '../src/data/catalog.json';

describe('compactCatalog', () => {
  const catalog = compactCatalog(raw as never, new Date('2026-11-26T00:00:00Z'));

  it('keeps only base VPS plans', () => {
    expect(catalog.plans.map((p) => p.planCode)).toEqual(['vps-2027-model1', 'vps-2025-model1.LZ']);
  });

  it('converts prices from 1e-8 units using the no-commitment monthly price', () => {
    const p = catalog.plans[0]!;
    expect(p.price).toBe(4.49);
    expect(p.vcpu).toBe(2);
    expect(p.ramGb).toBe(4);
    expect(p.diskGb).toBe(40);
    expect(p.datacenters).toContain('GRA');
  });

  it('keeps locale info', () => {
    expect(catalog).toMatchObject({ subsidiary: 'FR', currency: 'EUR', taxRate: 20 });
  });

  it('bundled snapshot is not empty', () => {
    expect(bundled.plans.length).toBeGreaterThan(0);
  });
});

describe('parseSpecs', () => {
  it('handles missing values', () => {
    expect(parseSpecs('weird')).toEqual({ vcpu: null, ramGb: null, diskGb: null });
  });
});
