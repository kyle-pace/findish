import test from 'node:test';
import assert from 'node:assert/strict';
import { dishPhrases } from './phrases.mjs';

const names = [
  'Mapo Tofu',
  'Easy Mapo Tofu',
  'Vegan Mapo Tofu (麻婆豆腐)',
  'Chicken Stir Fry',
  'Chicken Stir-Fry with Broccoli',
  'Best Chicken Stir Fry',
  'Beef Stir Fry',
  'Tofu Stir Fry',
  'Shrimp Stir Fry',
  'Dumplings',
  'Pork Dumpling Soup',
  'Pork Dumplings Soup',
  'Pork Dumplings Soup',
  "Dad's Steamed Fish",
  "Dad's Steamed Fish Two",
  "Dad's Steamed Fish Three",
  'Soup with Pork',
  'Soup with Pork',
  'Soup with Pork',
];

test('phrases are runs of two or three words that several names share, most common first', () => {
  const p = dishPhrases(names);
  assert.equal(p[0], 'stir fry');
  assert.ok(p.includes('mapo tofu'));
  assert.ok(p.includes('chicken stir fry'));
});

test('filler, pieces of longer phrases, possessives and "with" descriptions are left out', () => {
  const p = dishPhrases(names);
  assert.ok(!p.some((x) => /easy|best/.test(x)), p.join('|'));
  assert.ok(!p.includes('chicken stir'), 'a piece of "chicken stir fry"');
  assert.ok(!p.some((x) => x.includes('dad')), p.join('|'));
  assert.ok(!p.includes('soup with pork'));
});

test('plural and singular are one phrase, written the way most names write it', () => {
  const p = dishPhrases(names);
  assert.deepEqual(p.filter((x) => x.startsWith('pork dumpling')), ['pork dumplings soup']);
});

test('a phrase needs `min` names, and the list stops at `max`', () => {
  assert.deepEqual(dishPhrases(['Mapo Tofu', 'Mapo Tofu Two']), []);
  assert.equal(dishPhrases(names, { max: 2 }).length, 2);
});

// Names the way sites write them, as [name, creator]. Before these rules the search box
// offered "beef chow" and "chinese restaurant" as dishes.
const real = [
  ['Beef Chow Fun', 'woks'], ['Beef Chow Fun (Pan-Fried)', 'htk'], ['Easy Beef Chow Fun', 'rte'], ['Beef Chow Mein', 'woks'],
  ['Chinese Restaurant Style Fried Rice', 'woks'], ['Chinese Restaurant Fried Rice', 'rte'], ['Chinese Restaurant Chicken and Broccoli', 'woks'], ['Chinese Restaurant Wonton Soup', 'woks'],
  ['Egg Fried Rice', 'woks'], ['Fried Rice', 'rte'], ['Kimchi Fried Rice', 'maangchi'],
  ['Stir Fried Bok Choy', 'woks'], ['Stir Fried Pork', 'htk'], ['Stir Fried Tofu Skin', 'rte'],
  ['Soy Sauce Chicken', 'woks'], ['Cantonese Soy Sauce Chicken', 'rte'], ['Easy Soy Sauce Chicken', 'htk'], ['Oyster Sauce Chicken', 'woks'],
  ['Sweet and Sour Pork', 'woks'], ['Sweet and Sour Pork with Pineapple', 'rte'], ['Crispy Sweet and Sour Pork', 'htk'],
  ['Pocket Pie Reloaded', 'rte'], ['Cheese Pocket Pie Reloaded', 'rte'], ['Beef Pocket Pie Reloaded', 'rte'],
  ['Wonton Soup', 'woks'], ['Wonton Soup with Greens', 'rte'], ['Shrimp Wonton Soup', 'htk'],
  ['Pork Belly Bao', 'woks'], ['Braised Pork Belly', 'woks'], ['Crispy Pork Belly', 'woks'], ['Pork Belly with Rice', 'woks'], ['Red Pork Belly', 'woks'], ['Twice Cooked Pork Belly', 'woks'],
];

test('a phrase that is always the start of a longer name is not a dish: "beef chow", "stir fried"', () => {
  const p = dishPhrases(real);
  assert.ok(p.includes('beef chow fun'), p.join('|'));
  assert.ok(!p.includes('beef chow'), 'always followed by "fun" or "mein"');
  assert.ok(!p.includes('stir fried'), 'always followed by what was fried');
  assert.ok(p.includes('fried rice') && p.includes('wonton soup'), p.join('|'));
});

test('a series title is not a dish: "chinese restaurant", and one site’s "pocket pie reloaded"', () => {
  const p = dishPhrases(real);
  assert.ok(!p.some((x) => x.includes('restaurant')), p.join('|'));
  assert.ok(!p.some((x) => x.includes('pocket') || x.includes('reloaded')), 'three names, all from one creator');
});

test('the back half of a name is not a dish: "sauce chicken", "sour pork"', () => {
  const p = dishPhrases(real);
  assert.ok(p.includes('soy sauce chicken'), p.join('|'));
  assert.ok(!p.includes('sauce chicken'), 'nearly always after "soy"');
  assert.ok(!p.includes('sour pork'), 'always after "sweet and"');
});

test('one creator alone is enough when they have six names for it', () => {
  assert.ok(dishPhrases(real).includes('pork belly'));
  assert.ok(!dishPhrases(real, { minOne: 7 }).includes('pork belly'));
});

test('the real index offers dishes, not pieces of them', async () => {
  const { realIndex } = await import('../src/lib/test-index.mjs');
  const p = realIndex().phrases;
  for (const dish of ['fried rice', 'mapo tofu', 'pad thai', 'beef chow fun', 'kung pao chicken', 'wonton soup', 'chow mein']) assert.ok(p.includes(dish), dish);
  for (const piece of ['beef chow', 'chinese restaurant', 'stir fried', 'kung pao', 'oven baked', 'deep fried', 'sauce chicken', 'thai green', 'sweet and sour', 'chinese fried', 'bento box'])
    assert.ok(!p.includes(piece), piece);
});
