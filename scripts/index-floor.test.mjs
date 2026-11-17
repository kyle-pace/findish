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

const status = {
  sources: {
    woks: { name: 'The Woks of Life', result: 'ok', count: 1000 },
    htk: { name: 'Hot Thai Kitchen', result: 'ok', count: 400 },
    tiny: { name: 'Tiny', result: 'ok', count: 12 },
    joc: { name: 'Just One Cookbook', result: 'paused' },
    'woks-yt': { name: 'The Woks of Life', result: 'ok', count: 300 },
  },
};
const fine = { recipes: { woks: 998, htk: 400, tiny: 12, joc: 0 }, videos: { 'woks-yt': 300 } };

test('an index about as big as the last crawl passes', () => {
  assert.deepEqual(floorProblems({ status, ...fine }), []);
  // A few recipes fewer (twins folded, pages that aren't recipes) is normal.
  assert.deepEqual(floorProblems({ status, recipes: { ...fine.recipes, woks: 850 }, videos: fine.videos }), []);
});

test('a site that lost most of its recipes stops the build, and is named', () => {
  const problems = floorProblems({ status, recipes: { ...fine.recipes, woks: 700 }, videos: fine.videos });
  assert.equal(problems.length, 1);
  assert.match(problems[0], /The Woks of Life \(woks\) has 700 recipes; the last crawl kept 1000/);
});

test('a data file that is missing or empty stops the build', () => {
  assert.match(floorProblems({ status, recipes: { ...fine.recipes, htk: 0 }, videos: fine.videos })[0], /Hot Thai Kitchen/);
  assert.match(floorProblems({ status, recipes: fine.recipes, videos: { 'woks-yt': 0 } })[0], /has 0 videos/);
});

test('a small source is not checked on its own, and a paused one not at all', () => {
  assert.deepEqual(floorProblems({ status, recipes: { ...fine.recipes, tiny: 0 }, videos: fine.videos }), []);
});

test('a source that fell off the list is noticed in the total', () => {
  const problems = floorProblems({ status, recipes: { htk: 400, tiny: 12 }, videos: fine.videos });
  assert.equal(problems.length, 1);
  assert.match(problems[0], /Everything together comes to 712; the last crawl kept 1712/);
  assert.match(problems[0], /Not in the list of sources any more: woks\./);
});

test('a small source leaving the list on purpose passes', () => {
  assert.deepEqual(floorProblems({ status, recipes: { woks: 1000, htk: 400 }, videos: fine.videos }), []);
});

test('a crawl that itself came back thin is caught by the count from the run before', () => {
  const thin = { sources: { ...status.sources, woks: { name: 'The Woks of Life', result: 'ok', count: 300, previous: 1000 } } };
  assert.match(floorProblems({ status: thin, recipes: { ...fine.recipes, woks: 300 }, videos: fine.videos })[0], /has 300 recipes; the last crawl kept 1000/);
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
      const rows = JSON.parse(readFileSync(file, 'utf8')).slice(0, 40);
      writeFileSync(file, JSON.stringify(rows));
      s.count = rows.length;
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
