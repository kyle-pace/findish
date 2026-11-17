import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isNotRecipe } from './not-recipes.mjs';

test('the Asian market shopping list is left out, real recipes are not', () => {
  assert.equal(isNotRecipe('rte', 'https://www.recipetineats.com/asian-market-grocery-store-shopping-list/'), true);
  assert.equal(isNotRecipe('rte', 'https://www.recipetineats.com/spicy-korean-noodle-soup/'), false);
  assert.equal(isNotRecipe('woks', 'https://www.recipetineats.com/asian-market-grocery-store-shopping-list/'), false);
});

test('the built index has no page from the list', () => {
  let index;
  try { index = JSON.parse(readFileSync(new URL('../public/index.json', import.meta.url), 'utf8')); } catch { return; } // not built yet
  const sources = index.sources || index.src || [];
  for (const r of index.recipes) {
    const s = sources[r[0]];
    if (!s) continue;
    assert.equal(isNotRecipe(s.id, r[2].startsWith('http') ? r[2] : s.site + r[2]), false, `${r[1]} is still in the index`);
  }
});
