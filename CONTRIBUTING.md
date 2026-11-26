# Contributing

Thanks for helping! Issues and pull requests are welcome.

## Setup

```sh
npm install
cp .dev.vars.example .dev.vars   # optional: put a test Discord webhook in it
npm test
```

Before opening a PR, make sure `npm run typecheck && npm run lint && npm test` passes
(`npm run format` fixes formatting).

## Run locally

```sh
npm run dev
# in another terminal: trigger the stock check / catalog refresh
curl "http://localhost:8787/__scheduled?cron=*+*+*+*+*"
curl "http://localhost:8787/__scheduled?cron=17+4+*+*+*"
curl http://localhost:8787/
```

## Common contributions

- **New datacenter**: add it to `src/locations.ts` (city, country, region).
- **New OVH VPS range**: plans are picked by the regex in `src/ovh/catalog.ts`; adjust it if OVH
  changes its plan codes, then run `npm run catalog:update` to refresh the bundled snapshot.
- **New notification channel**: add a module next to `src/notify/discord.ts` and call it from
  `src/check.ts`.
