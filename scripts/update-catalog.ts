// Regenerates src/data/catalog.json, the fallback catalog bundled in the Worker
// (used until the daily cron has stored a fresh one in KV).
// Usage: npm run catalog:update [-- <SUBSIDIARY>]
import { writeFile } from 'node:fs/promises';
import { apiBase } from '../src/ovh/api.ts';
import { fetchCatalog } from '../src/ovh/catalog.ts';

const subsidiary = (process.argv[2] ?? 'FR').toUpperCase();
const catalog = await fetchCatalog(fetch, apiBase('eu'), subsidiary);
const out = new URL('../src/data/catalog.json', import.meta.url);
await writeFile(out, JSON.stringify(catalog, null, 2) + '\n');
console.log(`Wrote ${catalog.plans.length} plans (${subsidiary}) to ${out.pathname}`);
for (const p of catalog.plans) {
  console.log(
    `  ${p.planCode.padEnd(22)} ${String(p.price).padStart(7)} ${catalog.currency}  ${p.description}`,
  );
}
