// The ranking fixture: everyday dish searches against the real index, and what the top of
// each list has to look like. The checks describe the results (a pad thai search starts with
// dishes called pad thai, and no sauce) rather than naming recipes, so a weekly crawl or a
// day's popularity doesn't break them. If one fails, look at the list before changing the
// check:  node -e "…search(ready, { q: 'ramen' })"  or run scripts in the page.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prepare, search } from './search-core.mjs';
import { realIndex } from './test-index.mjs';

const ready = prepare(realIndex());
const blank = () => ({ q: '', with: [], without: [], notWords: [], sites: new Set(), time: 0, cuisine: '', course: '', fresh: false, diet: '' });
const top = (f, n = 3) => search(ready, { ...blank(), ...f }).slice(0, n).map((h) => h.r);
const ing = (id) => ready.ing.findIndex((g) => g[0] === id);

// [what's typed, a pattern each of the top three names must match, a pattern the first name must match]
const DISHES = [
  ['ramen', /ramen/i],
  ['fried rice', /fried rice/i, /^(\w+ )?fried rice$/i],
  ['mapo tofu', /mapo tofu|mabo/i, /^mapo tofu$/i],
  ['pad thai', /pad thai/i, /^(authentic )?pad thai( recipe)?$/i],
  ['dumplings', /dumpling/i],
  ['tacos', /taco/i],
  ['stir fry', /stir[- ]?fry/i],
  ['gyoza', /gyoza/i],
  ['burger', /burger/i],
  ['salad', /salad/i],
  ['pancakes', /pancake/i],
  ['hot pot', /hot ?pot/i],
  ['chicken', /chicken/i],
  ['sourdough', /sourdough/i],
  ['cookies', /cookie/i],
  ['curry', /curry/i],
  ['pizza', /pizza/i],
  ['lasagna', /lasagn/i, /^(homemade |classic )?lasagna$/i],
  ['kimchi', /kimchi/i],
  ['banana bread', /banana bread/i, /^banana bread$/i],
  ['miso soup', /miso soup/i],
  ['teriyaki', /teriyaki/i],
  ['meatballs', /meatball/i],
  ['noodles', /noodle/i],
  ['spring rolls', /spring roll/i],
  // "chile" and "chili" are one word to the search, so chiles rellenos can sit beside a bowl of chili.
  ['chili', /chil[iel]/i],
];

for (const [q, each, first] of DISHES) {
  test(`"${q}": the top three are that dish, not a sauce, a drink or a how-to`, () => {
    const rows = top({ q });
    assert.equal(rows.length, 3, `"${q}" found ${rows.length}`);
    for (const r of rows) {
      assert.match(r.name, each, `"${q}" -> ${rows.map((x) => x.name).join(' | ')}`);
      assert.ok(r.course !== 'sauce' && r.course !== 'drink', `"${q}" has a ${r.course} in the top three: ${r.name}`);
      assert.ok(!/^how to\b/i.test(r.name), `"${q}" has a how-to in the top three: ${r.name}`);
    }
    if (first) assert.match(rows[0].name, first, `"${q}" starts with ${rows[0].name}`);
  });
}

test('a name that is exactly the words comes before longer names that contain them', () => {
  const rows = top({ q: 'mapo tofu' }, 8);
  const exact = rows.findIndex((r) => !/^mapo tofu$/i.test(r.name));
  assert.ok(exact >= 2, rows.map((r) => r.name).join(' | '));
  for (const r of rows.slice(exact)) assert.ok(!/^mapo tofu$/i.test(r.name), 'no exact name after a longer one');
});

test('asking for a sauce, a drink or a how-to brings them back to the top', () => {
  assert.match(top({ q: 'dumpling sauce' })[0].name, /dumpling sauce/i);
  assert.ok(top({ q: 'pad thai sauce' })[0].course === 'sauce');
  assert.ok(top({ q: 'stir fry', course: 'sauce' }).every((r) => r.course === 'sauce'));
  assert.match(top({ q: 'how to cook dumplings' })[0].name, /how to/i);
});

test('"quick chicken and rice": chicken and rice dishes, not a rice ball with chicken in brackets', () => {
  const rows = top({ q: 'chicken and rice', time: 30 }, 3);
  for (const r of rows) {
    assert.match(r.name.replace(/\([^)]*\)/g, ''), /chicken/i, r.name);
    assert.ok(r.min <= 30);
  }
});

test('names with the word come before recipes that only have it as a keyword or an ingredient', () => {
  const hits = search(ready, { ...blank(), q: 'ramen' });
  const firstOther = hits.findIndex((h) => !/ramen/i.test(h.r.name));
  assert.ok(firstOther === -1 || firstOther >= 30, `a recipe without "ramen" in its name is at ${firstOther + 1}`);
  // ...and inside the name beats inside its brackets.
  const bracket = hits.findIndex((h) => !/ramen/i.test(h.r.name.replace(/\([^)]*\)/g, '')));
  assert.ok(bracket >= 15, `a bracketed "ramen" is at ${bracket + 1}`);
});

test('dish words with an ingredient tag: the dish comes first, not whatever needs the fewest things', () => {
  const rows = top({ q: 'fried rice', with: [ing('rice')] }, 5);
  for (const r of rows) assert.match(r.name, /fried rice/i, rows.map((x) => x.name).join(' | '));
});

test('one ingredient tag: dishes made with it, not how to cook it plain', () => {
  const rows = top({ with: [ing('rice')] }, 5);
  for (const r of rows) {
    assert.ok(r.own.length > 2, `${r.name} is just rice`);
    assert.ok(!/^how to\b/i.test(r.name), r.name);
  }
});

test('several ingredient tags: recipes that use the most of them come first', () => {
  const chosen = [ing('chicken-thighs'), ing('rice'), ing('ginger')];
  const hits = search(ready, { ...blank(), with: chosen });
  for (let i = 1; i < 40; i++) assert.ok(hits[i - 1].used.length >= hits[i].used.length, `position ${i}`);
  assert.equal(hits[0].used.length, 3);
});

test('creators take turns at the top of a broad search', () => {
  const sources = new Set(top({ q: 'chicken' }, 8).map((r) => r.src.id));
  assert.ok(sources.size >= 4, [...sources].join(' '));
});

test('a site that posted a dish twice under one name shows it once', () => {
  const seen = new Set();
  for (const r of ready.recipes) {
    const key = `${r.src.id}|${r.name.toLowerCase()}`;
    assert.ok(!seen.has(key), r.name);
    seen.add(key);
  }
});

test('cuisines: a dish from elsewhere is not filed under its site’s usual cuisine', () => {
  const htk = (name) => ready.recipes.find((r) => r.src.id === 'htk' && r.name === name);
  if (htk('Mapo Tofu')) assert.equal(htk('Mapo Tofu').cuisine, 'Chinese');
  const sudachi = ready.recipes.find((r) => r.src.id === 'sudachi' && /^Japanese Style Mapo Tofu/.test(r.name));
  if (sudachi) assert.equal(sudachi.cuisine, 'Japanese');
  const names = ready.index.cuisines.map(([c]) => c);
  for (const bad of ['Snanish', 'Span', 'Brit', 'Christmas', 'Dog Food']) assert.ok(!names.includes(bad) && !ready.recipes.some((r) => r.cuisine === bad), bad);
});
