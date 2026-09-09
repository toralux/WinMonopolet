# untappd-harvest

Personal tooling that harvests your Untappd check-in history and produces the
JSON the Winmonopolet webapp can import.

| Path | What it does |
| --- | --- |
| `harvest-untappd.mjs` | Playwright scraper → `untappd-beers.json` / `untappd-wishlist.json` |

## Setup

```sh
npm install
```

(`playwright-core` is used with your installed Chrome — no browser download
needed.)

## 1. Harvest your Untappd data

```sh
node harvest-untappd.mjs
```

- Opens a visible Chrome window (profile persisted in `chrome-profile/`).
- **Log in and solve any captcha in that window** — the script waits patiently,
  it will not refresh under you (up to 15 min per list).
- Your username is auto-detected from the logged-in profile on
  `untappd.com/home`; override with `UNTAPPD_USER`. If detection fails you are
  prompted to type it.
- Scrolls the list via "Show More" (~1 request/sec) and writes:
  - `untappd-beers.json` — beers you've had (with your ratings)
  - `untappd-wishlist.json` — your wishlist
- Existing output files are skipped; delete one to re-harvest just that list.

Options via env:

```sh
UNTAPPD_USER=otheruser LISTS=beers node harvest-untappd.mjs   # UNTAPPD_USER optional; LISTS defaults: beers,wishlist
```

## 2. Import into the Winmonopolet webapp

Open the webapp's filter panel, expand **Mine øl** and import
`untappd-beers.json` ("Importer Untappd-øl (JSON)"). Beers you have had get a
checkmark on their product cards and can be hidden with the "Skjul innsjekket"
filter on store pages and `/topp-rangert`. The import lives in your browser's
localStorage — no data is sent to the backend.

## Notes

- Harvested JSONs (`untappd-beers.json`, `untappd-wishlist.json`) and
  `chrome-profile/` are gitignored runtime data — never committed.
- The webapp import degrades gracefully if `untappd-wishlist.json` is missing
  (only `untappd-beers.json` is used).
