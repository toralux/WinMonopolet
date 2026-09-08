# Beer GUI

Local web app that joins live Vinmonopolet store stock with your harvested Untappd
check-in history, so you can browse what's in stock and spot beers you haven't tried.

Standalone package — does not touch the repo's `frontend/` or `backend/`.

## Run

```sh
npm install
npm run dev    # Vite dev server with API middleware, opens your browser
```

Production one-shot:

```sh
npm start      # vite build + express serving dist/ and /api, opens your browser
```

## How it works

- Stock is fetched server-side from `https://winmonopolet.no/butikk/{storeId}/__data.json`
  (SvelteKit devalue payload; hydrated with `devalue`) — one request per store per
  "Sync now" click, cached to `gui/data/stock-{id}.json`.
- The tried set comes from `../untappd-beers.json` (see `harvest-untappd.mjs`);
  the join key is `untappd_id ↔ bid`. Wishlist (`../untappd-wishlist.json`) is joined
  when present and silently skipped when not.
- API (`api.mjs`, shared by dev middleware and express):
  - `GET /api/stores` — all store ids/names (from the layout node, cached 24 h,
    hardcoded fallback with Oslo Storo/Skøyen if the site is unreachable)
  - `POST /api/sync` `{ storeIds: string[] }` — refresh stock cache per store
  - `GET /api/inventory` — merged stock across cached stores joined with your data
- UI: store picker (search by name/id, selection persisted in localStorage),
  "Hide beers I've had" toggle (default on; tried rows get an amber tint when shown),
  category chips, style dropdown, dual-thumb ABV slider (with a ≥ 8 % preset),
  price range, free-text search, sortable columns (null ratings sort last).

`gui/data/` is a runtime cache and is gitignored.
