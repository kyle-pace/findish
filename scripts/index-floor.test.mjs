// The build stops when the index would be far smaller than the last crawl counted
// (scripts/index-floor.mjs), and scripts/build-index.mjs really does exit non-zero.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { floorProblems } from './index-floor.mjs';

// The shape of the real thing (data/status.json, November 2026): eleven sites and fourteen
// channels, about 6,000 recipes and 7,400 videos, the biggest site 1,541. No one source is
// a fifth of everything, which is why a floor on the grand total alone let one vanish.
const sizes = {
  recipes: { woks: 1372, htk: 415, sk: 445, mala: 198, rte: 1541, rtj: 430, sudachi: 493, mwl: 198, ab: 946 },
  videos: { 'woks-yt': 406, 'joc-yt': 591, 'htk-yt': 834, 'sk-yt': 91, 'maangchi-yt': 611, 'rte-yt': 1436, 'rtj-yt': 75, 'sudachi-yt': 574, 'mwl-yt': 605, 'ab-yt': 265, kenji: 878, ccd: 362, 'rhs-yt': 130, fca: 546 },
};
const names = { woks: 'The Woks of Life', htk: 'Hot Thai Kitchen', rte: 'RecipeTin Eats' };
const status = {
  sources: {
    ...Object.fromEntries(Object.entries({ ...sizes.recipes, ...sizes.videos }).map(([id, count]) => [id, { name: names[id] || id, result: 'ok', count }])),
    tiny: { name: 'Tiny', result: 'ok', count: 12 },
    joc: { name: 'Just One Cookbook', result: 'paused' },
  },
};
const fine = { recipes: { ...sizes.recipes, woks: 1370, tiny: 12 }, videos: { ...sizes.videos } };
const without = (o, ...ids) => Object.fromEntries(Object.entries(o).filter(([id]) => !ids.includes(id)));

test('an index about as big as the last crawl passes', () => {
  assert.deepEqual(floorProblems({ status, ...fine }), []);
  // A few recipes fewer (twins folded, pages that aren't recipes) is normal.
  assert.deepEqual(floorProblems({ status, recipes: { ...fine.recipes, woks: 1150 }, videos: fine.videos }), []);
});

test('a site that lost most of its recipes stops the build, and is named', () => {
  const problems = floorProblems({ status, recipes: { ...fine.recipes, woks: 700 }, videos: fine.videos });
  assert.equal(problems.length, 1);
  assert.match(problems[0], /The Woks of Life \(woks\) has 700 recipes; the last crawl kept 1372/);
});

test('a data file that is missing or empty stops the build', () => {
  assert.match(floorProblems({ status, recipes: { ...fine.recipes, htk: 0 }, videos: fine.videos })[0], /Hot Thai Kitchen/);
  assert.match(floorProblems({ status, recipes: fine.recipes, videos: { ...fine.videos, 'woks-yt': 0 } })[0], /has 0 videos/);
});

test('a small source is not checked on its own, and a paused one not at all', () => {
  assert.deepEqual(floorProblems({ status, recipes: { ...fine.recipes, tiny: 0 }, videos: fine.videos }), []);
  assert.deepEqual(floorProblems({ status, recipes: { ...fine.recipes, joc: 0 }, videos: fine.videos }), []);
});

test('any one source that fell off the list stops the build by name, however small a share it is', () => {
  // Every source with more than 20, one at a time: the biggest site, a mid-sized one, a channel.
  for (const id of Object.keys({ ...sizes.recipes, ...sizes.videos })) {
    const problems = floorProblems({ status, recipes: without(fine.recipes, id), videos: without(fine.videos, id) });
    assert.equal(problems.length, 1, `${id}: ${problems.join(' | ')}`);
    assert.ok(problems[0].includes(`(${id}) is not in the list of sources any more; the last crawl kept ${status.sources[id].count}`), problems[0]);
  }
  assert.match(floorProblems({ status, recipes: without(fine.recipes, 'rte'), videos: fine.videos })[0], /RecipeTin Eats \(rte\) is not in the list/);
  assert.match(floorProblems({ status, recipes: without(fine.recipes, 'woks'), videos: fine.videos })[0], /The Woks of Life \(woks\) is not in the list/);
});

test('a source switched off on purpose since the last crawl passes', () => {
  assert.deepEqual(floorProblems({ status, recipes: without(fine.recipes, 'rte'), videos: fine.videos, paused: ['rte'] }), []);
});

test('recipes and videos are added up apart, so many sites each a little short are noticed', () => {
  // Every site keeps 85% (fine on its own), and thirty small sites (20 each, too small to be
  // checked alone) come back empty. Next to 7,400 videos that are all there, that hid.
  const short = Object.fromEntries(Object.entries(sizes.recipes).map(([id, n]) => [id, Math.ceil(n * 0.85)]));
  assert.deepEqual(floorProblems({ status, recipes: { ...short, tiny: 12 }, videos: fine.videos }), []);
  const smalls = Array.from({ length: 30 }, (_, n) => `s${n}`);
  const more = { sources: { ...status.sources, ...Object.fromEntries(smalls.map((id) => [id, { name: id, result: 'ok', count: 20 }])) } };
  const recipes = { ...short, tiny: 12, ...Object.fromEntries(smalls.map((id) => [id, 0])) };
  const problems = floorProblems({ status: more, recipes, videos: fine.videos });
  assert.equal(problems.length, 1, problems.join(' | '));
  assert.match(problems[0], /All the recipes together come to \d+; the last crawl kept \d+/);
  // On one grand total (how it was checked before), the same index was over the floor.
  const sum = (o) => Object.values(o).reduce((a, b) => a + b, 0);
  const want = Object.values(more.sources).reduce((a, s) => a + (s.count || 0), 0);
  assert.ok(sum(recipes) + sum(fine.videos) >= want * 0.8);
});

test('a small source leaving the list on purpose passes', () => {
  assert.deepEqual(floorProblems({ status, recipes: without(fine.recipes, 'tiny'), videos: fine.videos }), []);
});

test('a crawl that itself came back thin is caught by the count from the run before', () => {
  const thin = { sources: { ...status.sources, woks: { name: 'The Woks of Life', result: 'ok', count: 300, previous: 1372 } } };
  assert.match(floorProblems({ status: thin, recipes: { ...fine.recipes, woks: 300 }, videos: fine.videos })[0], /has 300 recipes; the last crawl kept 1372/);
  // The crawl after that, the lower number is the known one, and the build goes through.
  const settled = { sources: { ...status.sources, woks: { name: 'The Woks of Life', result: 'ok', count: 300, previous: 300 } } };
  assert.deepEqual(floorProblems({ status: settled, recipes: { ...fine.recipes, woks: 300 }, videos: fine.videos }), []);
});

test('a source the last crawl did not run is left out of the total', () => {
  const s = { sources: { ...status.sources, old: { name: 'Old', result: 'not run', count: 5000 } } };
  assert.deepEqual(floorProblems({ status: s, ...fine }), []);
});

test('no recipes at all stops the build even with nothing to compare with', () => {
  assert.match(floorProblems({ status: { sources: {} }, recipes: {}, videos: {} })[0], /no recipes at all/);
});

// The real script, on a copy of the project whose biggest site's data file was emptied.
test('build-index exits non-zero when a site’s recipes are gone, and --allow-drop lets it through', () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const dir = mkdtempSync(join(tmpdir(), 'findish-floor-'));
  try {
    for (const d of ['scripts', 'crawler', 'data', 'vendor', '.agents/allowed-hosts.txt', 'src/lib']) cpSync(join(root, d), join(dir, d), { recursive: true });
    if (existsSync(join(root, 'public/covers/covers.json'))) cpSync(join(root, 'public/covers/covers.json'), join(dir, 'public/covers/covers.json'));
    symlinkSync(join(root, 'node_modules'), join(dir, 'node_modules'));
    // A small copy of the data, so the three builds are quick: 40 rows a source, and a
    // status file that says so.
    const status = JSON.parse(readFileSync(join(dir, 'data/status.json'), 'utf8'));
    for (const s of Object.values(status.sources)) {
      const file = join(dir, 'data', `${s.id}.json`);
      if (!existsSync(file)) continue;
      // Names a site repeats stay in (Seonkyoung Longest's first 40 rows hold 14 strays): rows
      // the build leaves out on purpose are not a drop.
      const rows = JSON.parse(readFileSync(file, 'utf8')).slice(0, 40);
      writeFileSync(file, JSON.stringify(rows));
      s.count = rows.length;
      s.previous = rows.length;
    }
    writeFileSync(join(dir, 'data/status.json'), JSON.stringify(status));
    const run = (...args) => spawnSync(process.execPath, [join(dir, 'scripts/build-index.mjs'), ...args], { encoding: 'utf8', env: { ...process.env, ALLOW_INDEX_DROP: '' } });

    const ok = run();
    assert.equal(ok.status, 0, ok.stderr);
    assert.ok(existsSync(join(dir, 'public/index.json')));

    const biggest = Object.values(status.sources).find((s) => s.sitemapPages && existsSync(join(dir, 'data', `${s.id}.json`)));
    writeFileSync(join(dir, 'data', `${biggest.id}.json`), '[]');
    rmSync(join(dir, 'public/index.json'));

    const stopped = run();
    assert.equal(stopped.status, 1);
    assert.match(stopped.stderr, /index: not built/);
    assert.ok(stopped.stderr.includes(`(${biggest.id}) has 0 recipes`), stopped.stderr);
    assert.ok(!existsSync(join(dir, 'public/index.json')), 'nothing is written when the build stops');

    const allowed = run('--allow-drop');
    assert.equal(allowed.status, 0, allowed.stderr);
    assert.ok(existsSync(join(dir, 'public/index.json')));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
