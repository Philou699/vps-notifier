import type { Offer, StockStatus } from './types.ts';

export const STATE_KEY = 'state:v1';

export interface StoredStatus {
  linux: StockStatus;
  windows: StockStatus;
}

/** `"<planCode>@<DATACENTER>"` -> last seen stock. */
export type State = Record<string, StoredStatus>;

export const offerKey = (offer: Pick<Offer, 'datacenter'> & { plan: { planCode: string } }) =>
  `${offer.plan.planCode}@${offer.datacenter.toUpperCase()}`;

export async function loadState(kv: KVNamespace): Promise<State | null> {
  return kv.get<State>(STATE_KEY, 'json');
}

export async function saveState(kv: KVNamespace, state: State): Promise<void> {
  await kv.put(STATE_KEY, JSON.stringify(state));
}

/**
 * Builds the next state from what we just observed. Plans we could not fetch this
 * time keep their previous entries, so an API hiccup never looks like a restock.
 */
export function nextState(
  previous: State | null,
  offers: Offer[],
  fetchedPlans: Set<string>,
): State {
  const next: State = {};
  for (const [key, value] of Object.entries(previous ?? {})) {
    const planCode = key.slice(0, key.lastIndexOf('@'));
    if (!fetchedPlans.has(planCode)) next[key] = value;
  }
  for (const offer of offers) {
    next[offerKey(offer)] = { linux: offer.linux, windows: offer.windows };
  }
  return next;
}

export function stateChanged(a: State | null, b: State): boolean {
  if (!a) return true;
  const keysA = Object.keys(a);
  if (keysA.length !== Object.keys(b).length) return true;
  return keysA.some((k) => a[k]?.linux !== b[k]?.linux || a[k]?.windows !== b[k]?.windows);
}
