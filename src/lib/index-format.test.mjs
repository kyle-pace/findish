// The page loads the index packed smaller and in two files (src/lib/index-format.mjs).
// These hold it to the one promise that matters: unpacked, it is the same index, so every
// search finds and ranks exactly what it did from public/index.json.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { addVideos, prepare, prepareSteps, queryWords, search, searchVideos, understand } from './search-core.mjs';
import { pack, sameLists, slug, unpack, unpackVideos, videoRowsFor } from './index-format.mjs';
import { realIndex } from './test-index.mjs';

const index = realIndex();
// As the browser gets them: through JSON, so nothing rides along that a file wouldn't carry.
const wire = (x) => JSON.parse(JSON.stringify(x));
const packed = pack(index);
const files = { recipes: wire(packed.recipes), videos: wire(packed.videos), extra: wire(packed.extra) };

const old = prepare(index);
// The page's way (src/scripts/index-load.ts): recipes first, got ready a thousand at a time
// with a pause between, and the videos when they land.
let pauses = 0;
const page = (() => {
  const steps = prepareSteps(unpack(files.recipes, files.extra), 1000);
  let step = steps.next();
  for (; !step.done; step = steps.next()) pauses++;
  return step.value;
})();
const early = prepare(unpack(files.recipes, files.extra)); // stays without videos
addVideos(page, unpackVideos(files.videos, page.index.ing));

const blank = () => ({ q: '', with: [], without: [], notWords: [], sites: new Set(), time: 0, cuisine: '', course: '', fresh: false, diet: '', exact: false, show: '' });
const ing = (id) => old.ing.findIndex((g) => g[0] === id);
/** A search's results, down to the order, the score and which ingredients each one uses. */
const found = (ready, f, opts) => {
  const hits = search(ready, { ...blank(), ...f }, opts);
  return typeof hits === 'number' ? hits : hits.map((h) => [h.r.key, h.r.name, h.r.url, h.r.img, h.r.min, h.r.cuisine, h.r.course, h.r.opens, h.r.flags, h.score, h.used, h.missing]);
};
const videosFound = (ready, f) => searchVideos(ready, { ...blank(), ...f });

// The ranking fixture's own dish searches (src/lib/ranking.test.mjs), read from the file so
// the two lists can't drift apart.
const DISHES = [...readFileSync(new URL('./ranking.test.mjs', import.meta.url), 'utf8').matchAll(/^  \['([^']+)', \//gm)].map((m) => m[1]);
const WORDS = [
  ...DISHES,
  'dumpling sauce', 'pad thai sauce', 'how to cook dumplings', 'chicken and rice', 'kimchee stew', 'pad tai', 'pot sticker', 'stirfry',
  'dumpligns', 'lasagne', 'xyzzy plugh', 'easy dinner', '麻婆豆腐', 'tofu', 'ginger scallion noodles', 'green curry', 'bi bim bap',
];
const TAGS = [
  { with: [ing('rice')] },
  { with: [ing('tofu'), ing('ginger')] },
  { with: [ing('chicken-thighs'), ing('rice'), ing('ginger')] },
  { q: 'fried rice', with: [ing('rice')] },
  { with: [ing('pork')], without: [ing('ginger')] },
  { q: 'curry', diet: 'vegetarian' },
  { q: 'noodles', diet: 'vegan', time: 30 },
  { q: 'chicken', cuisine: 'Thai' },
  { q: 'cake', course: 'dessert' },
  { fresh: true },
  { q: 'soup', notWords: ['pea'] },
];
const CREATORS = [...old.creators.map((c) => ({ sites: new Set([c.id]) })), ...old.creators.slice(0, 6).map((c) => ({ q: 'chicken', sites: new Set([c.id]) }))];

test('the ranking fixture’s searches were found in its file', () => {
  assert.ok(DISHES.length >= 20 && DISHES.includes('mapo tofu') && DISHES.includes('chili'), DISHES.join(', '));
});

test('unpacked, the page’s two files are public/index.json again, to the last field', () => {
  assert.deepStrictEqual(unpack(files.recipes, files.extra, files.videos), index);
});

test('getting it ready from the two files gives the same words to fix typos with', () => {
  assert.equal(pauses, Math.floor((index.recipes.length - 1) / 1000), 'it pauses every thousand recipes');
  assert.deepStrictEqual([...page.vocab], [...old.vocab]);
  assert.deepStrictEqual(page.ingUsed, old.ingUsed);
  assert.equal(page.videos.length, old.videos.length);
  assert.deepStrictEqual(page.creators.map((c) => [c.id, c.recipes, c.videos]), old.creators.map((c) => [c.id, c.recipes, c.videos]));
});

test('every dish search finds the same recipes and videos in the same order', () => {
  for (const q of WORDS) {
    assert.deepStrictEqual(queryWords(page, q), queryWords(old, q), q);
    assert.deepStrictEqual(found(page, { q }), found(old, { q }), q);
    assert.deepStrictEqual(found(page, { q }, { loose: true }), found(old, { q }, { loose: true }), `${q} (loose)`);
    assert.deepStrictEqual(found(page, { q }, { typing: true }), found(old, { q }, { typing: true }), `${q} (typing)`);
    assert.deepStrictEqual(videosFound(page, { q }), videosFound(old, { q }), `${q} (videos)`);
  }
});

test('ingredient, diet, cuisine, course and “new this week” searches are the same', () => {
  for (const f of TAGS) {
    assert.ok(found(old, f).length > 0, JSON.stringify(f));
    assert.deepStrictEqual(found(page, f), found(old, f), JSON.stringify(f));
    assert.deepStrictEqual(videosFound(page, f), videosFound(old, f), JSON.stringify(f));
  }
});

test('creator searches are the same, recipes and videos', () => {
  for (const f of CREATORS) {
    assert.deepStrictEqual(found(page, f), found(old, f), [...f.sites].join());
    assert.deepStrictEqual(videosFound(page, f), videosFound(old, f), [...f.sites].join());
  }
});

test('a sentence is understood the same way', () => {
  for (const text of ['something quick with chicken thighs and rice, under 30 minutes', 'vegetarian thai curry no peanuts', 'desserts from smitten kitchen', 'maangchi kimchi videos', 'eggplant, tofu, scallions'])
    assert.deepStrictEqual(understand(page, text), understand(old, text), text);
});

test('before the videos land, searches by ingredient, creator and filter already find the same recipes', () => {
  assert.equal(early.videos.length, 0);
  assert.deepStrictEqual(early.creators.map((c) => [c.id, c.recipes, c.videos]), old.creators.map((c) => [c.id, c.recipes, c.videos]));
  for (const f of [...TAGS.filter((t) => !t.q), ...CREATORS.filter((c) => !c.q)]) assert.deepStrictEqual(found(early, f), found(old, f), JSON.stringify(f));
  // Words every recipe site uses find the same recipes too; only the videos are still to come.
  for (const q of ['tofu', 'mapo tofu', 'fried rice', 'chicken']) assert.deepStrictEqual(found(early, { q }), found(old, { q }), q);
  assert.deepStrictEqual(videosFound(early, { q: 'tofu' }), []);
});

test('adding the videos twice does not count their words twice', () => {
  const again = prepare(unpack(files.recipes, files.extra));
  const rows = unpackVideos(files.videos, again.index.ing);
  addVideos(again, rows);
  addVideos(again, rows);
  assert.deepStrictEqual([...again.vocab], [...old.vocab]);
});

test('it is worth it: the recipes file is under 60% of index.json, and both together are smaller too', () => {
  const size = (x) => JSON.stringify(x).length;
  assert.ok(size(packed.recipes) < 0.6 * size(index), `${size(packed.recipes)} of ${size(index)}`);
  assert.ok(size(packed.recipes) + size(packed.videos) < 0.85 * size(index));
});

// --- the awkward cases, on a small index ------------------------------------------------

const small = () => ({
  built: '2026-11-17',
  crawled: '2026-11-16',
  sources: [
    { id: 'a', name: 'A', site: 'https://a.example', host: 'a.example', count: 5 },
    { id: 'b', name: 'B', site: 'https://b.example', host: 'b.example', count: 1 },
  ],
  paused: [],
  videos: {
    sources: [{ id: 'a-yt', name: 'A', channel: 'UC1', site: 'a', count: 3 }],
    rows: [
      [0, 'Pork Belly Buns', 'vid1', '2026-01-01', [1, 0], 'main', 1],
      [0, 'A chat', 'vid2', '2026-01-02', [], ''],
      [0, 'Salt', 'vid3', '', [2], ''],
    ],
  },
  support: {},
  linkOnly: [],
  cuisines: [],
  courses: [],
  fresh: [1],
  popular: [0],
  diet: { vegetarian: [0, 1], vegan: [0, 1] },
  groups: [],
  // pork, pork belly (a kind of pork), salt (a basic), sea salt (a kind of salt, also a basic), rice
  ing: [
    ['pork', 'Pork', 2, []],
    ['pork-belly', 'Pork belly', 2, [0]],
    ['salt', 'Salt', 0, []],
    ['sea-salt', 'Sea salt', 0, [2]],
    ['rice', 'Rice', 1, []],
  ],
  recipes: [
    // The name is the link's last part, with and without a closing slash.
    [0, 'Crème Brûlée & Jam', '/crème/creme-brulee-and-jam/', 30, 'French', [], [], 'https://a.example/img/one.jpg', '', 0, 'dessert', '2026-01-01'],
    [0, "Mom's Pork Belly", '/recipes/moms-pork-belly', null, '', [1, 0, 3, 2], [1], 'https://a.example/img/two.jpg', 'pork · belly', 7, '', '', 1],
    // Pork belly and then pork itself: both named, though pork was already there as a parent.
    [0, 'Two Porks', '/two-porks-2/', 20, '', [1, 0, 4], [1, 0, 4], '', '', 0, 'main', ''],
    // Salt named after sea salt brought it in, and a photo that is exactly what the others start with.
    [0, 'Salty Rice', '/*/', 5, '', [3, 2, 4], [4], 'https://a.example/img/', '', 0, '', ''],
    // Links that really end in a star stay as they are.
    [0, 'Star', '/a*b/*', 5, '', [2], [], '', '', 0, '', ''],
    // A site with one photo: its start is the whole address, less a letter.
    [1, 'Only One', '/only-one', 5, '', [4], [4], 'https://b.example/p.jpg', '', 2, '', '', 4],
  ],
});

test('links, photos and ingredient lists survive packing in the awkward cases', () => {
  const index = small();
  const p = wire(pack(index));
  assert.deepStrictEqual(unpack(p.recipes, p.extra, p.videos), index);
  assert.deepStrictEqual(p.recipes.r.u, ['/crème/*/', '/recipes/*', '/two-porks-2/', '/*/\t', '/a*b/*\t', '/*']);
  assert.deepStrictEqual(p.extra, { built: '2026-11-17', opens: [[1, 7], [5, 2]] });
  // Without the videos file, the channels and their counts are still there.
  assert.deepStrictEqual(unpack(p.recipes, p.extra).videos, { sources: index.videos.sources, rows: [] });
});

test('an index that would not come back the same is refused, not shipped', () => {
  const broken = small();
  broken.recipes[2][6] = [1, 0, 3]; // says it names sea salt, which isn't among its ingredients
  assert.throws(() => pack(broken), /Two Porks/);
  const video = small();
  video.videos.rows[0][4] = [1, 4]; // rice is not what pork belly is a kind of
  assert.throws(() => pack(video), /Pork Belly Buns/);
});

test('a page that meets a newer format says so instead of guessing', () => {
  const p = pack(small());
  assert.throws(() => unpack({ ...p.recipes, v: 99 }, p.extra), /newer index/);
});

test('slug: the way sites name a recipe’s page', () => {
  assert.equal(slug('Mapo Tofu (麻婆豆腐)'), 'mapo-tofu');
  assert.equal(slug("Grandma's Mac & Cheese!"), 'grandmas-mac-and-cheese');
});

// --- the videos file can't be had ----------------------------------------------------------

test('when the videos file is gone, rows from a different index are never mixed in', async () => {
  const mine = unpack(files.recipes, files.extra);
  const ing = [...mine.ing];
  const gone = () => Promise.reject(new Error('404'));
  // The same index in /index.json (only the videos file was blocked): its rows are used.
  const same = await videoRowsFor(mine, ing, gone, async () => wire(index));
  assert.equal(same.missed, false);
  assert.deepEqual(same.rows, index.videos.rows);
  // A newer index after a deploy: one more ingredient at the front moves every position,
  // so its rows would name the wrong ingredients. The visit goes without videos.
  const newer = wire(index);
  newer.ing.unshift(['zz-new', 'Something new', 1, []]);
  assert.deepEqual(await videoRowsFor(mine, ing, gone, async () => newer), { rows: [], missed: true });
  // A channel added or moved, or another crawl: the same.
  const moved = wire(index);
  moved.videos.sources.reverse();
  assert.equal((await videoRowsFor(mine, ing, gone, async () => moved)).missed, true);
  assert.equal((await videoRowsFor(mine, ing, gone, async () => ({ ...wire(index), crawled: '2099-01-01' }))).missed, true);
  // Neither can be had, or what came back isn't an index: no videos, and nothing thrown.
  assert.deepEqual(await videoRowsFor(mine, ing, gone, gone), { rows: [], missed: true });
  assert.deepEqual(await videoRowsFor(mine, ing, gone, async () => null), { rows: [], missed: true });
  assert.deepEqual(await videoRowsFor(mine, ing, async () => ({ nope: true }), async () => 'x'), { rows: [], missed: true });
  // The usual way still works, and the page's search with no videos is still a search.
  const usual = await videoRowsFor(mine, ing, async () => files.videos, gone);
  assert.deepEqual(usual.rows, index.videos.rows);
  const bare = prepare(mine);
  addVideos(bare, []);
  assert.deepEqual(searchVideos(bare, { ...blank(), q: 'chicken' }), []);
  assert.ok(sameLists(mine, index) && !sameLists(mine, newer) && !sameLists(mine, null));
});
