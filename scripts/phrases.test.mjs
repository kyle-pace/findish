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
