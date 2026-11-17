import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { firstSentence, buildNotes, slug } from './world-cuisine.mjs';

// Real summaries from World cuisine's data (saved 2026-11-16).
const real = JSON.parse(readFileSync(new URL('./samples/world-cuisine-summaries.json', import.meta.url), 'utf8'));

test('a real summary comes down to its first sentence, without bracketed asides', () => {
  assert.equal(
    firstSentence(real['Thai cuisine']),
    'Thai cuisine, the national cuisine of Thailand and of Thai people, places emphasis on lightly prepared dishes with aromatics and spicy heat.',
  );
  assert.equal(firstSentence(real.Ginger), 'Ginger is a flowering plant whose rhizome, ginger root or ginger, is widely used as a spice and a folk medicine.');
  assert.match(firstSentence(real.Abbacchio), /^Abbacchio is an Italian preparation of lamb typical of the Roman cuisine\.$/);
  for (const s of Object.values(real)) assert.ok(!/[()[\]]/.test(firstSentence(s)));
});

test('broken or empty text gives no sentence rather than a broken one', () => {
  assert.equal(firstSentence(undefined), '');
  assert.equal(firstSentence(''), '');
  assert.equal(firstSentence('Too short.'), '');
  assert.equal(firstSentence('<html><body>502 Bad Gateway'), '');
  assert.equal(firstSentence('x'.repeat(500) + '.'), '');
});

test('notes key cuisines by short name and ingredients by catalog id, only on a name match', () => {
  const notes = buildNotes({
    cuisines: { cuisines: [{ id: 'Thai cuisine', name: 'Thai cuisine', url: 'https://en.wikipedia.org/wiki/Thai_cuisine' }] },
    summaries: { 'Thai cuisine': real['Thai cuisine'] },
    food: { ingredients: [{ id: 'Ginger', name: 'Ginger', title: 'Ginger' }] },
    foodSummaries: { Ginger: real.Ginger, 'Agaricus bisporus': 'Agaricus bisporus is an edible basidiomycete mushroom native to grasslands in Eurasia.' },
    catalogLinks: { links: { Ginger: { id: 'ginger', name: 'Ginger' }, 'Agaricus bisporus': { id: 'mushrooms', name: 'Mushrooms' } } },
  });
  assert.equal(notes.cuisines.thai.page, 'https://kylepace.dev/world-cuisine/cuisine/thai-cuisine/');
  assert.equal(notes.ingredients.ginger.page, 'https://kylepace.dev/world-cuisine/ingredient/ginger/');
  assert.equal(notes.ingredients.mushrooms, undefined); // a broader link, not the same thing
  assert.equal(slug('Crème brûlée'), 'creme-brulee');
});
