import { chromium } from 'playwright-core';
import fs from 'node:fs';

const USER = process.env.UNTAPPD_USER ?? 'Toralux';
const LISTS = (process.env.LISTS ?? 'beers,wishlist').split(',');
const PROFILE_DIR = new URL('./chrome-profile', import.meta.url).pathname;
const BASE = 'https://untappd.com';

const ctx = await chromium.launchPersistentContext(PROFILE_DIR, {
  channel: 'chrome',
  headless: false,
  viewport: { width: 1366, height: 900 },
  args: ['--disable-blink-features=AutomationControlled'],
});

const page = ctx.pages()[0] ?? (await ctx.newPage());

const extract = () =>
  page.$$eval('.beer-item', (els) =>
    els.map((el) => {
      const blocks = [...el.querySelectorAll('.ratings .you')];
      const yours = blocks.find((b) => b.querySelector('p')?.textContent.startsWith('You Rating'));
      const global = blocks.find((b) => b.querySelector('p')?.textContent.startsWith('Global Rating'));
      return {
        bid: el.dataset.bid,
        name: el.querySelector('.beer-details .name')?.textContent.trim() ?? null,
        brewery: el.querySelector('.beer-details .brewery')?.textContent.trim() ?? null,
        style: el.querySelector('.beer-details .style')?.textContent.trim() ?? null,
        yourRating: yours ? parseFloat(yours.querySelector('.caps').dataset.rating) : null,
        globalRating: global ? parseFloat(global.querySelector('.caps').dataset.rating) : null,
        abv: parseFloat(el.querySelector('.details .abv')?.textContent) || null,
        totalCheckins: parseInt(el.querySelector('.check-ins')?.textContent.replace(/\D/g, '')) || 1,
        firstCheckinId:
          parseInt(el.querySelector('.details .date a')?.href.match(/checkin\/(\d+)/)?.[1]) || null,
        url: el.querySelector('.beer-details .name a')?.getAttribute('href') ?? null
      };
    })
  );

async function harvest(kind) {
  const out = `untappd-${kind}.json`;
  if (fs.existsSync(out)) {
    console.log(`[skip] ${out} already exists`);
    return;
  }
  const path = `/user/${USER}/${kind}`;
  console.log(`[${kind}] opening ${BASE}${path}`);
  console.log(`[${kind}] >>> A CHROME WINDOW IS OPEN — LOG IN AND SOLVE ANY CAPTCHA THERE <<<`);
  await page.goto(BASE + path, { waitUntil: 'domcontentloaded' });

  // Poll until the list renders. NEVER navigate while the user is on a login
  // page, and re-navigate at most once per 10s (so no refresh-every-second).
  const deadline = Date.now() + 15 * 60 * 1000;
  let lastNav = 0;
  let announced = false;
  while ((await page.locator('.beer-item').count()) === 0) {
    if (Date.now() > deadline) throw new Error(`[${kind}] timed out waiting for beer list`);
    const url = page.url();
    const userIsTyping = /\/login|\/auth|\/sign/.test(url) || !url.includes('untappd.com');
    if (userIsTyping && !announced) {
      console.log(`[${kind}] waiting for you to log in — take your time, the window will NOT refresh`);
      announced = true;
    }
    if (!url.includes(path) && !userIsTyping && Date.now() - lastNav > 10000) {
      lastNav = Date.now();
      await page.goto(BASE + path, { waitUntil: 'domcontentloaded' }).catch(() => {});
    }
    await page.waitForTimeout(1500);
  }

  // Click "Show More" until exhausted, max ~1 request/sec.
  let stall = 0;
  for (;;) {
    const btn = page
      .locator('a:has-text("Show More"), button:has-text("Show More"), a:has-text("show more"), button:has-text("show more")')
      .first();
    if (!(await btn.isVisible().catch(() => false))) break;
    const before = await page.locator('.beer-item').count();
    await btn.click();
    for (let i = 0; i < 15 && (await page.locator('.beer-item').count()) === before; i++) {
      await page.waitForTimeout(200);
    }
    await page.waitForTimeout(1000);
    const now = await page.locator('.beer-item').count();
    if (now === before) {
      stall++;
      console.log(`[${kind}] no growth (attempt ${stall}/3), ${now} items`);
      if (stall >= 3) {
        console.log(`[${kind}] giving up on further pages`);
        break;
      }
    } else {
      stall = 0;
      if (now % 50 < 10) console.log(`[${kind}] ${now} items loaded`);
    }
  }

  const items = await extract();
  fs.writeFileSync(out, JSON.stringify(items, null, 2));
  console.log(`[${kind}] DONE: ${items.length} items -> ${out}`);
}

for (const kind of LISTS) {
  try {
    await harvest(kind);
  } catch (err) {
    console.error(`[${kind}] failed: ${err.message}`);
  }
}

await ctx.close();
console.log('ALL DONE');
