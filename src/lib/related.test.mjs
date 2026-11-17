// The "Related:" line under a dish search (src/lib/related.mjs), against the real index.
// The checks describe what a related dish is rather than naming the list, so a weekly
// crawl doesn't break them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prepare, queryWords, search, words } from './search-core.mjs';
import { relatedDishes } from './related.mjs';
import { realIndex } from './test-index.mjs';

const index = realIndex();
const ready = prepare(index);
const blank = () => ({ q: '', with: [], without: [], notWords: [], sites: new Set(), time: 0, cuisine: '', course: '', fresh: false, diet: '', exact: false, show: '' });
const related = (q) => relatedDishes(ready, index.phrases, search(ready, { ...blank(), q }), queryWords(ready, q).words);
/** The cuisine most recipes named for a dish are filed under. */
const cuisineOf = (dish) => {
  const key = ` ${words(dish).join(' ')} `;
  const tally = new Map();
  for (const r of ready.recipes) if (r.phrase.includes(key) && r.cuisine) tally.set(r.cuisine, (tally.get(r.cuisine) || 0) + 1);
  return [...tally].sort((a, b) => b[1] - a[1])[0]?.[0];
};

test('fried rice is not related to chongqing chicken, cumin lamb or wonton soup', () => {
  // What the line said before: dishes that only shared soy sauce and green onion with it.
  const got = related('fried rice');
  for (const not of ['chongqing chicken', 'cumin lamb', 'wonton soup']) assert.ok(!got.includes(not), got.join(', '));
  for (const d of got) assert.ok(/rice/.test(d), `${d} shares no dish word with fried rice`);
});

test('a dish that shares its word is offered: curries for a curry, chicken dishes for kung pao chicken', () => {
  for (const [q, word] of [['green curry', 'curry'], ['red curry', 'curry'], ['kung pao chicken', 'chicken'], ['wonton soup', /soup|wonton/], ['teriyaki chicken', /teriyaki|chicken/]]) {
    const got = related(q);
    assert.ok(got.length >= 2, `${q}: ${got.join(', ')}`);
    for (const d of got) assert.match(d, new RegExp(word), `${q} -> ${d}`);
  }
});

test('related dishes are from the cuisine the results share', () => {
  for (const [q, cuisine] of [['green curry', 'Thai'], ['kung pao chicken', 'Chinese'], ['miso soup', 'Japanese'], ['mapo tofu', 'Chinese'], ['wonton soup', 'Chinese']])
    for (const d of related(q)) assert.equal(cuisineOf(d), cuisine, `${q} -> ${d}`);
});

test('how a dish is cooked, the cuisine’s name, or a pantry staple is not enough', () => {
  // "thai" in pad thai must not bring every "Thai …" dish; scallion pancakes share only
  // flour and sesame with sesame chicken; "stir fry" and "fried" say how, not what.
  assert.ok(!related('pad thai').some((d) => /^thai /.test(d)), related('pad thai').join(', '));
  assert.deepEqual(related('scallion pancakes'), []);
  assert.deepEqual(related('stir fry'), []);
});

test('the search’s own dish is never offered, and one word or a thin list gets no line', () => {
  for (const q of ['fried rice', 'green curry', 'wonton soup', 'mapo tofu']) for (const d of related(q)) assert.ok(!words(q).every((w) => words(d).includes(w)), `${q} -> ${d}`);
  assert.deepEqual(related('xyzzy'), []);
  assert.deepEqual(relatedDishes(ready, index.phrases, search(ready, { ...blank(), q: 'mapo tofu' }), []), []);
  assert.deepEqual(relatedDishes(ready, [], search(ready, { ...blank(), q: 'mapo tofu' }), ['mapo', 'tofu']), []);
});
