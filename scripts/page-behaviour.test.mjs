// How the built search page behaves in a real browser (Playwright): the things `node --test`
// can't see from the pure pieces. It runs with `npm test` when the site has been built
// since the page last changed (`npm run build` first) and a browser is installed; otherwise
// each check is skipped, so the weekly crawl's `npm test` (no build, no browser) is unaffected.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, join } from 'node:path';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist/client');
const built = join(dist, 'index.html');
const sources = ['src/scripts/search.ts', 'src/pages/index.astro', 'src/lib/page-state.mjs', 'src/lib/search-core.mjs'];
const fresh = existsSync(built) && sources.every((f) => statSync(join(root, f)).mtimeMs <= statSync(built).mtimeMs);

let browser = null;
let origin = '';
let server = null;
let why = fresh ? '' : 'the site has not been built since the page changed (npm run build)';

const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };

before(async () => {
  if (why) return;
  try {
    const { chromium, webkit } = await import('playwright');
    browser = await (process.env.PAGE_BROWSER === 'webkit' ? webkit : chromium).launch().catch(() => webkit.launch());
  } catch (e) {
    why = `no browser to run it in (${String(e.message).split('\n')[0]})`;
    return;
  }
  server = createServer((req, res) => {
    let file = join(dist, decodeURIComponent(req.url.split('?')[0]));
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
    if (!file.startsWith(dist) || !existsSync(file)) return void res.writeHead(404).end('Not found');
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
    res.end(readFileSync(file));
  });
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  origin = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  await browser?.close();
  server?.close();
});

/** Opens a path of the built site at a phone's or a desktop's size. Nothing off this computer is fetched. */
async function open(path, { width = 390, height = 844, textScale = 1, init } = {}) {
  const context = await browser.newContext({ viewport: { width, height } });
  const page = await context.newPage();
  await page.route((url) => url.hostname !== '127.0.0.1', (route) => route.abort());
  if (init) await page.addInitScript(init);
  if (textScale !== 1) await page.addInitScript((f) => document.addEventListener('DOMContentLoaded', () => (document.documentElement.style.fontSize = `${f * 100}%`)), textScale);
  await page.goto(origin + path);
  await page.waitForSelector('#app[data-state="ready"]');
  return page;
}
const check = (name, fn) =>
  test(name, async (t) => {
    if (why) return t.skip(why);
    await fn();
  });
const searchFor = async (page, text) => {
  await page.fill('#q', text);
  await page.press('#q', 'Enter');
  await page.waitForTimeout(250);
};

check('phone: "Clear filters" in the sheet unchecks what was picked, and it can be picked again', async () => {
  const page = await open('/');
  await searchFor(page, 'curry');
  await page.click('#filters-open');
  await page.waitForSelector('#filter-sheet[open]');
  for (const unfold = page.locator('#filter-sheet .unfold'); await unfold.count(); ) await unfold.first().click();
  await page.locator('#filter-sheet input[name="cuisine"][value="Thai"]').check();
  await page.locator('#filter-sheet input[name="site"]').nth(0).check();
  await page.locator('#filter-sheet input[name="site"]').nth(1).check();
  const picked = () => page.evaluate(() => [...document.querySelectorAll('#filter-sheet input:checked')].filter((i) => i.value && i.value !== '0').map((i) => i.name));
  assert.deepEqual(await picked(), ['cuisine', 'site', 'site']);
  await page.click('#sheet-clear');
  assert.deepEqual(await picked(), []);
  await page.locator('#filter-sheet input[name="cuisine"][value="Thai"]').check();
  assert.equal(await page.evaluate(() => new URLSearchParams(location.search).get('cuisine')), 'Thai');
  // Back with the sheet open: it closes with the search it belonged to.
  assert.equal(await page.evaluate(() => document.getElementById('filter-sheet').open), true);
  await page.goBack();
  await page.waitForTimeout(250);
  assert.equal(await page.evaluate(() => location.pathname + location.search), '/');
  assert.equal(await page.evaluate(() => document.getElementById('filter-sheet').open), false);
  await page.context().close();
});

check('phone: a cuisine, a creator and a diet show once, as tags; the line under "Filters" lists the rest', async () => {
  const page = await open('/?q=tofu&cuisine=Chinese&site=woks&diet=vegetarian&time=30');
  const tags = await page.evaluate(() => [...document.querySelectorAll('#with-chips button')].map((b) => b.textContent.replace('×', '').trim()));
  assert.deepEqual(tags, ['Remove from The Woks of Life', 'Remove Chinese cuisine', 'Remove vegetarian']);
  const line = await page.evaluate(() => document.getElementById('set-line').textContent);
  assert.match(line, /30 minutes or less/);
  assert.doesNotMatch(line, /Chinese|Woks|vegetarian/);
  assert.equal(await page.evaluate(() => document.getElementById('filters-label').textContent), 'Filters, 1 set');
  await page.context().close();
});

check('what was typed is in no attribute, and in no text analytics can read', async () => {
  const typed = ['zzyzx', 'qwertish', 'blorple'];
  // Every attribute value, and every piece of text outside data-amp-mask. A link's address
  // is left out: kp-design cuts every address down to its path before anything is sent.
  const leaks = (page) =>
    page.evaluate((typed) => {
      const has = (s) => typed.some((w) => String(s).toLowerCase().includes(w));
      const found = [];
      for (const el of document.querySelectorAll('body *')) {
        if (el.id === 'q') continue; // the box itself is an input, which analytics never reads
        for (const a of el.attributes) if (a.name !== 'href' && has(a.value)) found.push(`${a.name} on <${el.tagName.toLowerCase()} id="${el.id}">`);
      }
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for (let n; (n = walker.nextNode()); ) {
        const parent = n.parentElement;
        if (parent && !parent.closest('script, style, [data-amp-mask]') && has(n.textContent)) found.push(`text in #${parent.closest('[id]')?.id}`);
      }
      if (has(document.title)) found.push('the title');
      return found;
    }, typed);
  for (const size of [{ width: 390, height: 844 }, { width: 1280, height: 900 }]) {
    const page = await open('/', size);
    await searchFor(page, 'noodles no zzyzx'); // a word left out by name becomes a tag
    assert.equal(await page.locator('#with-chips button').count(), 1);
    assert.deepEqual(await leaks(page), []);
    await searchFor(page, 'qwertish blorple noodles'); // words nothing has, said back in the count line
    assert.deepEqual(await leaks(page), []);
    await searchFor(page, 'qwertish blorple'); // nothing found: what to try instead names the words
    assert.equal(await page.evaluate(() => document.getElementById('empty').hidden), false);
    assert.deepEqual(await leaks(page), []);
    await page.fill('#q', 'zzyzx tof'); // suggestions
    await page.waitForTimeout(250);
    assert.deepEqual(await leaks(page), []);
    await page.goto(`${origin}/`); // recent searches under the empty box
    await page.waitForSelector('#app[data-state="ready"]');
    await page.click('#q');
    await page.waitForSelector('#q-kept:not([hidden]) [data-forget="0"]');
    assert.deepEqual(await leaks(page), []);
    // The × beside a recent search is still named for it, through the link's own text.
    const name = await page.evaluate(() => document.querySelector('[data-forget="0"]').getAttribute('aria-labelledby').split(' ').map((id) => document.getElementById(id).textContent).join(' '));
    assert.match(name, /^Remove from recent searches: .*zzyzx/);
    // A search that found nothing was not kept.
    assert.ok(!(await page.evaluate(() => localStorage.getItem('findish-recent-searches'))).includes('qwertish+blorple"'));
    await page.context().close();
  }
});

check('a double tap on a tag’s × takes off one tag, and says which', async () => {
  const page = await open('/?q=noodles&not=zzyzx,blorple');
  assert.equal(await page.locator('#with-chips button').count(), 2);
  await page.locator('#with-chips button').first().dblclick({ delay: 30 });
  await page.waitForTimeout(300);
  assert.equal(await page.locator('#with-chips button').count(), 1);
  assert.equal(await page.evaluate(() => location.search), '?q=noodles&not=blorple');
  assert.match(await page.evaluate(() => document.getElementById('status').textContent), /^Removed no zzyzx\./);
  await page.context().close();
});

check('Save says so when the browser will not keep anything, and the saved view counts what is left', async () => {
  const refused = await open('/?q=mapo+tofu', { init: () => (Storage.prototype.setItem = () => { throw new Error('QuotaExceededError'); }) });
  await refused.locator('button[data-save]').first().click();
  const state = await refused.evaluate(() => ({ pressed: document.querySelector('button[data-save]').getAttribute('aria-pressed'), word: document.querySelector('button[data-save] .save-word').textContent, said: document.getElementById('announce').textContent }));
  assert.equal(state.pressed, 'false');
  assert.equal(state.word, 'Couldn’t save');
  assert.match(state.said, /Couldn’t save it/);
  await refused.context().close();

  const page = await open('/?q=mapo+tofu');
  for (let i = 0; i < 3; i++) await page.locator('button[data-save]').nth(i).click();
  await page.goto(`${origin}/?saved=1`);
  await page.waitForSelector('#app[data-state="ready"]');
  assert.match(await page.evaluate(() => document.getElementById('status').textContent), /^3 saved recipes/);
  await page.locator('button[data-save]').first().click();
  assert.match(await page.evaluate(() => document.getElementById('status').textContent), /^2 saved recipes, kept on this device\./);
  await page.context().close();
});

check('links and typed lists: a creator page’s search is read as a sentence, a pasted list adds one step, ?time=7 is a time the page offers', async () => {
  const from = await open('/?site=woks&q=quick+vegetarian+dinner');
  assert.equal(await from.evaluate(() => location.search), '?site=woks&time=30&diet=vegetarian');
  await from.context().close();

  const page = await open('/');
  const start = await page.evaluate(() => history.length);
  await page.fill('#q', 'tofu, ginger');
  await page.waitForTimeout(200);
  assert.equal(await page.evaluate(() => history.length), start, 'nothing is added to history while the list is still being typed');
  await page.press('#q', 'Enter');
  await page.waitForTimeout(250);
  assert.equal(await page.evaluate(() => history.length), start + 1);
  assert.equal(await page.evaluate(() => new URLSearchParams(location.search).get('with')), 'tofu,ginger');
  await page.goBack();
  await page.waitForTimeout(250);
  assert.equal(await page.evaluate(() => location.pathname + location.search), '/');
  await page.context().close();

  const odd = await open('/?q=chicken&time=7');
  assert.match(await odd.evaluate(() => document.getElementById('set-line').textContent), /15 minutes or less/);
  await odd.context().close();
});

check('nothing found: a word the index knows is not respelt, and all the filters can come off at once', async () => {
  const page = await open('/?q=mapo+tofu&time=5&course=dessert');
  const fixes = await page.evaluate(() => document.getElementById('fixes').textContent);
  assert.doesNotMatch(fixes, /mayo/);
  assert.match(fixes, /without the filters \(\d+ recipes\)/);
  await page.locator('#fixes button', { hasText: 'without the filters' }).click();
  await page.waitForTimeout(250);
  assert.equal(await page.evaluate(() => location.search), '?q=mapo+tofu');
  const diet = await open('/?q=beef+rendang&diet=vegetarian');
  const said = await diet.evaluate(() => document.getElementById('fixes').textContent);
  assert.match(said, /any diet \(\d+ recipes?\)/);
  assert.doesNotMatch(said, /leaving nothing out/);
  await page.context().close();
  await diet.context().close();
});

check('very large text on a small phone: only "Show" stays at the bottom of the sheet, and suggestions do not push the page sideways', async () => {
  const page = await open('/?q=mapo+tofu&cuisine=Chinese&time=30', { width: 320, height: 560, textScale: 2 });
  await page.click('#filters-open');
  await page.waitForSelector('#filter-sheet[open]');
  const foot = await page.evaluate(() => ({ foot: getComputedStyle(document.querySelector('.sheet-foot')).display, clear: getComputedStyle(document.getElementById('sheet-clear')).position, show: getComputedStyle(document.getElementById('sheet-show')).position }));
  assert.deepEqual(foot, { foot: 'contents', clear: 'static', show: 'sticky' });
  await page.click('#sheet-show');
  await page.fill('#q', 'mapo');
  await page.waitForTimeout(250);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0);
  await page.keyboard.press('Escape');
  const sides = page.locator('.row .sides button').first();
  if (await sides.count()) assert.equal(await sides.evaluate((b) => getComputedStyle(b).textAlign), 'left');
  await page.context().close();
});

check('desktop: a filter menu opened with the keyboard takes focus, and gives it back on Escape', async () => {
  const page = await open('/?q=kimchi', { width: 1280, height: 900 });
  await page.focus('#f-cuisine-btn');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(200);
  assert.equal(await page.evaluate(() => `${document.activeElement.tagName} ${document.activeElement.getAttribute('name')} ${!!document.activeElement.closest('.pop')}`), 'INPUT cuisine true');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  assert.equal(await page.evaluate(() => document.activeElement.id), 'f-cuisine-btn');
  await page.context().close();
});
