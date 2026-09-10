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
- By default only the beers list is harvested; pass `--both` to also harvest
  the wishlist, or `--wishlist-only` for just the wishlist.
- If `untappd-beers.json` already exists, reruns are **incremental**: paging
  stops as soon as it reaches beers already in the file, and the new beers
  are merged into the existing file. Pass `--full` to force a complete
  re-scrape instead. The wishlist has no paging, so it's simply skipped if
  its file exists (again, `--full` forces a re-harvest).

### Options

| Flag | Effect |
| --- | --- |
| `--full` | Ignore/replace existing output files; do a complete re-scrape. |
| `--both` | Harvest beers and wishlist (default is beers only). |
| `--wishlist-only` | Harvest only the wishlist. |

`--wishlist-only` and `--both` are mutually exclusive.

```sh
node harvest-untappd.mjs                    # incremental beers only (default)
node harvest-untappd.mjs --both             # incremental beers + wishlist (wishlist skipped if it exists)
node harvest-untappd.mjs --full             # full re-harvest of beers only
node harvest-untappd.mjs --full --both      # full re-harvest of both lists
node harvest-untappd.mjs --wishlist-only    # only (re)harvest the wishlist
UNTAPPD_USER=otheruser node harvest-untappd.mjs   # override username detection
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
