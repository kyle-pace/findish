// Checks for the MCP search, on a small made-up index in the shape scripts/build-index.mjs writes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ingredientFor, listSources, prepare, recipesWith, searchRecipes, words } from './search.mjs';

// ing: [id, name, recipe count, parent positions, ...other names]
const ing = [
  ['pork', 'Pork', 2, []], // 0
  ['pork-belly', 'Pork belly', 1, [0]], // 1
  ['tofu', 'Tofu', 2, [], 'bean curd'], // 2
  ['scallions', 'Scallions', 3, [], 'green onion'], // 3
  ['bok-choy', 'Bok choy', 1, [], 'pak choi'], // 4
  ['rice-noodles', 'Rice noodles', 1, []], // 5
];
// recipes: [source, name, path, minutes, cuisine, all ingredient positions, its own, photo, keywords, opens]
const index = {
  crawled: '2026-11-09',
  sources: [
    { id: 'woks', name: 'The Woks of Life', site: 'https://thewoksoflife.com', host: 'thewoksoflife.com', count: 3 },
    { id: 'htk', name: 'Hot Thai Kitchen', site: 'https://hot-thai-kitchen.com', host: 'hot-thai-kitchen.com', count: 2 },
  ],
  videos: {
    sources: [
      { id: 'woks-yt', name: 'The Woks of Life', channel: 'https://www.youtube.com/@woks', site: 'woks', count: 1 },
      { id: 'kenji', name: 'J. Kenji López-Alt', channel: 'https://www.youtube.com/@kenji', site: '', count: 1 },
      { id: 'joc-yt', name: 'Just One Cookbook', channel: 'https://www.youtube.com/@joc', site: 'joc', count: 0 },
    ],
    rows: [
      [0, 'Restaurant Mapo Tofu', 'abc123', '2026-01-02', [2]],
      [1, 'Late Night Mapo Tofu', 'def456', '2026-03-04', [2]],
    ],
  },
  support: { htk: [{ label: 'Patreon', url: 'https://www.patreon.com/x' }], woks: [{ label: 'The Woks of Life', url: 'https://bookshop.org/book/1', book: true }] },
  paused: [{ id: 'joc', name: 'Just One Cookbook', site: 'https://www.justonecookbook.com', why: 'paused' }],
  linkOnly: [{ name: 'Serious Eats', search: 'https://www.seriouseats.com/search?q={q}' }],
  cuisines: [['Chinese', 3], ['Thai', 2]],
  courses: [['main', 'Mains', 1], ['side', 'Sides and salads', 1]],
  diet: { vegetarian: [0, 1], vegan: [0, 1] },
  ing,
  recipes: [
    [0, 'Mapo Tofu', '/mapo-tofu/', 30, 'Chinese', [0, 2, 3], [0, 2, 3], 'x.jpg', 'sichuan', 5],
    [0, 'Vegan Mapo Tofu', '/vegan-mapo-tofu/', 25, 'Chinese', [2, 3], [2, 3], 'x.jpg', '', 0],
    [0, 'Red Braised Pork Belly', '/pork-belly/', 90, 'Chinese', [1, 0, 3], [1, 3], 'x.jpg', 'hong shao rou', 0],
    [1, 'Pad See Ew', '/pad-see-ew/', 20, 'Thai', [5, 0], [5, 0], 'x.jpg', 'stir fried noodles', 0, 'main'],
    [1, 'Stir-Fried Bok Choy', '/bok-choy/', 10, 'Thai', [4], [4], '', '', 0, 'side', '2026-11-09'],
  ],
};
const ready = prepare(index);
const names = (r) => r.recipes.map((x) => x.name);

test('words are lowercase, singular and accent-free', () => {
  assert.deepEqual(words('Scallions, chopped!'), ['scallion', 'chopped']);
  assert.deepEqual(words('Jalapeños & tomatoes'), ['jalapeno', 'tomato']);
});

test('ingredients are found by any of their names', () => {
  assert.equal(ingredientFor(ready, 'green onions'), 3);
  assert.equal(ingredientFor(ready, 'Bean Curd'), 2);
  assert.equal(ingredientFor(ready, 'saffron'), null);
});

test('a dish search needs every word and gives full links', () => {
  const r = searchRecipes(ready, { query: 'mapo tofu' });
  assert.deepEqual(names(r).sort(), ['Mapo Tofu', 'Vegan Mapo Tofu']);
  assert.equal(r.recipes.find((x) => x.name === 'Mapo Tofu').url, 'https://thewoksoflife.com/mapo-tofu/');
  assert.equal(r.videos.length, 2);
  assert.ok(r.videos.every((v) => v.on === 'YouTube' && v.url.startsWith('https://www.youtube.com/watch?v=')));
});

test('cooking with ingredients: most used first, a parent covers its kinds', () => {
  const r = searchRecipes(ready, { ingredients: ['pork', 'tofu', 'scallions'] });
  assert.equal(r.recipes[0].name, 'Mapo Tofu');
  assert.deepEqual(r.recipes[0].also_needs, []);
  const belly = r.recipes.find((x) => x.name === 'Red Braised Pork Belly');
  assert.deepEqual(belly.uses, ['Pork', 'Scallions']);
  assert.deepEqual(belly.also_needs, []); // pork covers pork belly
  assert.deepEqual(r.cooking_with, ['Pork', 'Tofu', 'Scallions']);
  assert.ok(!names(r).includes('Stir-Fried Bok Choy'));
});

test('without, diet, cuisine, time and creator narrow the results', () => {
  assert.deepEqual(names(searchRecipes(ready, { query: 'mapo tofu', without: ['pork'] })), ['Vegan Mapo Tofu']);
  assert.deepEqual(names(searchRecipes(ready, { query: 'tofu', diet: 'vegetarian' })), ['Vegan Mapo Tofu']);
  assert.deepEqual(names(searchRecipes(ready, { cuisine: 'thai', max_minutes: 15 })), ['Stir-Fried Bok Choy']);
  assert.equal(searchRecipes(ready, { creator: 'hot thai kitchen' }).total_recipes, 2);
  assert.equal(searchRecipes(ready, { creator: 'Woks of Life', max_minutes: 30 }).total_recipes, 2);
});

test('videos stay out when a cuisine or time is asked for, or when turned off', () => {
  assert.equal(searchRecipes(ready, { query: 'mapo tofu', cuisine: 'Chinese' }).videos, undefined);
  assert.equal(searchRecipes(ready, { query: 'mapo tofu', videos: false }).videos, undefined);
});

test('unknown things are explained, not silently dropped', () => {
  assert.match(searchRecipes(ready, { ingredients: ['tofu', 'saffron'] }).notes.join(' '), /saffron/);
  const bad = searchRecipes(ready, { cuisine: 'martian' });
  assert.match(bad.error, /martian/);
  assert.deepEqual(bad.cuisines, ['Chinese', 'Thai']);
  const none = searchRecipes(ready, { query: 'croissant' });
  assert.equal(none.total_recipes, 0);
  assert.equal(none.also_search[0].search, 'https://www.seriouseats.com/search?q=croissant');
});

test('limit caps the list and says how many there are', () => {
  const r = searchRecipes(ready, { ingredients: ['scallions'], limit: 1 });
  assert.equal(r.recipes.length, 1);
  assert.equal(r.total_recipes, 3);
  assert.match(r.notes.join(' '), /1 of 3/);
});

test('list_sources joins a site with its channel and lists support links', () => {
  const s = listSources(ready);
  const woks = s.creators.find((c) => c.name === 'The Woks of Life');
  assert.equal(woks.recipes, 3);
  assert.equal(woks.videos, 1);
  assert.equal(woks.support[0].label, 'Book: The Woks of Life');
  assert.equal(woks.page, 'https://findish.now/creators/woks/');
  assert.ok(s.creators.some((c) => c.name === 'J. Kenji López-Alt' && c.videos === 1));
  assert.deepEqual(s.not_indexed_but_searchable, ['Serious Eats']);
});

test('recipes with a list: by catalog id, two or more used, unknown and bad ids left out', () => {
  const r = recipesWith(ready, { with: ['pork', 'tofu', 'scallions', 'saffron', '../etc', 'Not An Id'] });
  assert.deepEqual(r.known, ['pork', 'tofu', 'scallions']);
  assert.equal(r.recipes[0].name, 'Mapo Tofu');
  assert.deepEqual(r.recipes[0].uses, ['Pork', 'Tofu', 'Scallions']);
  assert.equal(r.recipes[0].also_needs, 0);
  assert.equal(r.recipes[0].image, 'x.jpg');
  assert.ok(r.recipes.every((x) => x.uses.length >= 2));
  assert.ok(!names(r).includes('Pad See Ew')); // uses only pork of the three
  assert.equal(r.recipes.find((x) => x.name === 'Vegan Mapo Tofu').veg, true);
  assert.equal(r.recipes[0].veg, false);
});

test('recipes with a list: vegetarian, limits, and too little to go on', () => {
  assert.deepEqual(names(recipesWith(ready, { with: ['pork', 'tofu', 'scallions'], diet: 'vegetarian' })), ['Vegan Mapo Tofu']);
  assert.equal(recipesWith(ready, { with: ['pork', 'tofu', 'scallions'], limit: 1 }).recipes.length, 1);
  assert.equal(recipesWith(ready, { with: ['tofu'] }).total, 0);
  assert.equal(recipesWith(ready, {}).total, 0);
  assert.equal(recipesWith(ready, { with: 'tofu,pork' }).total, 0); // a list, not a string
});

test('list_sources gives a paused site its address, so apps can match its pages', () => {
  const joc = listSources(ready).creators.find((c) => c.name === 'Just One Cookbook');
  assert.equal(joc.site, 'https://www.justonecookbook.com');
  const kenji = listSources(ready).creators.find((c) => c.name === 'J. Kenji López-Alt');
  assert.equal(kenji.site, undefined);
});

test('course narrows to that part of a meal, and an unknown course says which exist', () => {
  const sides = searchRecipes(ready, { course: 'side', cuisine: 'Thai' });
  assert.deepEqual(names(sides), ['Stir-Fried Bok Choy']);
  assert.equal(sides.recipes[0].course, 'side');
  assert.deepEqual(names(searchRecipes(ready, { course: 'Sides and salads' })), ['Stir-Fried Bok Choy']);
  const bad = searchRecipes(ready, { course: 'elevenses' });
  assert.ok(bad.error && bad.courses.includes('main'));
});

// --- what the shared search core (src/lib/search-core.mjs) brought to the MCP search -------

// The same small index, plus what newer index builds carry: a new recipe this week, a group
// that can be left out, a recipe flagged as having dairy, and a channel's cuisine.
const index2 = {
  ...index,
  fresh: [4],
  groups: [['any-dairy', 'Dairy', 4, 'milk products'], ['any-nuts', 'Nuts', 32, 'nut']],
  ing: [...ing, ['fresh-herbs', 'Fresh Herbs', 1, [], 'cilantro', 'basil']], // 6
  videos: {
    sources: index.videos.sources.map((c) => (c.id === 'woks-yt' ? { ...c, cuisine: 'Chinese' } : c)),
    rows: [...index.videos.rows, [0, 'Crispy Pork Belly 脆皮烧肉', 'ghi789', '2026-05-06', [1, 0], '', 129], [1, 'Mapo Tofu with Pork, the Sichuan way', 'jkl012', '2026-06-07', [2], '', 129]],
  },
  recipes: [
    ...index.recipes,
    [1, 'Creamy Tofu Soup', '/creamy-tofu-soup/', 15, 'Thai', [2, 6], [2, 6], '', 'tom kha', 0, 'soup', '2026-11-01', 4],
    [0, 'Mapo Tofu Dipping Sauce', '/mapo-sauce/', 5, 'Chinese', [3], [3], 'x.jpg', '', 9, 'sauce', '2026-11-01'],
    [0, '麻婆豆腐 Mala Tofu', '/mala-tofu/', 20, 'Chinese', [2], [2], 'x.jpg', '', 0],
  ],
};
const ready2 = prepare(index2);

test('query words also match cuisines and ingredient names, as on the page', () => {
  assert.ok(names(searchRecipes(ready2, { query: 'thai' })).includes('Pad See Ew'));
  assert.ok(names(searchRecipes(ready2, { query: 'bean curd' })).includes('Mapo Tofu'), 'an ingredient’s other name is a word too');
  assert.ok(names(searchRecipes(ready2, { query: 'scallion' })).includes('Red Braised Pork Belly'));
});

test('ranking: the exact name first, and a sauce is not in front of the dish unless asked for', () => {
  assert.equal(searchRecipes(ready2, { query: 'mapo tofu' }).recipes[0].name, 'Mapo Tofu');
  const all = names(searchRecipes(ready2, { query: 'mapo tofu' }));
  assert.equal(all.at(-1), 'Mapo Tofu Dipping Sauce', 'the most opened one, but a sauce');
  assert.equal(searchRecipes(ready2, { query: 'mapo tofu sauce' }).recipes[0].name, 'Mapo Tofu Dipping Sauce');
});

test('a query in another script finds names that hold it; one with no words finds nothing', () => {
  assert.deepEqual(names(searchRecipes(ready2, { query: '麻婆豆腐' })), ['麻婆豆腐 Mala Tofu']);
  const none = searchRecipes(ready2, { query: '???' });
  assert.equal(none.total_recipes, 0);
  assert.match(none.notes.join(' '), /no words/);
  assert.equal(none.also_search, undefined);
});

test('filler in the query is ignored and plain phrases become filters, reported as understood', () => {
  const r = searchRecipes(ready2, { query: 'easy quick vegetarian mapo tofu recipe' });
  assert.deepEqual(r.understood, { max_minutes: 30, diet: 'vegetarian', query: 'mapo tofu' });
  assert.deepEqual(names(r), ['Vegan Mapo Tofu', 'Mapo Tofu Dipping Sauce']);
  const thai = searchRecipes(ready2, { query: 'thai food' });
  assert.equal(thai.understood.cuisine, 'Thai');
  assert.equal(thai.total_recipes, 3);
  // An argument given outright wins over the same thing said in the query.
  assert.equal(searchRecipes(ready2, { query: 'quick tofu', max_minutes: 90 }).understood, undefined);
});

test('typos are fixed and reported as corrected', () => {
  const r = searchRecipes(ready2, { query: 'mapo tufu' });
  assert.deepEqual(r.corrected, [{ from: 'tufu', to: 'tofu' }]);
  assert.equal(r.recipes[0].name, 'Mapo Tofu');
  const i = searchRecipes(ready2, { ingredients: ['scalions', '2 blocks of tofu'] });
  assert.deepEqual(i.cooking_with, ['Scallions', 'Tofu']);
  assert.deepEqual(i.corrected, [{ from: 'scalions', to: 'scallion' }]);
});

test('ingredient phrases: the ingredient inside the words is found', () => {
  assert.deepEqual(searchRecipes(ready2, { ingredients: ['leftover pork belly', 'a bunch of green onions'] }).cooking_with, ['Pork belly', 'Scallions']);
});

test('lists may arrive as one comma-separated item', () => {
  assert.deepEqual(searchRecipes(ready2, { ingredients: ['pork, tofu', 'scallions'] }).cooking_with, ['Pork', 'Tofu', 'Scallions']);
  assert.deepEqual(searchRecipes(ready2, { ingredients: 'pork; tofu' }).cooking_with, ['Pork', 'Tofu']);
});

test('without: only an ingredient’s own name leaves it out; anything else is said, not guessed', () => {
  // Cilantro is filed under Fresh Herbs: leaving out every herb is not what was asked.
  const r = searchRecipes(ready2, { query: 'tofu', without: ['cilantro'] });
  assert.ok(names(r).includes('Creamy Tofu Soup'));
  assert.match(r.notes.join(' '), /cilantro \(filed under Fresh Herbs/);
  assert.deepEqual(r.leaving_out, ['"cilantro" in the name']);
  const herbs = searchRecipes(ready2, { query: 'tofu', without: ['fresh herbs'] });
  assert.ok(!names(herbs).includes('Creamy Tofu Soup'));
  assert.deepEqual(herbs.leaving_out, ['Fresh Herbs']);
  const unknown = searchRecipes(ready2, { query: 'tofu', without: ['gluten'] });
  assert.match(unknown.notes.join(' '), /Could not check ingredient lists for: gluten/);
});

test('without: a group (dairy) goes by each recipe’s flags, and is called a best guess', () => {
  const r = searchRecipes(ready2, { query: 'tofu', without: ['dairy'] });
  assert.ok(!names(r).includes('Creamy Tofu Soup'));
  assert.ok(names(r).includes('Mapo Tofu'));
  assert.deepEqual(r.leaving_out, ['Dairy']);
  assert.match(r.notes.join(' '), /best guess/);
});

test('creators: other names work, three letters at least, and a channel alone is said', () => {
  assert.equal(searchRecipes(ready2, { creator: 'Pailin' }).total_recipes, 3);
  assert.equal(searchRecipes(ready2, { creator: 'woks' }).total_recipes, 5);
  assert.match(searchRecipes(ready2, { creator: 'a' }).error, /No creator/);
  assert.match(searchRecipes(ready2, { creator: 'of' }).error, /No creator/);
  const kenji = searchRecipes(ready2, { creator: 'kenji' });
  assert.equal(kenji.total_recipes, 0);
  assert.equal(kenji.videos.length, 2);
  assert.match(kenji.notes.join(' '), /YouTube videos only/);
});

test('nothing matches: each change that would find something is counted, and nothing left out is dropped', () => {
  const r = searchRecipes(ready2, { query: 'mapo tofu', max_minutes: 3, cuisine: 'Chinese', without: ['pork'] });
  assert.equal(r.total_recipes, 0);
  assert.deepEqual(r.recipes, []);
  assert.equal(r.relaxed.dropped, 'max_minutes');
  assert.deepEqual(r.relaxed.counts, { max_minutes: 2 });
  assert.ok(r.relaxed.recipes.every((x) => x.name !== 'Mapo Tofu'), 'pork stays out');
  assert.match(r.notes.join(' '), /Nothing matches all of that\. Without the time limit: 2/);
  assert.ok(!/Nothing in the index/.test(r.notes.join(' ')));
  assert.equal(r.also_search, undefined);
});

test('nothing matches because of what is left out: said plainly, and nothing loosened', () => {
  const r = searchRecipes(ready2, { query: 'pork belly', diet: 'vegetarian' });
  assert.equal(r.total_recipes, 0);
  assert.equal(r.relaxed, undefined);
  assert.match(r.notes.join(' '), /every one uses something being left out/);
});

test('new_only, show, sort and offset', () => {
  assert.deepEqual(names(searchRecipes(ready2, { new_only: true })), ['Stir-Fried Bok Choy']);
  assert.equal(searchRecipes(ready2, { new_only: true }).recipes[0].new, true);
  const vids = searchRecipes(ready2, { query: 'mapo tofu', show: 'videos' });
  assert.deepEqual([vids.recipes.length, vids.total_videos], [0, 3]);
  assert.equal(searchRecipes(ready2, { query: 'mapo tofu', show: 'recipes' }).videos, undefined);
  assert.equal(searchRecipes(ready2, { query: 'mapo tofu', videos: false }).videos, undefined);
  assert.equal(searchRecipes(ready2, { query: 'tofu', sort: 'quickest' }).recipes[0].name, 'Mapo Tofu Dipping Sauce');
  assert.equal(searchRecipes(ready2, { cuisine: 'Thai', sort: 'newest' }).recipes[0].name, 'Stir-Fried Bok Choy');
  const all = names(searchRecipes(ready2, { query: 'tofu', limit: 30 }));
  const page2 = searchRecipes(ready2, { query: 'tofu', limit: 2, offset: 2 });
  assert.deepEqual(names(page2), all.slice(2, 4));
  assert.match(page2.notes.join(' '), /Showing 3 to 4 of/);
  const random = searchRecipes(ready2, { query: 'tofu', sort: 'random', limit: 30 });
  assert.deepEqual(names(random).sort(), [...all].sort());
});

test('videos: best title match first, nothing that names what is left out, a cuisine by its channel', () => {
  const v = searchRecipes(ready2, { query: 'mapo tofu' }).videos;
  assert.ok(v.slice(0, 2).every((x) => / Mapo Tofu$/.test(x.title)), 'the shorter titles are the closer match');
  assert.ok(searchRecipes(ready2, { query: 'mapo tofu', without: ['pork'] }).videos.every((x) => !/pork/i.test(x.title)));
  assert.ok(searchRecipes(ready2, { query: 'mapo tofu', diet: 'vegetarian' }).videos.every((x) => !/pork/i.test(x.title)));
  // The Woks of Life's channel cooks Chinese; Kenji's has no cuisine.
  assert.deepEqual(searchRecipes(ready2, { query: 'mapo tofu', cuisine: 'Chinese' }).videos.map((x) => x.channel), ['The Woks of Life']);
  // Words in a channel's name are not words in a title.
  assert.equal(searchRecipes(ready2, { query: 'lopez' }).videos, undefined);
  // A course keeps the videos whose title says it.
  assert.equal(searchRecipes(ready2, { query: 'mapo tofu', course: 'main' }).videos, undefined);
});

test('recipes with a list: a recipe flagged for meat by its name is not marked veg', () => {
  const flagged = prepare({ ...index, recipes: index.recipes.map((r) => (r[1] === 'Vegan Mapo Tofu' ? [...r.slice(0, 10), '', '', 1] : r)) });
  assert.equal(recipesWith(flagged, { with: ['tofu', 'scallions'] }).recipes.find((x) => x.name === 'Vegan Mapo Tofu').veg, false);
  assert.ok(!names(recipesWith(flagged, { with: ['tofu', 'scallions'], diet: 'vegetarian' })).includes('Vegan Mapo Tofu'));
});
