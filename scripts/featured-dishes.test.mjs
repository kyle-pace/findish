// "Today's dish" in the app is picked from the list scripts/featured-dishes.mjs writes. These
// hold the rules to what they're for: nothing that isn't a dish, only pages with something on
// them, a spread across the world, and a build that fails instead of publishing a thin list.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  kindOf, firstSentence, scoreOf, reasonOut, rotate, readDishes, buildDaily, writeDaily,
  FEATURE_SCORE, CUISINE_GAP, MIN_FEATURED, NOT_A_DISH,
} from './featured-dishes.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const vendor = join(root, 'vendor/explore');
const read = (f) => JSON.parse(readFileSync(join(vendor, 'data', f), 'utf8'));
const listed = (o) => Object.entries(o?.cuisines ?? {}).filter(([, v]) => v?.sites?.length || v?.cookbooks?.length).map(([k]) => k);
const sources = () => ({
  skeleton: read('web/skeleton.json'),
  app: read('web/app.json'),
  intros: read('food_summaries.json'),
  picked: new Set([...listed(read('picks.json')), ...listed(read('suggestions.json'))]),
});

test('the first sentence skips the brackets Wikipedia opens with', () => {
  assert.equal(
    firstSentence("Beurre manié (lit. 'kneaded butter') is a paste, consisting of butter and flour. By kneading…"),
    'Beurre manié is a paste, consisting of butter and flour',
  );
  assert.equal(firstSentence(''), '');
  assert.equal(firstSentence(undefined), '');
});

test('an intro says what the thing is', () => {
  const cases = [
    ["Beurre manié (lit. 'kneaded butter') is a paste, consisting of equal parts butter and flour.", 'paste'],
    ['Ajika is a Georgian and Abkhazian spicy sauce made of peppers.', 'sauce'],
    ['Doubanjiang is a hot and savoury Chinese bean paste made from fermented broad beans.', 'paste'],
    ['Kvass is a fermented, cereal-based, low-alcoholic beverage of cloudy appearance.', 'beverage'],
    ['Black pudding is a type of blood sausage originating in the United Kingdom.', 'sausage'],
    ['Kebab pizza is a Swedish style of pizza topped with kebab meat.', 'pizza'],
    ['Izakaya is a type of informal Japanese bar that serves drinks and snacks.', 'bar'],
    // dishes that mention something that isn't one
    ['Carbonara is a pasta dish made with fatty cured pork, hard cheese, eggs and black pepper.', 'dish'],
    ['A grilled cheese is a hot cheese sandwich made by heating slices of cheese between bread.', 'sandwich'],
    ['Gazpacho is a cold soup and drink made of raw, blended vegetables.', 'soup'],
    ['Adobo is a popular Filipino dish and cooking process in Philippine cuisine.', 'dish'],
    ['Churros are a type of fried dough from Spanish and Portuguese cuisine.', 'dough'],
    // no "is a …" to read
    ['Bibimbap, sometimes romanised as bi bim bap.', ''],
    ['', ''],
  ];
  for (const [intro, kind] of cases) assert.equal(kindOf(intro), kind, intro);
});

test('reading an intro is quick however long or odd it is', () => {
  const odd = ['is a ' + 'type of '.repeat(5000), 'x is a ' + '('.repeat(20000), 'is '.repeat(20000), 'a, '.repeat(30000) + ' is a b'];
  for (const s of odd) {
    const t = performance.now();
    kindOf(s);
    assert.ok(performance.now() - t < 250, `took ${Math.round(performance.now() - t)} ms`);
  }
});

const dish = (over = {}) => ({
  ref: 'dish/x', name: 'X', photo: true, cuisines: ['Thai cuisine'], continent: 'Asian cuisine', ingredients: 5, picked: true,
  intro: 'X is a noodle dish. ' + 'It is cooked in many homes and sold at markets across the country. '.repeat(4),
  ...over,
});

test('a full page scores 6, and each thing missing takes a point', () => {
  assert.equal(scoreOf(dish()), 6);
  assert.equal(scoreOf(dish({ picked: false })), 5);
  assert.equal(scoreOf(dish({ ingredients: 3 })), 5);
  assert.equal(scoreOf(dish({ ingredients: 1 })), 4);
  assert.equal(scoreOf(dish({ intro: 'X is a noodle dish.' })), 5);
  assert.equal(scoreOf(dish({ intro: '', cuisines: [], ingredients: 0, picked: false })), 0);
});

test('what keeps a dish out, in words', () => {
  assert.equal(reasonOut(dish()), '');
  assert.equal(reasonOut(dish({ photo: false })), 'no photo');
  assert.match(reasonOut(dish({ intro: dish().intro.replace('noodle dish', 'thick sauce') })), /a sauce, not a dish/);
  assert.match(reasonOut(dish({ name: 'Mojo (sauce)' })), /named as a sauce/);
  assert.match(reasonOut(dish({ name: 'Curry in the United Kingdom' })), /overview/);
  assert.match(reasonOut(dish({ ingredients: 0, picked: false })), new RegExp(`of ${FEATURE_SCORE}`));
  // named for what's in it, not what it is
  assert.equal(reasonOut(dish({ name: 'Macaroni and cheese' })), '');
  assert.equal(reasonOut(dish({ name: 'Rich tea' })), '');
});

test('the order is the same every time and spreads the world out', () => {
  const pool = [];
  const parts = ['Asian cuisine', 'European cuisine', 'African cuisine'];
  for (let i = 0; i < 90; i++) pool.push(dish({ ref: `dish/d${i}`, name: `D${i}`, continent: parts[i % 3], cuisines: [`C${i % 15}`] }));
  const a = rotate(pool);
  const b = rotate([...pool].reverse());
  assert.deepEqual(a.map((d) => d.ref), b.map((d) => d.ref), 'depends on the order it was given');
  assert.equal(a.length, 90);
  assert.equal(new Set(a.map((d) => d.ref)).size, 90);
  for (let i = 1; i < a.length; i++) {
    assert.notEqual(a[i].continent, a[i - 1].continent, `day ${i} repeats a part of the world`);
    for (let k = 1; k <= CUISINE_GAP && k <= i; k++) assert.notEqual(a[i].cuisines[0], a[i - k].cuisines[0], `day ${i} repeats a cuisine`);
  }
});

test('when one part of the world is all that is left, the list still holds every dish once', () => {
  const pool = Array.from({ length: 12 }, (_, i) => dish({ ref: `dish/a${i}`, continent: 'Asian cuisine', cuisines: ['Thai cuisine'] }));
  const out = rotate(pool);
  assert.equal(new Set(out.map((d) => d.ref)).size, 12);
});

test('the real explorer data: hundreds of dishes, none of them a sauce, a drink or a restaurant', () => {
  const src = sources();
  const { file, counts } = buildDaily(src);
  assert.equal(file.version, 1);
  assert.ok(file.dishes.length >= 365, `only ${file.dishes.length} dishes, under a year of days`);
  assert.equal(counts.featured, file.dishes.length);
  assert.equal(new Set(file.dishes).size, file.dishes.length, 'a dish is listed twice');

  const byRef = new Map(readDishes(src).map((d) => [d.ref, d]));
  for (const ref of file.dishes) {
    const d = byRef.get(ref);
    assert.ok(d, `${ref} isn't a dish in the skeleton`);
    assert.ok(d.photo, `${d.name} has no photo`);
    assert.ok(d.cuisines.length, `${d.name} has no cuisine to name under it`);
    assert.ok(scoreOf(d) >= FEATURE_SCORE || d.name === 'Hot dog', `${d.name} scores ${scoreOf(d)}`);
    assert.ok(!NOT_A_DISH.has(kindOf(d.intro)) || d.name === 'Hot dog', `${d.name} is a ${kindOf(d.intro)}`);
  }
  // The one that started this (2026-11-26), and others like it
  for (const ref of ['dish/beurre-manie']) assert.ok(!file.dishes.includes(ref), `${ref} is featured`);
  for (const name of ['Beurre manié', 'Doubanjiang', 'Marinara sauce', 'Izakaya', 'Masala chai', 'Bayonne ham', 'Korean restaurant']) {
    const d = [...byRef.values()].find((x) => x.name === name);
    if (d) assert.ok(!file.dishes.includes(d.ref), `${name} is featured`);
  }
  // Well-known dishes with full pages stay in
  for (const name of ['Carbonara', 'Lasagna', 'Gazpacho', 'Bouillabaisse']) {
    const d = [...byRef.values()].find((x) => x.name === name);
    if (d && d.photo && scoreOf(d) >= FEATURE_SCORE) assert.ok(file.dishes.includes(d.ref), `${name} was left out: ${reasonOut(d)}`);
  }
  // The same part of the world two days running only where the list runs out of others
  let repeats = 0;
  file.dishes.forEach((ref, i) => { if (i && byRef.get(ref).continent === byRef.get(file.dishes[i - 1]).continent) repeats++; });
  assert.ok(repeats < file.dishes.length * 0.1, `${repeats} days repeat the day before's part of the world`);
  const firstYear = file.dishes.slice(0, 365);
  let early = 0;
  firstYear.forEach((ref, i) => { if (i && byRef.get(ref).continent === byRef.get(firstYear[i - 1]).continent) early++; });
  assert.equal(early, 0, 'the first year repeats a part of the world on days in a row');
});

test('rows that are the wrong shape are skipped, not fatal', () => {
  const src = sources();
  src.skeleton = { ...src.skeleton, nodes: [...src.skeleton.nodes, null, 'x', ['dish/half'], [5, 6, 1]], links: [...src.skeleton.links, [1], 'x', [999999, 2]] };
  const { file } = buildDaily(src);
  assert.ok(file.dishes.length >= MIN_FEATURED);
});

test('thin or missing data fails out loud and writes nothing', () => {
  const src = sources();
  assert.throws(() => buildDaily({ ...src, skeleton: { nodes: src.skeleton.nodes.slice(0, 40), links: [] } }), /can be featured/);
  assert.throws(() => buildDaily({ ...src, app: {} }), /can be featured/);
  assert.throws(() => buildDaily({}), /can be featured/);

  const dir = mkdtempSync(join(tmpdir(), 'daily-'));
  mkdirSync(join(dir, 'src/data/web'), { recursive: true });
  mkdirSync(join(dir, 'out/data/web'), { recursive: true });
  writeFileSync(join(dir, 'src/data/web/skeleton.json'), '{"nodes": [');
  assert.throws(() => writeDaily(join(dir, 'src'), join(dir, 'out')));
  assert.ok(!existsSync(join(dir, 'out/data/web/daily.json')));
});

test('staging the real copy writes the file the app reads', () => {
  const out = mkdtempSync(join(tmpdir(), 'daily-real-'));
  mkdirSync(join(out, 'data/web'), { recursive: true });
  const counts = writeDaily(vendor, out);
  const file = JSON.parse(readFileSync(join(out, 'data/web/daily.json'), 'utf8'));
  assert.equal(file.dishes.length, counts.featured);
  assert.ok(file.dishes.every((r) => typeof r === 'string' && r.startsWith('dish/')));
});
