// The Discover page's collections (src/lib/collections.mjs): the rules on a small made-up
// index, then the real index with checks loose enough to survive a weekly crawl.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildCollections, thanksgiving, weekOf, MAX_PER_CREATOR, COLLECTIONS } from './collections.mjs';
import { realIndex } from './test-index.mjs';

const catalog = JSON.parse(readFileSync(new URL('../../vendor/kitchen-catalog/catalog.json', import.meta.url), 'utf8'));

test('Thanksgiving is the fourth Thursday of November', () => {
  assert.equal(thanksgiving(2026).toISOString().slice(0, 10), '2026-11-26');
  assert.equal(thanksgiving(2027).toISOString().slice(0, 10), '2027-11-25');
  assert.equal(thanksgiving(2029).toISOString().slice(0, 10), '2029-11-22');
});

test('weeks run Monday to Sunday', () => {
  assert.equal(weekOf(new Date('2026-11-22T12:00:00Z')), '2026-W47'); // a Sunday
  assert.equal(weekOf(new Date('2026-11-23T12:00:00Z')), '2026-W48');
  assert.equal(weekOf(new Date('2027-01-01T12:00:00Z')), '2026-W53');
});

// A made-up index: two sources, a few ingredients, rows in the index's own shape.
const ing = [['rice', 'Rice', 0, []], ['eggs', 'Eggs', 0, []], ['chicken', 'Chicken', 0, []], ['soy-sauce', 'Soy sauce', 0, []]];
const row = (src, name, minutes, own, extra = {}) => {
  const r = [src, name, `/${name.toLowerCase().replace(/\W+/g, '-')}/`, minutes, '', own, own, extra.img ?? 'https://x/p.jpg', '', extra.opens ?? 0, extra.course ?? 'main', ''];
  return r;
};
const tiny = (recipes) => ({ built: '2026-11-22', sources: [{ id: 'a', name: 'Cook A', site: 'https://a.test' }, { id: 'b', name: 'Cook B', site: 'https://b.test' }], ing, fresh: [], recipes });
const only = (c, idx, date) => buildCollections(idx, catalog, { collections: [{ id: 't', title: 'T', blurb: '', min: 1, ...c }], date }).shelves[0];

test('words match whole words only, and notWords keep things out', () => {
  const idx = tiny([row(0, 'Chicken Curry', 30, [2]), row(0, 'Curry Powder', 5, []), row(1, 'Curryish Rice', 20, [0])]);
  const s = only({ words: ['curry'], notWords: ['curry powder'] }, idx);
  assert.deepEqual(s.rows.map((r) => r.name), ['Chicken Curry']);
});

test('time, ingredient count and course rules', () => {
  const idx = tiny([
    row(0, 'Fast', 20, [0, 1]),
    row(0, 'Slow', 90, [0]),
    row(0, 'No time', 0, [0]),
    row(1, 'Busy', 10, [0, 1, 2, 3]),
    row(1, 'Dessert', 10, [1], { course: 'dessert' }),
  ]);
  const s = only({ maxMinutes: 30, maxOwn: 3, courses: ['main'] }, idx);
  assert.deepEqual(s.rows.map((r) => r.name), ['Fast']);
});

test('staples: everything beyond the basics is on hand, and there are at least two things', () => {
  const idx = tiny([row(0, 'Egg Fried Rice', 15, [0, 1, 3]), row(0, 'Chicken Rice', 15, [0, 2]), row(1, 'Plain Rice', 15, [0])]);
  const s = only({ staples: true }, idx);
  assert.deepEqual(s.rows.map((r) => r.name), ['Egg Fried Rice']);
});

test('no creator gets more than its share, pins come first and blocks stay out', () => {
  const recipes = [...Array(6)].map((_, i) => row(0, `A dish ${i}`, 10, [0])).concat([row(1, 'B dish', 10, [0])]);
  const idx = tiny(recipes);
  const s = only({ courses: ['main'] }, idx);
  assert.equal(s.rows.filter((r) => r.source === 'a').length, MAX_PER_CREATOR);
  const pinned = only({ courses: ['main'], pin: ['b:/b-dish/'], block: ['a:/a-dish-0/'] }, idx);
  assert.equal(pinned.rows[0].name, 'B dish');
  assert.ok(!pinned.rows.some((r) => r.name === 'A dish 0'));
});

test('a shelf with too few recipes is not shown', () => {
  const idx = tiny([row(0, 'Chicken Curry', 30, [2])]);
  assert.equal(buildCollections(idx, catalog, { collections: [{ id: 't', title: 'T', words: ['curry'] }] }).shelves.length, 0);
});

test('a shelf holds still within a week and changes from week to week', () => {
  const recipes = [...Array(40)].map((_, i) => row(i % 2, `Dish ${i}`, 10, [0]));
  const idx = tiny(recipes);
  const c = { courses: ['main'], show: 2 };
  const mon = only(c, idx, new Date('2026-11-23T12:00:00Z')).rows.map((r) => r.key);
  const fri = only(c, idx, new Date('2026-11-27T12:00:00Z')).rows.map((r) => r.key);
  assert.deepEqual(mon, fri);
  const later = [...Array(8)].map((_, w) => only(c, idx, new Date(Date.UTC(2026, 11, 7 + w * 7, 12))).rows.map((r) => r.key).join());
  assert.ok(new Set(later).size > 1);
});

test('seasonal and dated shelves come and go with the date', () => {
  const idx = tiny([...Array(8)].map((_, i) => row(i % 2, `Roasted Squash ${i}`, 30, [0])).concat([...Array(8)].map((_, i) => row(i % 2, `Tomato Salad ${i}`, 10, [0]))));
  const season = { id: 's', season: true, min: 1 };
  assert.match(buildCollections(idx, catalog, { collections: [season], date: new Date('2026-11-01T12:00:00Z') }).shelves[0].rows[0].name, /Squash/);
  assert.match(buildCollections(idx, catalog, { collections: [season], date: new Date('2026-07-01T12:00:00Z') }).shelves[0].rows[0].name, /Tomato/);
  const tg = COLLECTIONS.find((c) => c.id === 'thanksgiving');
  assert.ok(tg.when(new Date('2026-11-22T12:00:00Z')));
  assert.ok(!tg.when(new Date('2026-11-27T12:00:00Z')));
  assert.ok(!tg.when(new Date('2026-10-30T12:00:00Z')));
});

test('a bad row (no ingredients, no time) is skipped, not fatal', () => {
  const r = row(0, 'Odd Curry', 0, []);
  r[5] = [];
  r[6] = [];
  const idx = tiny([r, row(1, 'Good Curry', 20, [0])]);
  const s = only({ words: ['curry'], maxOwn: 5 }, idx);
  assert.deepEqual(s.rows.map((x) => x.name), ['Good Curry']);
});

test('on the real index every shelf is full, varied and fits its own rules', () => {
  const index = realIndex();
  const { shelves } = buildCollections(index, catalog);
  assert.ok(shelves.length >= 5, `only ${shelves.length} shelves`);
  for (const s of shelves) {
    assert.ok(s.rows.length >= 4, `${s.id} has ${s.rows.length}`);
    assert.equal(new Set(s.rows.map((r) => r.key)).size, s.rows.length, `${s.id} repeats a recipe`);
    if (s.id !== 'spotlight') {
      const per = new Map();
      for (const r of s.rows) per.set(r.source, (per.get(r.source) || 0) + 1);
      assert.ok(Math.max(...per.values()) <= MAX_PER_CREATOR, `${s.id} leans on one creator`);
    }
    for (const r of s.rows) assert.match(r.url, /^https:\/\//);
  }
  const curries = shelves.find((s) => s.id === 'curries');
  if (curries) for (const r of curries.rows) assert.ok(r.minutes > 0 && r.minutes <= 45, `${r.name} takes ${r.minutes}`);
});

test('"See all" holds every recipe on the shelf, the shown ones first, then creators taking turns', () => {
  const recipes = [...Array(10)].map((_, i) => row(0, `A dish ${i}`, 10, [0])).concat([...Array(3)].map((_, i) => row(1, `B dish ${i}`, 10, [0])));
  const s = only({ courses: ['main'], show: 2 }, tiny(recipes));
  assert.equal(s.keys.length, 13);
  assert.equal(new Set(s.keys).size, 13);
  assert.deepEqual(s.keys.slice(0, 2), s.rows.map((r) => r.key));
  // After the shelf's own, the next few alternate rather than running through one creator.
  const next = s.keys.slice(2, 6).map((k) => k[0]);
  assert.ok(next.includes('a') && next.includes('b'));
});
