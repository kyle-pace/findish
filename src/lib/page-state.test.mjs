import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanQ, tagOrder, titleFor, dishName, ignoredSentence, linkOnlyTyped, goesToAsk, askKey, askMessages, soleQuery, sortHits, coverLabel, narrowFacets, completions } from './page-state.mjs';

test('punctuation on the end of a search is not kept in the address', () => {
  assert.equal(cleanQ('mapo tofu.'), 'mapo tofu');
  assert.equal(cleanQ('  pad   thai?! '), 'pad thai');
  assert.equal(cleanQ('mac & cheese'), 'mac & cheese');
  assert.equal(cleanQ('...'), '');
});

test('a link made to be enormous is cut to 400 characters without keeping the page busy', () => {
  // 200,000 punctuation marks that are not at the end: the old pattern looked again from each one.
  const huge = `soup ${'.,;'.repeat(70000)} x`;
  const start = performance.now();
  const q = cleanQ(huge);
  const took = performance.now() - start;
  assert.ok(took < 50, `${took.toFixed(0)} ms`);
  assert.ok(q.length <= 400);
  assert.equal(cleanQ(`${'pad thai '.repeat(60)}`).length <= 400, true);
  assert.equal(cleanQ(`${'a'.repeat(398)}. more`), 'a'.repeat(398));
});

test('tags keep the order they were added in, so Backspace takes off the last one added', () => {
  let order = tagOrder([], ['with:tofu']);
  order = tagOrder(order, ['fresh', 'with:tofu']); // "new this week" added after tofu
  assert.deepEqual(order, ['with:tofu', 'fresh']);
  order = tagOrder(order, ['site:woks', 'fresh', 'diet', 'with:tofu', 'not:pork']);
  assert.deepEqual(order, ['with:tofu', 'fresh', 'site:woks', 'diet', 'not:pork']);
  // Backspace: the last one goes, whatever kind it is.
  order = tagOrder(order, ['site:woks', 'fresh', 'diet', 'with:tofu']);
  assert.equal(order.at(-1), 'diet');
  order = tagOrder(order, ['site:woks', 'fresh', 'with:tofu']);
  assert.equal(order.at(-1), 'site:woks');
  order = tagOrder(order, ['fresh', 'with:tofu']);
  assert.equal(order.at(-1), 'fresh'); // "new this week" comes off too
});

test('each search has its own tab title', () => {
  const home = 'Findish: one search';
  assert.equal(titleFor([], home), home);
  assert.equal(titleFor(['mapo tofu'], home), 'mapo tofu: Findish');
  assert.equal(titleFor(['', 'ginger', 'tofu'], home), 'ginger and tofu: Findish');
  assert.equal(titleFor(['fried rice', 'egg'], home), 'fried rice, egg: Findish');
  assert.equal(titleFor(['a', 'b', 'c', 'd'], home), 'a, b, c and more: Findish');
});

test('a dish name from the address cannot carry markup', () => {
  assert.equal(dishName('<b>bulgogi</b>"onload='), 'b bulgogi b onload');
  assert.equal(dishName('Pad See Ew'), 'Pad See Ew');
  assert.equal(dishName('x'.repeat(100)).length, 60);
});

test('the sentence about left-out words reads naturally', () => {
  assert.equal(ignoredSentence([]), '');
  assert.equal(ignoredSentence(['xyzzy']), 'Nothing here has “xyzzy”, so it was left out.');
  assert.equal(ignoredSentence(['everything', 'has']), 'Nothing here has “everything” or “has”, so they were left out.');
  assert.equal(ignoredSentence(['a', 'b', 'c']), 'Nothing here has “a”, “b” or “c”, so they were left out.');
});

test('a link-only site typed into the box is named, with the other words kept for its search', () => {
  const sites = [{ name: 'Serious Eats', search: 'https://www.seriouseats.com/search?q={q}' }];
  assert.deepEqual(linkOnlyTyped('serious eats lasagna', sites), { site: sites[0], rest: 'lasagna' });
  assert.deepEqual(linkOnlyTyped('Lasagna from Serious Eats', sites), { site: sites[0], rest: 'lasagna' });
  assert.equal(linkOnlyTyped('serious lasagna eats', sites), null);
  assert.equal(linkOnlyTyped('lasagna', sites), null);
  assert.equal(linkOnlyTyped('lasagna', undefined), null);
});

test('Enter only sends typed words to Ask when the person chose Ask', () => {
  const q = { on: true, text: 'what can i make with tofu', question: true };
  assert.equal(goesToAsk({ ...q }), false, 'a first question is searched here, not sent');
  assert.equal(goesToAsk({ ...q, how: 'ask' }), true, 'the Ask option sends it');
  assert.equal(goesToAsk({ ...q, chosen: true }), true, 'after choosing Ask once, Enter asks');
  assert.equal(goesToAsk({ ...q, chosen: true, how: 'plain' }), false, '"Search for these words" never asks');
  assert.equal(goesToAsk({ on: true, text: 'mapo tofu', chosen: true }), false, 'a dish name is searched here');
  assert.equal(goesToAsk({ on: true, text: 'make it vegetarian', fromAsk: true }), true, 'a follow-up carries on the chat');
  assert.equal(goesToAsk({ on: true, text: 'pad thai', fromAsk: true, how: 'plain' }), false);
  assert.equal(goesToAsk({ on: true, text: '  ', fromAsk: true }), false);
  assert.equal(goesToAsk({ ...q, on: false, how: 'ask', chosen: true, fromAsk: true }), false, 'never when Ask is off');
});

test('Ask answers are remembered under the search they showed', () => {
  assert.equal(askKey('?with=tofu&course=soup'), 'with=tofu&course=soup');
  assert.equal(askKey('?chat=1&with=tofu'), 'with=tofu');
  assert.equal(askKey(''), '');
});

test('earlier answers go back to Ask as the search shown, never as text', () => {
  const sent = askMessages([
    { role: 'user', content: 'a soup with tofu' },
    { role: 'assistant', showed: 'with=tofu&course=soup', reply: 'Here are soups.' },
    { role: 'user', content: 'make it vegetarian' },
  ]);
  assert.deepEqual(sent, [
    { role: 'user', content: 'a soup with tofu' },
    { role: 'assistant', showed: 'with=tofu&course=soup' },
    { role: 'user', content: 'make it vegetarian' },
  ]);
});

test('a link with only ?q= is read as a typed sentence; one with tags or filters is not', () => {
  assert.equal(soleQuery('?q=quick+vegetarian+dinner+without+mushrooms'), 'quick vegetarian dinner without mushrooms');
  assert.equal(soleQuery('?q=mapo+tofu.&chat=1&utm_source=newsletter'), 'mapo tofu');
  assert.equal(soleQuery('?q=dinner&diet=vegetarian'), '', 'the page wrote this one: q is just the words');
  assert.equal(soleQuery('?q=tofu&site=woks'), '');
  assert.equal(soleQuery('?q=tofu&pick=woks%3A%2Fx%2F'), '');
  assert.equal(soleQuery('?with=tofu'), '');
  assert.equal(soleQuery(''), '');
  assert.equal(soleQuery('?q=tofu&time='), 'tofu', 'an empty parameter is not a filter');
});

test('order: quickest puts recipes with no time last, newest goes by the day found, and ties keep their place', () => {
  const hit = (name, min, added) => ({ r: { name, min, added } });
  const hits = [hit('a', 40, '2026-11-01'), hit('b', null, '2026-11-10'), hit('c', 15, ''), hit('d', 40, '2026-11-10')];
  assert.deepEqual(sortHits(hits, 'quickest').map((h) => h.r.name), ['c', 'a', 'd', 'b']);
  assert.deepEqual(sortHits(hits, 'newest').map((h) => h.r.name), ['b', 'd', 'a', 'c']);
  assert.equal(sortHits(hits, ''), hits, 'best match is the search\'s own order');
  assert.deepEqual(hits.map((h) => h.r.name), ['a', 'b', 'c', 'd'], 'the list handed in is not changed');
});

test('ingredient results are headed by how many of the picked ingredients they use', () => {
  assert.equal(coverLabel(3, 3), 'Uses all 3');
  assert.equal(coverLabel(2, 3), 'Uses 2 of 3');
  assert.equal(coverLabel(1, 3), 'Uses 1 of 3');
  assert.equal(coverLabel(2, 2), 'Uses both');
  assert.equal(coverLabel(1, 2), 'Uses 1 of 2');
});

test('"Narrow it" offers cuisines, a time and vegetarian from the results, and only ones that narrow', () => {
  const rows = [
    ...Array(8).fill({ cuisine: 'Chinese', min: 20 }),
    ...Array(2).fill({ cuisine: 'Japanese', min: 45 }),
    { cuisine: '', min: null },
  ];
  const said = (f) => f.map((x) => `${x.label} (${x.n})`);
  assert.deepEqual(said(narrowFacets(rows, { vegetarian: 1 })), ['Chinese (8)', 'Japanese (2)', '30 minutes or less (8)', 'vegetarian (1)']);
  // What's already chosen isn't offered again.
  assert.deepEqual(said(narrowFacets(rows, { set: { cuisine: 'Chinese', time: 30 }, vegetarian: 1 })), ['vegetarian (1)']);
  assert.deepEqual(said(narrowFacets(rows, { set: { diet: 'vegan' }, vegetarian: 1 })), ['Chinese (8)', 'Japanese (2)', '30 minutes or less (8)']);
  // Everything is Chinese and quick: neither would narrow anything.
  assert.deepEqual(narrowFacets(Array(9).fill({ cuisine: 'Chinese', min: 20 }), { vegetarian: 9 }), []);
  // Nothing under 30 minutes: an hour is offered instead.
  assert.deepEqual(said(narrowFacets([...Array(5).fill({ cuisine: '', min: 50 }), ...Array(5).fill({ cuisine: '', min: 90 })])), ['1 hour or less (5)']);
  // A short list needs no narrowing.
  assert.deepEqual(narrowFacets(rows.slice(6), { vegetarian: 1 }), []);
  // At most three cuisines, biggest first.
  const many = ['A', 'A', 'A', 'B', 'B', 'C', 'D', 'E'].map((cuisine) => ({ cuisine, min: null }));
  assert.deepEqual(narrowFacets(many).map((f) => f.value), ['A', 'B', 'C']);
});

test('completions finish what is typed, starts first, and mark where the typed part sits', () => {
  const phrases = ['fried rice', 'mapo tofu', 'egg fried rice', 'fried chicken', 'tofu soup', 'french toast'];
  assert.deepEqual(completions(phrases, 'fri').map((c) => c.phrase), ['fried rice', 'fried chicken', 'egg fried rice']);
  assert.deepEqual(completions(phrases, 'Tofu'), [
    { phrase: 'tofu soup', at: 0, length: 4 },
    { phrase: 'mapo tofu', at: 5, length: 4 },
  ]);
  assert.deepEqual(completions(phrases, 'f'), [], 'one letter is too little to go on');
  assert.deepEqual(completions(phrases, 'mapo tofu'), [], 'nothing to finish');
  assert.deepEqual(completions(phrases, 'fried  ri').map((c) => c.phrase), ['fried rice', 'egg fried rice']);
  assert.deepEqual(completions(phrases, 'fr', 2).map((c) => c.phrase), ['fried rice', 'fried chicken']);
  assert.deepEqual(completions(undefined, 'fr'), []);
  assert.deepEqual(completions(phrases, 'ofu'), [], 'only the start of a word matches');
});

test('the filters that are set read as words, in the row’s order, and count by kind', async () => {
  const { setFilters, filtersLabel } = await import('./page-state.mjs');
  const say = { creator: (id) => ({ woks: 'The Woks of Life', htk: 'Hot Thai Kitchen' })[id], course: (id) => ({ side: 'sides' })[id], time: (m) => `${m} minutes`, order: (id) => ({ quickest: 'quickest first' })[id] };
  const none = { show: '', course: '', cuisine: '', sites: new Set(), time: 0, diet: '', sort: '' };
  assert.deepEqual(setFilters(none, say), []);
  assert.equal(filtersLabel([]), 'Filters');
  const set = setFilters({ show: 'recipes', course: 'side', cuisine: 'Chinese', sites: new Set(['woks', 'htk']), time: 30, diet: 'vegetarian', sort: 'quickest' }, say);
  assert.deepEqual(set.map((f) => f.label), ['recipes only', 'sides', 'Chinese', 'from The Woks of Life', 'from Hot Thai Kitchen', '30 minutes or less', 'vegetarian', 'quickest first']);
  assert.deepEqual(set.find((f) => f.name === 'time'), { name: 'time', value: '30', label: '30 minutes or less' });
  // Two creators are one filter: the word says how many filters, not how many choices.
  assert.equal(filtersLabel(set), 'Filters, 7 set');
  assert.equal(filtersLabel(setFilters({ ...none, cuisine: 'Thai', time: 30 }, say)), 'Filters, 2 set');
  // A creator the index no longer has still shows, by its id, so it can be taken off.
  assert.equal(setFilters({ ...none, sites: ['gone'] }, say)[0].label, 'from gone');
});

test('the sheet’s button says what closing it will show', async () => {
  const { showLabel } = await import('./page-state.mjs');
  assert.equal(showLabel(11, 17), 'Show 11 recipes');
  assert.equal(showLabel(1, 0), 'Show 1 recipe');
  assert.equal(showLabel(1234, 0), 'Show 1,234 recipes');
  assert.equal(showLabel(0, 4), 'Show 4 videos');
  assert.equal(showLabel(0, 1), 'Show 1 video');
  assert.equal(showLabel(0, 0), 'Nothing matches');
  assert.equal(showLabel(0, 0, true), 'Done');
});
