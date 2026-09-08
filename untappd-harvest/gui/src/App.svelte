<script lang="ts">
	import { onMount } from 'svelte';

	type StoreOption = { id: string; name: string };
	type CachedStore = { id: string; name: string | null; fetchedAt: string; count?: number };
	type Item = {
		key: string;
		untappd_id: string | null;
		vmp_id: string | null;
		name: string;
		brewery: string | null;
		style: string | null;
		category: string | null;
		sub_category: string | null;
		price: number | null;
		abv: number | null;
		rating: number | null;
		num_ratings: number | null;
		your_rating: number | null;
		tried: boolean;
		wished: boolean;
		vmp_url: string | null;
		untappd_url: string | null;
		picture_url: string | null;
		stock: Record<string, number>;
	};
	type Inventory = {
		triedAvailable: boolean;
		wishlistAvailable: boolean;
		stores: CachedStore[];
		items: Item[];
	};
	type SyncResult = { storeId: string; ok: boolean; count?: number; fetchedAt?: string; error?: string };
	type SortKey = 'name' | 'rating' | 'your_rating' | 'price' | 'abv' | 'total';

	const DEFAULT_STORES = ['161', '393'];

	function loadPref<T>(key: string, fallback: T): T {
		try {
			const raw = localStorage.getItem(`beergui.${key}`);
			return raw === null ? fallback : (JSON.parse(raw) as T);
		} catch {
			return fallback;
		}
	}
	function savePref(key: string, value: unknown): void {
		try {
			localStorage.setItem(`beergui.${key}`, JSON.stringify(value));
		} catch {
			// storage may be unavailable (private mode); preferences are optional
		}
	}

	let allStores = $state<StoreOption[]>([]);
	let inventory = $state<Inventory | null>(null);
	let selected = $state<string[]>(loadPref('stores', DEFAULT_STORES));
	let hideTried = $state<boolean>(loadPref('hideTried', true));
	let category = $state('All');
	let subCategory = $state('');
	let abvMin = $state(0);
	let abvMax = $state(20);
	let priceMin = $state('');
	let priceMax = $state('');
	let query = $state('');
	let sortKey = $state<SortKey>('rating');
	let sortDir = $state(-1);
	let storeQuery = $state('');
	let syncing = $state(false);
	let loading = $state(true);
	let syncErrors = $state<string[]>([]);
	let lastSync = $state<Record<string, SyncResult>>({});

	$effect(() => savePref('stores', selected));
	$effect(() => savePref('hideTried', hideTried));

	const items = $derived(inventory?.items ?? []);
	const cachedStores = $derived(inventory?.stores ?? []);

	const knownStores = $derived.by(() => {
		const map = new Map<string, StoreOption>();
		for (const s of cachedStores) map.set(s.id, { id: s.id, name: s.name ?? s.id });
		for (const s of allStores) if (!map.has(s.id)) map.set(s.id, s);
		return map;
	});

	const storeOptions = $derived.by(() => {
		const q = storeQuery.trim().toLowerCase();
		let list = [...knownStores.values()];
		if (q) list = list.filter((s) => s.name.toLowerCase().includes(q) || s.id.includes(q));
		list.sort((a, b) => a.name.localeCompare(b.name));
		return list.slice(0, 20);
	});

	// One column per selected store that actually has cached stock.
	const selectedColumns = $derived(selected.filter((id) => cachedStores.some((s) => s.id === id)));

	const inSelected = $derived(items.filter((it) => selected.some((id) => (it.stock[id] ?? 0) > 0)));

	const categories = $derived.by(() => {
		const set = new Set<string>();
		for (const it of inSelected) if (it.category) set.add(it.category);
		return ['All', ...[...set].sort((a, b) => a.localeCompare(b))];
	});

	const subCategories = $derived.by(() => {
		const set = new Set<string>();
		for (const it of inSelected) {
			if (category !== 'All' && it.category !== category) continue;
			if (it.sub_category) set.add(it.sub_category);
		}
		return ['', ...[...set].sort((a, b) => a.localeCompare(b))];
	});

	// Reset orphaned filter values when the underlying data changes.
	$effect(() => {
		if (category !== 'All' && !categories.includes(category)) category = 'All';
	});
	$effect(() => {
		if (subCategory && !subCategories.includes(subCategory)) subCategory = '';
	});

	const triedHiddenCount = $derived(inSelected.filter((it) => it.tried).length);

	function totalStock(it: Item): number {
		let sum = 0;
		for (const id of selected) sum += it.stock[id] ?? 0;
		return sum;
	}

	function ratingColor(r: number): string {
		const hue = Math.max(0, Math.min(120, (r - 2.5) * 48));
		return `hsl(${hue}, 70%, 55%)`;
	}

	function fmtDate(iso: string): string {
		try {
			return new Date(iso).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' });
		} catch {
			return iso;
		}
	}

	function shortName(n: string): string {
		const head = n.split(/[—–]|,\s/)[0].trim();
		return (head || n).slice(0, 14);
	}

	function setSort(key: SortKey): void {
		if (sortKey === key) {
			sortDir = -sortDir;
		} else {
			sortKey = key;
			sortDir = key === 'name' ? 1 : -1;
		}
	}

	function sortIndicator(key: SortKey): string {
		return sortKey === key ? (sortDir === -1 ? ' ↓' : ' ↑') : '';
	}

	const visibleItems = $derived.by(() => {
		const q = query.trim().toLowerCase();
		const pMin = priceMin === '' || priceMin === null ? null : Number(priceMin);
		const pMax = priceMax === '' || priceMax === null ? null : Number(priceMax);
		const list = inSelected.filter((it) => {
			if (hideTried && it.tried) return false;
			if (category !== 'All' && it.category !== category) return false;
			if (subCategory && it.sub_category !== subCategory) return false;
			if (it.abv != null && (it.abv < abvMin || it.abv > abvMax)) return false;
			if (pMin != null && (it.price ?? 0) < pMin) return false;
			if (pMax != null && (it.price ?? Infinity) > pMax) return false;
			if (q) {
				const hay = `${it.name} ${it.brewery ?? ''}`.toLowerCase();
				if (!hay.includes(q)) return false;
			}
			return true;
		});
		const missing = (it: Item): boolean => {
			switch (sortKey) {
				case 'rating':
					return it.rating == null;
				case 'your_rating':
					return it.your_rating == null;
				case 'price':
					return it.price == null;
				case 'abv':
					return it.abv == null;
				default:
					return false;
			}
		};
		const value = (it: Item): number | string => {
			switch (sortKey) {
				case 'name':
					return it.name.toLowerCase();
				case 'rating':
					return it.rating ?? 0;
				case 'your_rating':
					return it.your_rating ?? 0;
				case 'price':
					return it.price ?? 0;
				case 'abv':
					return it.abv ?? 0;
				case 'total':
					return totalStock(it);
			}
		};
		list.sort((a, b) => {
			const am = missing(a);
			const bm = missing(b);
			if (am !== bm) return am ? 1 : -1;
			const va = value(a);
			const vb = value(b);
			const cmp = typeof va === 'string' ? va.localeCompare(vb as string) : (va as number) - (vb as number);
			return cmp * sortDir;
		});
		return list;
	});

	async function refresh(): Promise<void> {
		const [storesRes, invRes] = await Promise.all([fetch('/api/stores'), fetch('/api/inventory')]);
		if (storesRes.ok) {
			const data = await storesRes.json();
			allStores = data.stores ?? [];
		}
		if (invRes.ok) inventory = await invRes.json();
	}

	async function sync(): Promise<void> {
		if (syncing || !selected.length) return;
		syncing = true;
		syncErrors = [];
		try {
			const res = await fetch('/api/sync', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ storeIds: selected })
			});
			const data = (await res.json()) as { results?: SyncResult[] };
			const results = data.results ?? [];
			const map: Record<string, SyncResult> = {};
			for (const r of results) map[r.storeId] = r;
			lastSync = map;
			syncErrors = results.filter((r) => !r.ok).map((r) => `Store ${r.storeId}: ${r.error ?? 'sync failed'}`);
			await refresh();
		} catch (e) {
			syncErrors = [e instanceof Error ? e.message : String(e)];
		} finally {
			syncing = false;
		}
	}

	function toggleStore(id: string): void {
		selected = selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id];
	}

	function addStore(id: string): void {
		if (!selected.includes(id)) selected = [...selected, id];
		storeQuery = '';
	}

	onMount(async () => {
		await refresh();
		loading = false;
		if (!inventory || inventory.stores.length === 0) await sync();
	});
</script>

<div class="app">
	<header class="top">
		<h1>Beer GUI <span class="sub">Winmonopolet × Untappd</span></h1>
		<button class="primary" onclick={() => sync()} disabled={syncing || !selected.length}>
			{syncing ? 'Syncing…' : 'Sync now'}
		</button>
	</header>

	{#if syncErrors.length}
		<div class="banner error">
			<strong>Sync failed</strong> — showing cached data.
			<ul>
				{#each syncErrors as e (e)}
					<li>{e}</li>
				{/each}
			</ul>
		</div>
	{/if}
	{#if inventory && !inventory.triedAvailable}
		<div class="banner warn">
			untappd-beers.json not found next to the gui/ folder — "tried" features disabled. Re-run the Untappd harvest.
		</div>
	{/if}

	<section class="panel stores">
		<div class="store-picker">
			<input type="search" placeholder="Add store… (name or id)" bind:value={storeQuery} aria-label="Add store" />
			{#if storeQuery.trim()}
				<ul class="suggestions">
					{#each storeOptions as s (s.id)}
						<li>
							<button class="suggestion" onclick={() => addStore(s.id)}>
								{s.name} <span class="sid">({s.id})</span>
							</button>
						</li>
					{/each}
					{#if !storeOptions.length}
						<li class="none">No matches</li>
					{/if}
				</ul>
			{/if}
		</div>
		<div class="chips">
			{#each selected as id (id)}
				{@const info = knownStores.get(id)}
				{@const cached = cachedStores.find((s) => s.id === id)}
				{@const res = lastSync[id]}
				<span
					class="chip"
					class:dead={!cached && !res}
					class:err={res && !res.ok}
					title={cached
						? `${info?.name ?? id} — synced ${fmtDate(cached.fetchedAt)}`
						: res && !res.ok
							? `${info?.name ?? id} — sync failed: ${res.error}`
							: `${info?.name ?? id} — not synced yet`}
				>
					{info?.name ?? id}
					<button class="x" onclick={() => toggleStore(id)} aria-label={`Remove ${info?.name ?? id}`}>✕</button>
				</span>
			{/each}
			{#if !selected.length}
				<span class="hint">No stores selected — search above to add your favorites.</span>
			{/if}
		</div>
		<div class="store-status">
			{#each selectedColumns as id (id)}
				{@const info = knownStores.get(id)}
				{@const cached = cachedStores.find((s) => s.id === id)}
				<span>
					{info?.name ?? id}:
					{cached ? `synced ${fmtDate(cached.fetchedAt)} · ${cached.count ?? '?'} items` : 'not synced yet'}
				</span>
			{/each}
		</div>
	</section>

	<section class="panel filters">
		<label class="toggle">
			<input type="checkbox" bind:checked={hideTried} />
			Hide beers I've had
		</label>
		<div class="fgroup">
			{#each categories as c (c)}
				<button class="cat" class:on={c === category} onclick={() => (category = c)}>{c}</button>
			{/each}
		</div>
		<div class="fgroup">
			<label>
				Style
				<select bind:value={subCategory}>
					{#each subCategories as sc (sc)}
						<option value={sc}>{sc === '' ? 'All styles' : sc}</option>
					{/each}
				</select>
			</label>
		</div>
		<div class="fgroup">
			<label>
				ABV {abvMin}–{abvMax}%
				<span class="presets">
					<button class="preset" onclick={() => { abvMin = 8; abvMax = 20; }}>≥ 8%</button>
					<button class="preset" onclick={() => { abvMin = 0; abvMax = 20; }}>reset</button>
				</span>
			</label>
			<div class="range">
				<input
					type="range"
					min="0"
					max="20"
					step="0.5"
					value={abvMin}
					oninput={(e) => (abvMin = Math.min(Number(e.currentTarget.value), abvMax))}
					aria-label="Minimum ABV"
				/>
				<input
					type="range"
					min="0"
					max="20"
					step="0.5"
					value={abvMax}
					oninput={(e) => (abvMax = Math.max(Number(e.currentTarget.value), abvMin))}
					aria-label="Maximum ABV"
				/>
			</div>
		</div>
		<div class="fgroup">
			<label>
				Price (NOK)
				<input type="number" min="0" placeholder="min" bind:value={priceMin} />
				<span>–</span>
				<input type="number" min="0" placeholder="max" bind:value={priceMax} />
			</label>
		</div>
		<div class="fgroup grow">
			<label>
				Search
				<input type="search" placeholder="name or brewery…" bind:value={query} />
			</label>
		</div>
		<div class="count">
			{visibleItems.length} of {inSelected.length} beers
			{#if hideTried && triedHiddenCount}· {triedHiddenCount} tried hidden{/if}
			{#if inventory?.wishlistAvailable}· wishlist joined{/if}
		</div>
	</section>

	<section class="panel table-wrap">
		<table>
			<thead>
				<tr>
					<th class="img"></th>
					<th class="name">
						<button class="sort" onclick={() => setSort('name')}>Beer{sortIndicator('name')}</button>
					</th>
					<th>
						<button class="sort" onclick={() => setSort('rating')}>Rating{sortIndicator('rating')}</button>
					</th>
					<th>
						<button class="sort" onclick={() => setSort('your_rating')}>Yours{sortIndicator('your_rating')}</button>
					</th>
					<th>
						<button class="sort" onclick={() => setSort('abv')}>ABV{sortIndicator('abv')}</button>
					</th>
					<th>
						<button class="sort" onclick={() => setSort('price')}>Price{sortIndicator('price')}</button>
					</th>
					{#each selectedColumns as id (id)}
						<th class="num" title={knownStores.get(id)?.name ?? id}>
							{shortName(knownStores.get(id)?.name ?? id)}
						</th>
					{/each}
					<th>
						<button class="sort" onclick={() => setSort('total')} title="Total stock in selected stores">Σ{sortIndicator('total')}</button>
					</th>
					<th></th>
				</tr>
			</thead>
			<tbody>
				{#each visibleItems as it (it.key)}
					<tr class:tried={it.tried}>
						<td class="img">
							{#if it.picture_url}
								<img src={it.picture_url} alt="" loading="lazy" />
							{/if}
						</td>
						<td class="name">
							<div class="beername">
								{it.name}
								{#if it.wished}<span class="wish" title="On your Untappd wishlist">♥</span>{/if}
							</div>
							{#if it.brewery}<div class="brewery">{it.brewery}</div>{/if}
							{#if it.style || it.sub_category}
								<div class="style">{it.style ?? it.sub_category}</div>
							{/if}
						</td>
						<td>
							{#if it.rating != null}
								<span class="rating" style:color={ratingColor(it.rating)}>{it.rating.toFixed(2)}</span>
								<span class="ratings-n">({it.num_ratings ?? 0})</span>
							{:else}
								<span class="dim">–</span>
							{/if}
						</td>
						<td>
							{#if it.your_rating != null}
								<span class="yours">{it.your_rating.toFixed(2)}</span>
							{:else if it.tried}
								<span class="yours dim" title="In your checkins, unrated">✓</span>
							{:else}
								<span class="dim">–</span>
							{/if}
						</td>
						<td>{it.abv != null ? `${it.abv.toFixed(1)}%` : '–'}</td>
						<td>{it.price != null ? `${it.price} kr` : '–'}</td>
						{#each selectedColumns as id (id)}
							<td class="num" class:zero={!(it.stock[id] ?? 0)}>{it.stock[id] ?? 0}</td>
						{/each}
						<td class="num">{totalStock(it)}</td>
						<td class="links">
							{#if it.untappd_url}
								<a class="lnk" href={it.untappd_url} target="_blank" rel="noreferrer" title="Untappd">U↗</a>
							{/if}
							{#if it.vmp_url}
								<a class="lnk" href={it.vmp_url} target="_blank" rel="noreferrer" title="Vinmonopolet">V↗</a>
							{/if}
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
		{#if loading}
			<div class="empty">Loading…</div>
		{:else if !visibleItems.length}
			<div class="empty">
				{#if !inSelected.length}
					No stock cached for the selected stores — hit "Sync now".
				{:else}
					No beers match the current filters.
				{/if}
			</div>
		{/if}
	</section>
</div>
