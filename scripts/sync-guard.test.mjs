// A catalog sync must never quietly take away a source or an ingredient id
// (scripts/sync-guard.mjs), and the copy in vendor/kitchen-catalog/ has to hold together.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { lostItems, lostSources, syncProblems } from './sync-guard.mjs';
import { loadSources, validateSources } from '../vendor/kitchen-catalog/sources.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const vendored = join(root, 'vendor/kitchen-catalog');
const catalog = (ids, also = {}) => ({ items: Object.fromEntries(ids.map((id) => [id, { name: id, aliases: [], ...(also[id] ? { also: also[id] } : {}) }])) });
const sources = (...ids) => ({ sources: ids.map((id) => (id.endsWith('-yt') ? { id: id.slice(0, -3), youtube: { id } } : { id })) });

test('a sync that only adds things has nothing to say', () => {
  const now = { catalog: catalog(['basil', 'tofu']), sources: sources('woks', 'sk') };
  const next = { catalog: catalog(['basil', 'tofu', 'mint']), sources: sources('woks', 'sk', 'new') };
  assert.deepEqual(syncProblems(now, next), []);
  assert.deepEqual(syncProblems({ catalog: null, sources: null }, next), [], 'a first sync');
});

test('a source that would vanish is named, a site or its channel', () => {
  assert.deepEqual(lostSources(sources('woks', 'sk', 'eatchofood'), sources('woks', 'sk')), ['eatchofood']);
  assert.deepEqual(lostSources(sources('woks-yt'), sources('woks')), ['woks-yt']);
  const said = syncProblems({ catalog: catalog(['tofu']), sources: sources('woks', 'ruhlman') }, { catalog: catalog(['tofu']), sources: sources('woks') });
  assert.equal(said.length, 1);
  assert.match(said[0], /1 source here would disappear: ruhlman/);
});

test('an ingredient id may move into another item’s "also", but not disappear', () => {
  assert.deepEqual(lostItems(catalog(['scallion', 'tofu']), catalog(['green-onion', 'tofu'], { 'green-onion': ['scallion'] })), []);
  assert.deepEqual(lostItems(catalog(['scallion', 'tofu']), catalog(['green-onion', 'tofu'])), ['scallion']);
});

test('an empty or cut-short file is refused', () => {
  const now = { catalog: catalog(['tofu']), sources: sources('woks') };
  assert.ok(syncProblems(now, { catalog: { items: {} }, sources: sources('woks') }).some((p) => /no items/.test(p)));
  assert.ok(syncProblems(now, { catalog: catalog(['tofu']), sources: { sources: [] } }).some((p) => /sources list is empty/.test(p)));
});

test('the copy here holds together: valid sources, and every parent and "also" points somewhere real', () => {
  assert.deepEqual(validateSources(loadSources(join(vendored, 'sources.json'))), []);
  const { items } = JSON.parse(readFileSync(join(vendored, 'catalog.json'), 'utf8'));
  for (const [id, item] of Object.entries(items)) {
    if (item.parent) assert.ok(items[item.parent], `${id} has a missing parent ${item.parent}`);
    for (const old of item.also || []) assert.ok(!items[old], `${old} is both an item and an older id of ${id}`);
  }
});

// The real script, against a pretend KitchenCatalog clone that is missing a source.
test('sync-catalog stops before copying when a source would vanish, and goes ahead with --allow-drop', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'sync-guard-'));
  try {
    const here = join(tmp, 'site');
    const clone = join(tmp, 'kitchen-catalog');
    mkdirSync(join(here, 'scripts'), { recursive: true });
    for (const f of ['sync-catalog.mjs', 'sync-guard.mjs']) cpSync(join(root, 'scripts', f), join(here, 'scripts', f));
    cpSync(vendored, join(here, 'vendor/kitchen-catalog'), { recursive: true });
    for (const d of ['js', 'Sources/KitchenCatalog/Resources', 'recipe-sources']) mkdirSync(join(clone, d), { recursive: true });
    cpSync(join(vendored, 'catalog.mjs'), join(clone, 'js/catalog.mjs'));
    cpSync(join(vendored, 'sources.mjs'), join(clone, 'js/sources.mjs'));
    cpSync(join(vendored, 'catalog.json'), join(clone, 'Sources/KitchenCatalog/Resources/catalog.json'));
    const list = JSON.parse(readFileSync(join(vendored, 'sources.json'), 'utf8'));
    const dropped = list.sources.pop().id;
    writeFileSync(join(clone, 'recipe-sources/sources.json'), JSON.stringify(list));
    const run = (...args) => spawnSync(process.execPath, [join(here, 'scripts/sync-catalog.mjs'), clone, ...args], { encoding: 'utf8' });
    const before = readFileSync(join(here, 'vendor/kitchen-catalog/sources.json'), 'utf8');
    const stopped = run();
    assert.equal(stopped.status, 1, stopped.stderr);
    assert.match(stopped.stderr, new RegExp(`would disappear: .*${dropped}`));
    assert.equal(readFileSync(join(here, 'vendor/kitchen-catalog/sources.json'), 'utf8'), before, 'nothing was copied');
    const allowed = run('--allow-drop');
    assert.equal(allowed.status, 0, allowed.stderr);
    assert.ok(!JSON.parse(readFileSync(join(here, 'vendor/kitchen-catalog/sources.json'), 'utf8')).sources.some((s) => s.id === dropped));
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
