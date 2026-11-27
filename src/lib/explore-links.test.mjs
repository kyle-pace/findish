// A dish page under /explore/ offers "Find recipes" only for a dish finDish has recipes for.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dishesWithRecipes, norm, MIN } from './explore-links.mjs';
import { realIndex } from './test-index.mjs';

test('a dish counts when its whole name is in enough recipe names', () => {
  const names = ['Easy Bibimbap', 'Bibimbap Bowls', 'Dolsot bibimbap (stone pot)', 'Fried Rice', 'Egg Fried Rice', 'Rice Pudding', 'Crêpes Suzette', 'Crepe Suzette for two', 'crepes suzette'];
  const out = dishesWithRecipes(names, [
    { ref: 'dish/bibimbap', name: 'Bibimbap' },
    { ref: 'dish/fried-rice', name: 'Fried rice' }, // two names only
    { ref: 'dish/crepes-suzette', name: 'Crêpes Suzette' }, // accents and plurals fold
    { ref: 'dish/rice-fried', name: 'Rice fried' }, // the words, out of order
    { ref: 'dish/bibimbap-2', name: 'Bibimbap (dish)' }, // the same name again
  ]);
  assert.deepEqual(out, { 'dish/bibimbap': { name: 'Bibimbap', count: 3 }, 'dish/crepes-suzette': { name: 'Crêpes Suzette', count: 3 } });
  assert.equal(norm('Crêpes Suzette'), norm('crepe suzette'));
  assert.equal(MIN, 3);
});

test('rows that are the wrong shape, and names with no words, are skipped', () => {
  assert.deepEqual(dishesWithRecipes(['a', 'b'], [null, {}, { ref: 'dish/x', name: '???' }, { ref: 7, name: 'Pie' }]), {});
  assert.deepEqual(dishesWithRecipes([], [{ ref: 'dish/pie', name: 'Pie' }]), {});
});

test('the real index and the real explorer: hundreds of dishes, each one findable', () => {
  const index = realIndex();
  const skeleton = JSON.parse(readFileSync(fileURLToPath(new URL('../../vendor/explore/data/web/skeleton.json', import.meta.url)), 'utf8'));
  const dishes = skeleton.nodes.filter((n) => n[2] === 1).map((n) => ({ ref: n[0], name: n[1] }));
  const out = dishesWithRecipes(index.recipes.map((r) => r[1]), dishes);
  const n = Object.keys(out).length;
  assert.ok(n > 150 && n < dishes.length, `${n} of ${dishes.length} dishes have recipes`);
  assert.ok(out['dish/bibimbap'], 'bibimbap has recipes here');
  for (const [ref, d] of Object.entries(out)) {
    assert.match(ref, /^dish\/[a-z0-9-]+$/);
    assert.ok(d.count >= MIN && d.name && !/[()]/.test(d.name), `${ref}: ${JSON.stringify(d)}`);
  }
});
