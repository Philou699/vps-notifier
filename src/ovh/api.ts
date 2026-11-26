const ENDPOINTS: Record<string, string> = {
  eu: 'https://eu.api.ovh.com/v1',
  ca: 'https://ca.api.ovh.com/v1',
  us: 'https://api.us.ovhcloud.com/v1',
};

export function apiBase(endpoint: string | undefined): string {
  const key = (endpoint ?? 'eu').toLowerCase();
  const base = ENDPOINTS[key];
  if (!base) throw new Error(`Unknown OVH_ENDPOINT "${endpoint}" (expected eu, ca or us)`);
  return base;
}

export async function getJson<T>(
  fetchFn: typeof fetch,
  url: string,
  timeoutMs = 15_000,
): Promise<T> {
  const res = await fetchFn(url, {
    headers: { accept: 'application/json', 'user-agent': 'vps-notifier' },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`GET ${url} -> HTTP ${res.status}`);
  return (await res.json()) as T;
}
