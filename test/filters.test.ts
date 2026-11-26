import { describe, expect, it } from 'vitest';
import { FilterConfigError, matches, parseFilters, plansToWatch } from '../src/filters.ts';
import type { Offer } from '../src/types.ts';
import { plan, testCatalog } from './helpers.ts';

const id = (p: number) => p;
const offer = (dc: string, price = 4.49, code = 'vps-2027-model1'): Offer => ({
  plan: plan({ planCode: code, price }),
  datacenter: dc,
  linux: 'available',
  windows: 'out-of-stock',
});

describe('parseFilters', () => {
  it('defaults to a catch-all filter', () => {
    expect(parseFilters(undefined)).toHaveLength(1);
    expect(parseFilters('  ')).toHaveLength(1);
    expect(parseFilters('[]')).toHaveLength(1);
  });

  it('accepts a single object', () => {
    expect(parseFilters('{"maxPrice": 5}')).toEqual([expect.objectContaining({ maxPrice: 5 })]);
  });

  it('normalises case', () => {
    const [f] = parseFilters('[{"datacenters":["gra"],"countries":["fr"]}]');
    expect(f).toMatchObject({ datacenters: ['GRA'], countries: ['FR'] });
  });

  it.each([
    ['not json', /valid JSON/],
    ['[{"maxPrice":"5"}]', /maxPrice/],
    ['[{"regions":["mars"]}]', /regions/],
    ['[{"os":"bsd"}]', /os/],
    ['[{"maxprice":5}]', /unknown key "maxprice"/],
    ['[42]', /must be an object/],
  ])('rejects %s', (input, msg) => {
    expect(() => parseFilters(input)).toThrow(FilterConfigError);
    expect(() => parseFilters(input)).toThrow(msg);
  });
});

describe('matches', () => {
  it('filters on price', () => {
    expect(matches(offer('GRA', 4.49), { maxPrice: 5 }, id)).toBe(true);
    expect(matches(offer('GRA', 6.49), { maxPrice: 5 }, id)).toBe(false);
    expect(matches(offer('GRA', 4.49), { maxPrice: 5 }, (p) => p * 1.2)).toBe(false);
  });

  it('filters on location', () => {
    expect(matches(offer('GRA'), { countries: ['FR'] }, id)).toBe(true);
    expect(matches(offer('BHS'), { countries: ['FR'] }, id)).toBe(false);
    expect(matches(offer('BHS'), { regions: ['north-america'] }, id)).toBe(true);
    expect(matches(offer('SBG'), { datacenters: ['GRA', 'SBG'] }, id)).toBe(true);
    expect(matches(offer('UNKNOWN-DC'), { countries: ['FR'] }, id)).toBe(false);
  });

  it('filters on specs and local zones', () => {
    expect(matches(offer('GRA'), { minVcpu: 4 }, id)).toBe(false);
    expect(matches(offer('GRA'), { minRamGb: 4 }, id)).toBe(true);
    expect(
      matches(
        offer('EU-WEST-LZ-AMS', 5.49, 'vps-2027-model1.LZ'),
        { includeLocalZones: false },
        id,
      ),
    ).toBe(false);
  });
});

describe('plansToWatch', () => {
  it('skips plans no filter can match', () => {
    const watched = plansToWatch(testCatalog.plans, [{ maxPrice: 5 }], id);
    expect(watched.map((p) => p.planCode)).toEqual(['vps-2027-model1']);
  });
});
