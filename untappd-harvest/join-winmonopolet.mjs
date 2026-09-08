import fs from 'node:fs';
import { parse as parseDevalue } from 'devalue';

const BASE = 'https://winmonopolet.no';
const STORES = process.argv.slice(2).length ? process.argv.slice(2) : ['161', '393'];
const TOP = 15;

const loadJSON = (f) => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f)) : []);

const beers = loadJSON('untappd-beers.json');
const wishlist = loadJSON('untappd-wishlist.json');
const tried = new Map(beers.map((b) => [b.bid, b]));
const wished = new Map(wishlist.map((b) => [b.bid, b]));

async function getStock(storeId) {
  const res = await fetch(`${BASE}/butikk/${storeId}/__data.json`);
  if (!res.ok) throw new Error(`${storeId}: HTTP ${res.status}`);
  const payload = await res.json();
  const node = payload.nodes.find((n) =>
    n.data?.some((v) => v && typeof v === 'object' && !Array.isArray(v) && 'stock' in v)
  );
  const data = parseDevalue(JSON.stringify(node.data));
  return data.stock;
}

const fmt = (s) =>
  [
    `${s.product.untappd.rating.toFixed(2).padStart(5)}★`,
    `${String(s.stock_level).padStart(3)}x`,
    s.product.untappd.brewery.slice(0, 22).padEnd(22),
    s.product.untappd.untappd_name.slice(0, 42).padEnd(42),
    `${s.product.untappd.abv}%`
  ].join(' ');

for (const storeId of STORES) {
  const stock = await getStock(storeId);
  const matched = stock.filter((s) => s.product.untappd);
  const isTried = (s) => tried.has(s.product.untappd.untappd_id);
  const isWished = (s) => wished.has(s.product.untappd.untappd_id);

  const triedItems = matched.filter(isTried);
  const wishedInStock = matched.filter(isWished);
  const newToMe = matched
    .filter((s) => !isTried(s))
    .sort((a, b) => b.product.untappd.rating - a.product.untappd.rating);

  console.log(`\n=== Store ${storeId} — ${stock.length} products (${matched.length} w/ Untappd) ===`);
  console.log(`Tried already: ${triedItems.length} | Wishlist in stock: ${wishedInStock.length} | New to you: ${newToMe.length}`);

  if (wishedInStock.length) {
    console.log(`\n-- Wishlist in stock NOW (${wishedInStock.length}) --`);
    for (const s of wishedInStock) console.log('  ' + fmt(s));
  }

  console.log(`\n-- Top ${TOP} new-to-you by rating --`);
  newToMe.slice(0, TOP).forEach((s, i) => console.log(`  ${String(i + 1).padStart(2)}. ` + fmt(s)));

  fs.writeFileSync(
    `joined-store-${storeId}.json`,
    JSON.stringify(
      {
        storeId,
        fetchedAt: new Date().toISOString(),
        tried: triedItems.map((s) => ({ ...s, my: tried.get(s.product.untappd.untappd_id) })),
        wishlistInStock: wishedInStock,
        newToMeSortedByRating: newToMe
      },
      null,
      2
    )
  );
}
