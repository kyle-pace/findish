// Which cuisine a recipe is filed under (scripts/cuisine.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cuisineInName, cuisineOf, foldCuisine } from './cuisine.mjs';

test('labels as sites write them fold into one name', () => {
  assert.equal(foldCuisine('American/Chinese'), 'Chinese American');
  assert.equal(foldCuisine('Italian-esque'), 'Italian');
  assert.equal(foldCuisine('Thai-ish'), 'Thai');
  assert.equal(foldCuisine('Greek(ish)'), 'Greek');
  assert.equal(foldCuisine('French-style'), 'French');
  assert.equal(foldCuisine('Portuguese inspired'), 'Portuguese');
  assert.equal(foldCuisine('Modern Vietnamese'), 'Vietnamese');
  assert.equal(foldCuisine('lebanese'), 'Lebanese');
  assert.equal(foldCuisine('Taiwanese/Chinese'), 'Taiwanese');
});

test('typos are fixed, and "ish" is only cut when it was added', () => {
  assert.equal(foldCuisine('Snanish'), 'Spanish');
  assert.equal(foldCuisine('Turkish Cuisine'), 'Turkish');
  assert.equal(foldCuisine('Thai Recipes'), 'Thai');
  assert.equal(foldCuisine('Turkish Regional Cuisine - Antakya Cuisine'), 'Turkish');
  assert.equal(foldCuisine('asian fusioin'), 'Asian');
  assert.equal(foldCuisine('Spanish'), 'Spanish');
  assert.equal(foldCuisine('British'), 'British');
  assert.equal(foldCuisine('Turkish'), 'Turkish');
});

test('labels that are not a cuisine leave the recipe without one', () => {
  for (const label of ['Christmas', 'Dog Food', 'Baking', 'Desserts', 'Any flavour you want!', '']) assert.equal(foldCuisine(label), '', label);
});

test('a site’s usual cuisine does not override a name that leads with another', () => {
  assert.equal(cuisineOf('Thai', 'Thai', 'Filipino Chicken Adobo'), 'Filipino');
  assert.equal(cuisineOf('Thai', 'Thai', 'Nasi Goreng (Indonesian Fried Rice) Recipe'), 'Indonesian');
  assert.equal(cuisineOf('Thai', 'Thai', 'Pancit Canton - Filipino Egg Noodle Stir-Fry'), 'Filipino');
  assert.equal(cuisineOf('Thai', 'Thai', 'Japanese Curry from Scratch!'), 'Japanese');
  assert.equal(cuisineOf('Thai', 'Thai', 'Mapo Tofu'), 'Chinese');
  assert.equal(cuisineOf('', 'Thai', 'Mapo Tofu'), 'Chinese');
});

test('...but a cuisine that only describes an ingredient is not the dish’s cuisine', () => {
  assert.equal(cuisineOf('Thai', 'Thai', 'Chinese Sausage Fried Rice ข้าวผัดกุนเชียง'), 'Thai');
  assert.equal(cuisineOf('Thai', 'Thai', 'Gai Lan Oyster Sauce Stir-Fry (Chinese Broccoli)'), 'Thai');
  assert.equal(cuisineOf('Thai', 'Thai', 'American Fried Rice ข้าวผัดอเมริกัน'), 'Thai');
  assert.equal(cuisineOf('Japanese', 'Japanese', 'Chinese Cabbage and Apple Salad'), 'Japanese');
  assert.equal(cuisineOf('Thai', 'Thai', 'Pad Thai'), 'Thai');
  assert.equal(cuisineInName('Lychee Fried Rice w/ Chinese BBQ Pork'), '');
});

test('a name that says the site’s usual cuisine is that cuisine, whatever the label', () => {
  assert.equal(cuisineOf('Chinese', 'Japanese', 'Japanese Style Mapo Tofu (Mabodofu)'), 'Japanese');
  assert.equal(cuisineOf('Chinese', 'Thai', 'Stir Fried Turnip Cake (lo bak go) - Thai Style'), 'Thai');
});

test('a site’s own label stands when the site has no usual cuisine, or the name says nothing', () => {
  assert.equal(cuisineOf('Chinese', '', 'Japanese Style Mapo Tofu'), 'Chinese');
  assert.equal(cuisineOf('Chinese', 'Japanese', 'Ebi Chili'), 'Chinese');
  assert.equal(cuisineOf('', '', 'Mapo Tofu'), '');
});
