import test from 'node:test';
import assert from 'node:assert/strict';
import { words } from './search-core.mjs';
import { knownTerm } from './known-term.mjs';

const lists = {
  norm: (t) => words(t).join(' '),
  dishes: ['mapo tofu', 'tacos', 'pad thai'],
  ingredients: [{ id: 'tofu', names: ['Tofu', 'bean curd'] }, { id: 'green-onions', names: ['Green onions', 'scallions'] }],
  cuisines: ['Thai', 'Korean'],
  creators: [{ id: 'woks', name: 'The Woks of Life' }],
};

test('a search that is exactly a listed dish, ingredient, cuisine or creator gives the list’s own entry', () => {
  assert.deepEqual(knownTerm('Mapo Tofu', lists), { kind: 'dish', term: 'mapo tofu' });
  assert.deepEqual(knownTerm('taco', lists), { kind: 'dish', term: 'tacos' });
  assert.deepEqual(knownTerm('scallions', lists), { kind: 'ingredient', term: 'green-onions' });
  assert.deepEqual(knownTerm(' thai ', lists), { kind: 'cuisine', term: 'Thai' });
  assert.deepEqual(knownTerm('the woks of life', lists), { kind: 'creator', term: 'woks' });
});

test('anything else gives nothing, so what was typed is never sent', () => {
  for (const q of ['', '   ', 'mapo tofu for my mom', 'kyle@example.com', '206 555 0100', 'low sodium dinner after surgery', 'tofu tacos', 'xyzzy'])
    assert.equal(knownTerm(q, lists), null, q);
});

test('what comes back is always a value from the lists, never the typed text', () => {
  const out = knownTerm('MAPO   TOFU!!', lists);
  assert.equal(out.term, lists.dishes[0]);
});
