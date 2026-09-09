# untappd-harvest

Personal tooling that joins your Untappd check-in history with live Vinmonopolet
store stock. Two pieces:

| Path | What it does |
| --- | --- |
| `harvest-untappd.mjs` | Playwright scraper → `untappd-beers.json` / `untappd-wishlist.json` |
| `gui/` | Local web app (Vite + Svelte) with filters/sorting — see `gui/README.md` |

## Setup

```sh
npm install
```

(`playwright-core` is used with your installed Chrome — no browser download needed.
For the GUI, also run `npm install` inside `gui/`.)

## 1. Harvest your Untappd data

```sh
node harvest-untappd.mjs
```

- Opens a visible Chrome window (profile persisted in `chrome-profile/`).
- **Log in and solve any captcha in that window** — the script waits patiently,
  it will not refresh under you (up to 15 min per list).
- Your username is auto-detected from the logged-in profile on `untappd.com/home`;
  override with `UNTAPPD_USER`. If detection fails you are prompted to type it.
- Scrolls the list via "Show More" (~1 request/sec) and writes:
  - `untappd-beers.json` — beers you've had (with your ratings)
  - `untappd-wishlist.json` — your wishlist
- Existing output files are skipped; delete one to re-harvest just that list.

Options via env:

```sh
UNTAPPD_USER=otheruser LISTS=beers node harvest-untappd.mjs   # UNTAPPD_USER optional; LISTS defaults: beers,wishlist
```

## 2. Winmonopolet Personal — web UI (build & run)

```sh
cd gui
npm install
npm run dev      # dev server with API middleware, opens browser
npm start        # production: vite build + express serving dist/ and /api, opens browser
```

The GUI fetches stock server-side from `winmonopolet.no/butikk/{id}/__data.json`,
caches it in `gui/data/`, and joins with the harvested JSONs above. Full details
in `gui/README.md`.

## Notes

- Harvested JSONs (`untappd-beers.json`, `untappd-wishlist.json`), `chrome-profile/`,
  and `gui/data/` are gitignored runtime data — never committed.
- The GUI degrades gracefully if `untappd-wishlist.json` is missing.
