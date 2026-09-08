import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseDevalue } from 'devalue';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE = 'https://winmonopolet.no';
const DATA_DIR = path.join(__dirname, 'data');
const HARVEST_DIR = path.join(__dirname, '..');
const STORES_CACHE = path.join(DATA_DIR, 'stores.json');
const STORES_TTL_MS = 24 * 60 * 60 * 1000;
const PROBE_STORE_ID = '161';

// Used only when winmonopolet.no is unreachable and no cache exists.
const FALLBACK_STORES = [
	{ id: '161', name: 'Oslo, Storo' },
	{ id: '393', name: 'Oslo, Skøyen' }
];

function readJsonSafe(file) {
	try {
		return JSON.parse(fs.readFileSync(file, 'utf8'));
	} catch {
		return null;
	}
}

function findNode(payload, key) {
	return payload?.nodes?.find(
		(n) => Array.isArray(n.data) && n.data.some((v) => v && typeof v === 'object' && !Array.isArray(v) && key in v)
	);
}

function hydrateNodeData(node) {
	return parseDevalue(JSON.stringify(node.data));
}

async function fetchStorePayload(storeId) {
	const res = await fetch(`${BASE}/butikk/${storeId}/__data.json`, {
		headers: { accept: 'application/json' }
	});
	if (!res.ok) throw new Error(`HTTP ${res.status} from winmonopolet.no`);
	return res.json();
}

function extractStores(payload) {
	const node = findNode(payload, 'stores');
	if (!node) return [];
	const data = hydrateNodeData(node);
	return (data.stores ?? [])
		.map((s) => ({ id: String(s.store_id), name: s.name || s.formatted_name || s.store_id }))
		.filter((s) => s.id);
}

function saveStoresCache(stores) {
	fs.mkdirSync(DATA_DIR, { recursive: true });
	fs.writeFileSync(STORES_CACHE, JSON.stringify({ fetchedAt: new Date().toISOString(), stores }, null, 2));
}

export async function getStores() {
	const cached = readJsonSafe(STORES_CACHE);
	if (cached?.stores?.length && Date.now() - Date.parse(cached.fetchedAt) < STORES_TTL_MS) {
		return { stores: cached.stores, fetchedAt: cached.fetchedAt, source: 'cache' };
	}
	try {
		const stores = extractStores(await fetchStorePayload(PROBE_STORE_ID));
		if (!stores.length) throw new Error('empty store list in __data.json');
		const fetchedAt = new Date().toISOString();
		saveStoresCache(stores);
		return { stores, fetchedAt, source: 'live' };
	} catch (err) {
		if (cached?.stores?.length) {
			return { stores: cached.stores, fetchedAt: cached.fetchedAt, source: 'cache-stale' };
		}
		return { stores: FALLBACK_STORES, fetchedAt: null, source: 'fallback', error: String(err?.message || err) };
	}
}

function extractStock(payload) {
	const node = findNode(payload, 'stock');
	if (!node) throw new Error('stock node not found in __data.json (upstream shape changed?)');
	const stock = hydrateNodeData(node).stock;
	if (!Array.isArray(stock)) throw new Error('stock is not an array (upstream shape changed?)');
	const bad = stock.some(
		(s) => !s || typeof s !== 'object' || !s.product || typeof s.product !== 'object' || !('stock_level' in s)
	);
	if (bad) throw new Error('stock items missing product/stock_level fields (upstream shape changed?)');
	return stock;
}

export async function syncStores(body) {
	const ids = [...new Set((Array.isArray(body?.storeIds) ? body.storeIds : []).map(String))].filter((id) =>
		/^\d+$/.test(id)
	);
	const results = [];
	for (const storeId of ids) {
		try {
			const payload = await fetchStorePayload(storeId);
			const stock = extractStock(payload);
			const fetchedAt = new Date().toISOString();
			fs.mkdirSync(DATA_DIR, { recursive: true });
			fs.writeFileSync(path.join(DATA_DIR, `stock-${storeId}.json`), JSON.stringify({ storeId, fetchedAt, stock }));
			const stores = extractStores(payload);
			if (stores.length) saveStoresCache(stores);
			results.push({ storeId, ok: true, count: stock.length, fetchedAt });
		} catch (err) {
			results.push({ storeId, ok: false, error: String(err?.message || err) });
		}
	}
	return { results };
}

function normalizeUrl(u) {
	if (!u) return null;
	const s = String(u);
	if (s.startsWith('//')) return `https:${s}`;
	if (s.startsWith('/')) return `https://www.vinmonopolet.no${s}`;
	return s;
}

export function getInventory() {
	const beers = readJsonSafe(path.join(HARVEST_DIR, 'untappd-beers.json')) ?? [];
	const wishlist = readJsonSafe(path.join(HARVEST_DIR, 'untappd-wishlist.json')) ?? [];
	const tried = new Map(beers.map((b) => [String(b.bid), b]));
	const wished = new Map(wishlist.map((b) => [String(b.bid), b]));
	const storeNames = new Map((readJsonSafe(STORES_CACHE)?.stores ?? []).map((s) => [String(s.id), s.name]));

	const items = new Map();
	const stores = new Map();
	let files = [];
	try {
		files = fs.readdirSync(DATA_DIR);
	} catch {
		// no cache yet
	}
	for (const file of files) {
		if (!/^stock-\d+\.json$/.test(file)) continue;
		const cached = readJsonSafe(path.join(DATA_DIR, file));
		if (!cached || !Array.isArray(cached.stock)) continue;
		const storeId = String(cached.storeId);
		stores.set(storeId, {
			id: storeId,
			name: storeNames.get(storeId) ?? null,
			fetchedAt: cached.fetchedAt,
			count: cached.stock.length
		});
		for (const s of cached.stock) {
			const p = s?.product ?? {};
			const u = p.untappd ?? null;
			const key = u?.untappd_id ? String(u.untappd_id) : `vmp:${p.vmp_id}`;
			let item = items.get(key);
			if (!item) {
				const t = u ? tried.get(String(u.untappd_id)) : undefined;
				item = {
					key,
					untappd_id: u ? String(u.untappd_id) : null,
					vmp_id: p.vmp_id ?? null,
					name: u?.untappd_name ?? p.vmp_name ?? '',
					brewery: u?.brewery ?? null,
					style: u?.style ?? null,
					category: p.category ?? null,
					sub_category: p.sub_category ?? null,
					price: p.price ?? null,
					abv: u?.abv ?? null,
					rating: u?.rating ?? null,
					num_ratings: u?.num_ratings ?? null,
					your_rating: t?.yourRating ?? null,
					tried: Boolean(t),
					wished: u ? wished.has(String(u.untappd_id)) : false,
					vmp_url: normalizeUrl(p.vmp_url),
					untappd_url: u?.untappd_url ?? null,
					picture_url: u?.picture_url ?? null,
					stock: {}
				};
				items.set(key, item);
			}
			item.stock[storeId] = s.stock_level ?? 0;
		}
	}
	return {
		triedAvailable: beers.length > 0,
		wishlistAvailable: wishlist.length > 0,
		stores: [...stores.values()],
		items: [...items.values()]
	};
}

function send(res, status, body) {
	res.statusCode = status;
	res.setHeader('content-type', 'application/json; charset=utf-8');
	res.end(JSON.stringify(body));
}

function readBody(req) {
	return new Promise((resolve, reject) => {
		let raw = '';
		req.on('data', (chunk) => {
			raw += chunk;
			if (raw.length > 1e6) {
				reject(new Error('request body too large'));
				req.destroy();
			}
		});
		req.on('end', () => {
			if (!raw) return resolve({});
			try {
				resolve(JSON.parse(raw));
			} catch {
				reject(new Error('invalid JSON body'));
			}
		});
		req.on('error', reject);
	});
}

// Plain node-http handler; mounted at '/api' by both the Vite dev middleware and express.
export async function handleApi(req, res) {
	let route = '/';
	try {
		route = new URL(req.url, 'http://localhost').pathname.replace(/\/+$/, '') || '/';
	} catch {
		// keep '/'
	}
	try {
		if (req.method === 'GET' && route === '/stores') return send(res, 200, await getStores());
		if (req.method === 'GET' && route === '/inventory') return send(res, 200, getInventory());
		if (req.method === 'POST' && route === '/sync') {
			let body;
			try {
				body = await readBody(req);
			} catch (err) {
				return send(res, 400, { error: String(err?.message || err) });
			}
			return send(res, 200, await syncStores(body));
		}
		return send(res, 404, { error: `no such API route: ${req.method} ${route}` });
	} catch (err) {
		return send(res, 500, { error: String(err?.message || err) });
	}
}
