// What a recipe has in it that some people leave out (scripts/diet.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ALL, DAIRY, EGG, FISH, GROUPS, MEAT, NUTS, OTHER, PORK, SHELLFISH, VEGAN, VEGETARIAN, itemFlags, lineFlags, nameFlags, titleFlags, wordFlags } from './diet.mjs';

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

test('a line the catalog matched is still read for meat and fish the match missed', () => {
  // What the catalog matched has no meat in it; the line does.
  for (const [line, bit] of [
    ['tuna in olive oil', FISH],
    ['2 anchovies in olive oil', FISH],
    ['bottled clam juice', SHELLFISH],
    ['cooked chopped bacon and spinach', PORK],
    ['table salt for the meat', MEAT],
    ['lemon-flavored gelatin', MEAT],
    ['1 tbsp schmaltz or oil for the chicken', MEAT],
  ])
    assert.ok(has(lineFlags(line, 0), bit), line);
  // Only meat and fish are added; the item's own flags stay.
  assert.equal(lineFlags('butter', DAIRY), DAIRY);
  assert.equal(lineFlags('cream cheese and bacon', DAIRY), DAIRY | MEAT | PORK);
  assert.equal(lineFlags('2 eggs', EGG), EGG);
  // Lookalikes among matched lines stay clear.
  for (const line of ['2 celery ribs', '1 rib celery, diced', 'a rib of celery', 'celery stalk/rib', 'seafood mushrooms', 'oyster or straw mushrooms', 'shiitake, oyster', 'bulldog tonkatsu sauce', 'ripe avocado meat', 'hot dog buns'])
    assert.equal(lineFlags(line, 0) & VEGETARIAN, 0, line);
  assert.equal(lineFlags('quail eggs', EGG), EGG);
  assert.equal(lineFlags('3 salted duck egg yolks', EGG), EGG);
  assert.equal(lineFlags('eggs, duck or chicken', EGG), EGG);
  assert.ok(has(lineFlags('chicken egg rolls', EGG), MEAT));
});

test('hot dogs, schmaltz, snails and gelatin are not vegetarian', () => {
  for (const line of ['hot dogs', '4 hot dogs, sliced', 'schmaltz', 'periwinkle snails', 'escargots', 'unflavored gelatin', 'gelatine sheets']) {
    assert.ok(has(wordFlags(line, { line: true }), MEAT), line);
    assert.ok(has(lineFlags(line, 0), MEAT), `${line} (matched)`);
  }
  assert.ok(has(wordFlags('hot dogs', { line: true }), PORK));
  assert.ok(has(titleFlags('Hot Dog Potato Salad'), MEAT));
  assert.ok(has(titleFlags('Chinese Hot Dog Buns'), MEAT), 'a bun with a hot dog baked in');
});

test('a line that offers vegetable stock or water leaves the choice to the cook', () => {
  for (const line of ['chicken or vegetable broth', 'low-sodium chicken or vegetable stock', 'vegetable or chicken stock/broth', 'chicken stock or vegetable stock', 'beef broth or water', 'water or unsalted chicken stock', 'dashi or vegetable stock', 'vegetable stock/broth', 'vegetable stock or broth']) {
    assert.equal(wordFlags(line, { line: true }) & VEGETARIAN, 0, line);
    // ...even when the catalog filed the line under chicken stock.
    assert.equal(lineFlags(line, MEAT) & VEGETARIAN, 0, `${line} (matched to stock)`);
  }
  // No plant choice offered: still meat.
  for (const line of ['chicken or beef broth', 'chicken stock', 'pork or chicken stock', 'chicken thighs or breasts', 'beef or vegetable dumplings'])
    assert.ok(has(wordFlags(line, { line: true }), MEAT), line);
  // A line the catalog matched to something without meat: either side will do.
  assert.equal(lineFlags('lard or butter', DAIRY), DAIRY);
  assert.equal(lineFlags('fish sauce or soy sauce', 0), 0);
  assert.ok(has(lineFlags('poached chicken or soy sauce chicken', 0), MEAT), 'meat on both sides');
  // Not matched: "lard or butter" on its own words is still flagged.
  assert.ok(has(lineFlags('lard or butter'), MEAT));
});

test('a plant word on the line wins over what the catalog matched', () => {
  for (const [line, item] of [
    ['vegan chicken', MEAT],
    ['seitan/vegan chicken', MEAT],
    ['mushroom stock', MEAT],
    ['vegetable broth', MEAT],
    ['shiitake dashi', FISH],
    ['canned mock duck', MEAT],
    ['vegetarian fish sauce', FISH],
    ['vegan chorizo', MEAT | PORK],
    ['hot dog buns', MEAT | PORK],
    ['duck sauce', MEAT],
  ])
    assert.equal(lineFlags(line, item) & (VEGETARIAN | PORK | SHELLFISH), 0, line);
  // Nothing on the line says so: the match stands, even when no word names the meat.
  assert.equal(lineFlags('lap cheong', MEAT | PORK), MEAT | PORK);
  assert.equal(lineFlags('chuck roast', MEAT), MEAT);
  assert.equal(lineFlags('vegetable oil and chicken', MEAT), MEAT);
  assert.ok(has(lineFlags('vegan chicken or chicken thighs', MEAT), MEAT));
  assert.ok(has(lineFlags('mushroom stock and chicken', MEAT), MEAT));
});

test('a dish that is meat unless it says otherwise is flagged by its name', () => {
  for (const name of [
    'Katsudon',
    'How to Make Gyudon',
    'POV Oyakodon',
    'Katsu Curry',
    'Karaage',
    'Carbonara',
    'Spaghetti Bolognese',
    'Schnitzel',
    'How to Make Chashu (Recipe)',
    'Yakiniku Don',
    'Ultimate Homemade Sukiyaki Guide',
    'How to Make Shabu Shabu at Home',
    'Momofuku Bossam (or Bo ssam)',
    'My Best LAAB Yet',
    'Larb 1 (old version)',
    'Satay & Peanut Sauce',
    'Vietnamese Pho recipe',
    'Slow Cooker Pot Roast',
    'Ultra-Smashed Burgers',
    'Cheeseburgers!',
    'Hamburgers recipe',
    'Legendary Birria Tacos',
  ])
    assert.ok(has(titleFlags(name), MEAT), name);
  assert.ok(has(titleFlags('Katsudon'), PORK));
  for (const name of [
    'Veggie Burgers',
    'Black Bean Burgers',
    'Tofu Burger',
    'Mushroom Burgers with Onions',
    'Split Pea Burgers',
    'Halloumi Burgers',
    'Burger Buns',
    'Burger Sauce',
    'Tofu Katsu Curry',
    'Karaage Okra',
    'Vegan Carbonara',
    'Mushroom Bolognese',
    'Lentil Bolognese',
    'Eggplant Schnitzel',
    'Satay Sauce',
    'Vegan Pho',
    'Vegetarian Pho (Pho Chay)',
    'Tofu and Mushroom Pho',
    'Vegetable Sukiyaki',
    'Tonkatsu Sauce (3 Easy Ways)',
    'Pot Stickers',
    'Roast Potatoes',
  ])
    assert.equal(titleFlags(name) & VEGETARIAN, 0, name);
  // In an ingredient line they're things on a shelf, not the dish.
  for (const line of ['burger buns', 'satay sauce', 'pho noodles', 'sukiyaki sauce', 'katsu sauce']) assert.equal(wordFlags(line, { line: true }) & VEGETARIAN, 0, line);
});

test('a video whose name says vegan is not flagged for the item its name matched', () => {
  assert.equal(nameFlags('Vegan Mapo Tofu', MEAT | PORK) & VEGETARIAN, 0);
  assert.equal(nameFlags('Vegan Butter Chicken', DAIRY) & VEGAN, 0);
  assert.equal(nameFlags('How to Make Duck Sauce', MEAT) & VEGETARIAN, 0);
  assert.equal(nameFlags('Mapo Tofu', MEAT | PORK), MEAT | PORK);
  assert.ok(has(nameFlags('Chicken & Egg Big Bao', EGG), MEAT));
  assert.equal(nameFlags('Salted Duck Eggs', EGG), EGG);
});

test('the groups a search can leave out each have an id, a name and one flag', () => {
  assert.deepEqual(GROUPS.map((g) => g[0]), ['any-dairy', 'any-egg', 'any-nuts', 'any-shellfish', 'any-pork', 'any-meat', 'any-seafood']);
  for (const [, name, flag] of GROUPS) assert.ok(name && flag > 0 && flag < ALL && (flag & (flag - 1)) === 0);
  assert.ok(!GROUPS.some((g) => /gluten/i.test(g.join(' '))), 'gluten is left out on purpose');
});
