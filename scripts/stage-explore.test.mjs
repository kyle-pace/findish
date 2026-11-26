// The explorer is copied in from another repo (vendor/explore/) and its addresses are
// changed on the way to public/explore/app/. These hold that to account: the real copy
// stages with nothing left pointing at its old home, and a copy the rules no longer fit
// fails instead of shipping half-changed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { rewrite, stage, RULES } from './stage-explore.mjs';
import { countPages, FILES, DATA } from './sync-explore.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const vendor = join(root, 'vendor/explore');

test('old addresses are pointed at /explore/, and the repo link is left alone', () => {
  assert.equal(rewrite('href="/world-cuisine/img/a.jpg"'), 'href="/explore/img/a.jpg"');
  assert.equal(rewrite('https://kylepace.dev/world-cuisine/dish/pho/'), 'https://findish.now/explore/dish/pho/');
  const repo = 'https://github.com/kyle-pace/world-cuisines/issues/new?title=';
  assert.equal(rewrite(repo), repo);
});

test('the real copy stages with nothing pointing at its old home', () => {
  const out = join(mkdtempSync(join(tmpdir(), 'explore-')), 'app');
  const seen = stage(vendor, out);
  for (const [from] of RULES) assert.ok(seen.get(from) > 0, `rule matched nothing: ${from}`);
  for (const f of FILES) {
    const text = readFileSync(join(out, f), 'utf8');
    assert.ok(!text.includes('/world-cuisine/'), `${f} still says /world-cuisine/`);
  }
  const items = join(out, 'data/web/items');
  for (const f of readdirSync(items)) assert.ok(!readFileSync(join(items, f), 'utf8').includes('/world-cuisine/'), `${f} still says /world-cuisine/`);
  // The libraries are copied untouched, and the note about where the copy came from stays behind
  assert.ok(existsSync(join(out, 'vendor/globe.gl.min.js')));
  assert.ok(!existsSync(join(out, 'SOURCE.json')));
});

test('a copy the rules no longer fit fails out loud', () => {
  const dir = mkdtempSync(join(tmpdir(), 'explore-broken-'));
  mkdirSync(join(dir, 'src'));
  writeFileSync(join(dir, 'src/index.html'), '<a href="/somewhere-else/">Back</a>');
  assert.throws(() => stage(join(dir, 'src'), join(dir, 'out')), /no longer contains/);
});

test('the copy here is whole: every page file, every data file, thousands of pages', () => {
  for (const f of FILES) assert.ok(existsSync(join(vendor, f)), `missing ${f}`);
  for (const f of DATA) assert.ok(existsSync(join(vendor, 'data', f)), `missing data/${f}`);
  assert.ok(countPages(vendor) > 3000, 'fewer than 3,000 cuisine, dish and ingredient pages');
});
