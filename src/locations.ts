export type Region = 'europe' | 'north-america' | 'asia-pacific';

export interface Location {
  city: string;
  /** ISO 3166-1 alpha-2 */
  country: string;
  region: Region;
  /** Local Zone: smaller OVH sites, sold as separate ".LZ" plans. */
  localZone: boolean;
}

const dc = (city: string, country: string, region: Region, localZone = false): Location => ({
  city,
  country,
  region,
  localZone,
});

/** Datacenter codes as returned by /vps/order/rule/datacenter. */
export const LOCATIONS: Record<string, Location> = {
  GRA: dc('Gravelines', 'FR', 'europe'),
  SBG: dc('Strasbourg', 'FR', 'europe'),
  'EU-WEST-RBX': dc('Roubaix', 'FR', 'europe'),
  RBX: dc('Roubaix', 'FR', 'europe'),
  DE: dc('Frankfurt (Limburg)', 'DE', 'europe'),
  UK: dc('London (Erith)', 'GB', 'europe'),
  WAW: dc('Warsaw', 'PL', 'europe'),
  'EU-SOUTH-MIL': dc('Milan', 'IT', 'europe'),
  BHS: dc('Beauharnois', 'CA', 'north-america'),
  SGP: dc('Singapore', 'SG', 'asia-pacific'),
  SYD: dc('Sydney', 'AU', 'asia-pacific'),
  YNM: dc('Mumbai', 'IN', 'asia-pacific'),
  'EU-CENTRAL-LZ-PRG': dc('Prague', 'CZ', 'europe', true),
  'EU-CENTRAL-LZ-SOF': dc('Sofia', 'BG', 'europe', true),
  'EU-NORTH-LZ-STO': dc('Stockholm', 'SE', 'europe', true),
  'EU-SOUTH-LZ-MAD': dc('Madrid', 'ES', 'europe', true),
  'EU-WEST-LZ-AMS': dc('Amsterdam', 'NL', 'europe', true),
  'EU-WEST-LZ-BRU': dc('Brussels', 'BE', 'europe', true),
  'EU-WEST-LZ-DLN': dc('Dublin', 'IE', 'europe', true),
  'EU-WEST-LZ-MRS': dc('Marseille', 'FR', 'europe', true),
  'EU-WEST-LZ-VIE': dc('Vienna', 'AT', 'europe', true),
  'EU-WEST-LZ-ZRH': dc('Zurich', 'CH', 'europe', true),
};

/** Best-effort lookup, so a datacenter OVH adds tomorrow still shows up. */
export function locate(datacenter: string): Location | undefined {
  return LOCATIONS[datacenter.toUpperCase()];
}

export function isLocalZone(datacenter: string): boolean {
  return locate(datacenter)?.localZone ?? datacenter.toUpperCase().includes('-LZ-');
}

export function flag(country: string): string {
  if (!/^[A-Z]{2}$/.test(country)) return '';
  return String.fromCodePoint(...[...country].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

export function describeLocation(datacenter: string): string {
  const loc = locate(datacenter);
  return loc ? `${flag(loc.country)} ${loc.city} (${datacenter})` : datacenter;
}
