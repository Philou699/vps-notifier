# vps-notifier

Get a **Discord notification as soon as an OVHcloud VPS comes back in stock**, filtered by
**price** and **location**. Runs for free on **Cloudflare Workers** with a Cron Trigger: no server to
manage.

> 🇫🇷 **En bref** : un Worker Cloudflare interroge chaque minute l'API publique d'OVH et envoie un
> message Discord quand une offre VPS passe de « rupture » à « disponible », selon tes filtres de prix
> et de localisation. Voir l'installation ci-dessous.

- Checks every minute, using OVH's public API (no OVH account or API key needed)
- Notifies only on transitions **out of stock → available**, never twice for the same restock
- Filters: max price, datacenter, country, region, plan, minimum vCPU/RAM/disk, Linux/Windows,
  Local Zones
- Prices and specs refreshed daily from the OVH catalog
- Fits the Workers Free plan

## How it works

```
every minute ── for each VPS plan a filter could match:
                 GET /v1/vps/order/rule/datacenter?planCode=…  (stock per datacenter)
                 ├─ compare with the previous run (Workers KV)
                 └─ new in-stock offer matching a filter → Discord webhook

once a day ──── GET /v1/order/catalog/public/vps  → compact catalog (names, specs, prices) in KV
```

## Setup

You need a Cloudflare account (free plan is fine) and Node.js 22+.

```sh
git clone https://github.com/Philou699/vps-notifier.git && cd vps-notifier
npm install
npx wrangler login

# 1. Create the KV namespace, then paste the printed id into wrangler.toml
npx wrangler kv namespace create VPS_NOTIFIER

# 2. Discord: Server settings → Integrations → Webhooks → New webhook → Copy URL
npx wrangler secret put DISCORD_WEBHOOK_URL

# 3. Edit FILTERS (and OVH_SUBSIDIARY if needed) in wrangler.toml, then:
npm run deploy
```

The first run only records a baseline (otherwise you'd get a notification for everything that is
already in stock). Set `NOTIFY_ON_FIRST_RUN = "true"` if you want that initial list.

## Configuration

All variables live in `[vars]` in `wrangler.toml`, except the webhook which is a secret.

| Variable              | Default | Description                                                                     |
| --------------------- | ------- | ------------------------------------------------------------------------------- |
| `DISCORD_WEBHOOK_URL` | —       | Secret. Discord webhook URL. If unset, restocks are only logged.                |
| `FILTERS`             | `[]`    | JSON array of filters (below). Empty = notify for every restock.                |
| `OVH_SUBSIDIARY`      | `FR`    | OVH country store for prices/stock: `FR`, `DE`, `GB`, `ES`, `IT`, `PL`, `IE`, … |
| `OVH_ENDPOINT`        | `eu`    | OVH API: `eu`, `ca` (e.g. with `OVH_SUBSIDIARY=CA`) or `us`.                    |
| `PRICE_WITH_TAX`      | `false` | `true` to compare `maxPrice` against the price including VAT.                   |
| `NOTIFY_ON_FIRST_RUN` | `false` | `true` to notify for everything already in stock on the first run.              |

### Filters

An offer (= one plan in one datacenter) is notified if it matches **at least one** filter. Inside a
filter, all the given conditions must match. Every field is optional.

| Field               | Example                         | Meaning                                                 |
| ------------------- | ------------------------------- | ------------------------------------------------------- |
| `name`              | `"Cheap VPS in France"`         | Label shown in the notification                         |
| `maxPrice`          | `7`                             | Max monthly price, no commitment (excl. VAT by default) |
| `countries`         | `["FR", "DE"]`                  | ISO country codes of the datacenter                     |
| `regions`           | `["europe"]`                    | `europe`, `north-america`, `asia-pacific`               |
| `datacenters`       | `["GRA", "SBG", "EU-WEST-RBX"]` | Exact OVH datacenter codes (see below)                  |
| `plans`             | `["vps-2027-model1"]`           | Exact plan codes (see below)                            |
| `minVcpu`           | `4`                             | Minimum vCPU                                            |
| `minRamGb`          | `8`                             | Minimum RAM (GB)                                        |
| `minDiskGb`         | `75`                            | Minimum disk (GB)                                       |
| `os`                | `"linux"`                       | Stock to watch: `linux` (default), `windows`, `any`     |
| `includeLocalZones` | `false`                         | Exclude Local Zone plans (`.LZ`). Default: included     |

Example:

```toml
FILTERS = '''
[
  { "name": "Cheap VPS in France", "maxPrice": 7, "countries": ["FR"] },
  { "name": "Big VPS in Europe", "minRamGb": 24, "maxPrice": 25, "regions": ["europe"] }
]
'''
```

### Datacenters

| Code                | Location            | Code              | Location        |
| ------------------- | ------------------- | ----------------- | --------------- |
| `GRA`               | Gravelines, FR      | `BHS`             | Beauharnois, CA |
| `SBG`               | Strasbourg, FR      | `SGP`             | Singapore       |
| `EU-WEST-RBX`       | Roubaix, FR         | `SYD`             | Sydney, AU      |
| `DE`                | Frankfurt (Limburg) | `YNM`             | Mumbai, IN      |
| `UK`                | London (Erith)      | `EU-WEST-LZ-AMS`  | Amsterdam (LZ)  |
| `WAW`               | Warsaw, PL          | `EU-WEST-LZ-BRU`  | Brussels (LZ)   |
| `EU-SOUTH-MIL`      | Milan, IT           | `EU-WEST-LZ-MRS`  | Marseille (LZ)  |
| `EU-CENTRAL-LZ-PRG` | Prague (LZ)         | `EU-SOUTH-LZ-MAD` | Madrid (LZ)     |
| `EU-CENTRAL-LZ-SOF` | Sofia (LZ)          | `EU-WEST-LZ-VIE`  | Vienna (LZ)     |
| `EU-NORTH-LZ-STO`   | Stockholm (LZ)      | `EU-WEST-LZ-ZRH`  | Zurich (LZ)     |
| `EU-WEST-LZ-DLN`    | Dublin (LZ)         |                   |                 |

### Plans

Run `npm run catalog:update` to print the current list with prices. As of November 2026 (FR, excl.
VAT): `vps-2027-model1` (2 vCPU / 4 GB, 4.49 €) up to `vps-2025-model6` (24 vCPU / 96 GB,
72.99 €), plus Local Zone variants ending in `.LZ`.

## Status endpoint

The Worker also answers HTTP requests:

- `GET /` — catalog info and the offers currently in stock
- `GET /health` — `ok`

## Limits & notes

- Cloudflare's minimum cron interval is 1 minute. Each run makes at most one OVH request per watched
  plan (~13), well under the Workers subrequest limit.
- State is written to KV only when the stock changes, which keeps you under the free plan's
  1,000 writes/day.
- Parsing OVH's full catalog (~6 MB) may exceed the Free plan's CPU limit. If the daily refresh
  fails, the Worker keeps using the catalog snapshot bundled in `src/data/catalog.json` (refresh it
  with `npm run catalog:update` and redeploy). The snapshot is for `FR`; other subsidiaries rely on
  the daily refresh.
- This project is not affiliated with OVHcloud. It only reads public endpoints.

## Development

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE)
