// What a recipe has in it that some people leave out (scripts/diet.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ALL, DAIRY, EGG, FISH, GROUPS, MEAT, NUTS, OTHER, PORK, SHELLFISH, VEGAN, VEGETARIAN, itemFlags, titleFlags, wordFlags } from './diet.mjs';

const has = (flags, bit) => (flags & bit) !== 0;

test('a name with meat or fish in it is not vegetarian, whatever the ingredient list matched', () => {
  for (const name of ['Korean Fried Chicken (Dakgangjeong)', 'Linguine with Clams', 'Everyday Meatballs', 'Roast Goose with Orange & Five Spice', 'Swordfish Teriyaki Recipe', 'Barbecue St. Louis Pork Ribs'])
    assert.ok(has(titleFlags(name), VEGETARIAN), name);
});

test('plant versions and lookalikes are not flagged', () => {
  for (const name of [
    'Chinese Vegetarian Duck (素鸭)',
    'Spicy King Oyster Mushroom Stir-fry',
    'Shortcut Vegan General Tso’s “Chicken”',
    'Sesame Crusted Tofu Steaks with Teriyaki Sauce',
    'Daikon Steak',
    'Corn ribs',
    'How to Make Duck Sauce',
    'Taiyaki (Japanese Fish Shaped Waffle)',
    'Hen of the Woods Stir-Fry',
    'Sichuan Yuxiang Eggplant (Fish-Fragrant Eggplant)',
  ])
    assert.ok(!has(titleFlags(name), VEGETARIAN), name);
});

test('ingredient lines the catalog did not match are read by their words', () => {
  assert.ok(has(wordFlags('chicken bouillon powder', { line: true }), MEAT));
  assert.ok(has(wordFlags('pork stock', { line: true }), PORK));
  assert.ok(has(wordFlags('bonito flakes', { line: true }), FISH));
  assert.ok(has(wordFlags('dried shrimp', { line: true }), SHELLFISH));
  assert.ok(has(wordFlags('gelatine sheets', { line: true }), MEAT));
  assert.ok(has(wordFlags('stock', { line: true }), MEAT), 'a bare stock is usually meat');
  assert.equal(wordFlags('vegetable stock', { line: true }) & VEGETARIAN, 0);
  assert.equal(wordFlags('kombu dashi', { line: true }) & VEGETARIAN, 0);
  assert.equal(wordFlags('vegetarian oyster sauce', { line: true }) & VEGETARIAN, 0);
  assert.equal(wordFlags('plant-based minced meat', { line: true }) & VEGETARIAN, 0);
});

test('dairy, eggs and honey are flagged for vegan, but not their plant namesakes', () => {
  assert.ok(has(wordFlags('vanilla ice cream'), DAIRY));
  assert.ok(has(wordFlags('white chocolate and milk'), DAIRY));
  assert.ok(has(wordFlags('egg yolks'), EGG));
  assert.ok(has(wordFlags('kewpie mayo'), EGG));
  assert.ok(has(wordFlags('honey'), OTHER));
  for (const line of ['coconut milk', 'coconut cream', 'cream of tartar', 'oat milk', 'cocoa butter', 'butter beans', 'eggplant', 'dairy-free butter', 'egg-free mayo'])
    assert.equal(wordFlags(line) & VEGAN, 0, line);
  assert.equal(titleFlags('Vegan Chocolate Peanut Butter Silk Tart') & VEGAN, 0);
});

test('nuts count even inside a plant milk or butter; a water chestnut is not a nut', () => {
  assert.ok(has(wordFlags('peanut butter'), NUTS));
  assert.equal(wordFlags('peanut butter') & DAIRY, 0);
  assert.ok(has(wordFlags('almond milk'), NUTS));
  assert.ok(has(wordFlags('toasted pine nuts'), NUTS));
  assert.equal(wordFlags('water chestnuts') & NUTS, 0);
  assert.equal(wordFlags('nutmeg') & NUTS, 0);
  assert.equal(wordFlags('butternut squash') & NUTS, 0);
});

test('catalog items are flagged by their shelf, their id and their parents', () => {
  assert.equal(itemFlags(['pork-belly', 'pork'], { section: 'meat' }), MEAT | PORK);
  assert.equal(itemFlags(['chicken-thighs', 'chicken'], { section: 'meat' }), MEAT);
  assert.equal(itemFlags(['abalone', 'shellfish', 'seafood'], { section: 'seafood' }), FISH | SHELLFISH);
  assert.equal(itemFlags(['salmon', 'fish', 'seafood'], { section: 'seafood' }), FISH);
  assert.equal(itemFlags(['oyster-sauce'], { section: 'international' }), FISH | SHELLFISH);
  assert.equal(itemFlags(['vegetarian-oyster-sauce'], { section: 'international' }), 0);
  assert.equal(itemFlags(['fish-sauce'], { section: 'international' }), FISH);
  assert.equal(itemFlags(['lard'], { section: 'pantry' }), MEAT | PORK);
  assert.equal(itemFlags(['butter'], { section: 'dairy-eggs' }), DAIRY);
  assert.equal(itemFlags(['eggs'], { section: 'dairy-eggs' }), EGG);
  assert.equal(itemFlags(['soy-milk', 'plant-milk'], { section: 'dairy-eggs' }), 0);
  assert.equal(itemFlags(['coconut-milk'], { section: 'pantry' }), 0);
  assert.equal(itemFlags(['peanut-butter'], { section: 'pantry' }), NUTS);
  assert.equal(itemFlags(['almonds', 'nuts'], { section: 'pantry' }), NUTS);
  assert.equal(itemFlags(['honey'], { section: 'pantry' }), OTHER);
  assert.equal(itemFlags(['king-oyster-mushrooms'], { section: 'produce' }), 0);
  assert.equal(itemFlags(['tofu'], { section: 'produce' }), 0);
});

test('the groups a search can leave out each have an id, a name and one flag', () => {
  assert.deepEqual(GROUPS.map((g) => g[0]), ['any-dairy', 'any-egg', 'any-nuts', 'any-shellfish', 'any-pork', 'any-meat', 'any-seafood']);
  for (const [, name, flag] of GROUPS) assert.ok(name && flag > 0 && flag < ALL && (flag & (flag - 1)) === 0);
  assert.ok(!GROUPS.some((g) => /gluten/i.test(g.join(' '))), 'gluten is left out on purpose');
});
