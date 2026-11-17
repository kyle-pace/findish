import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanQ, tagOrder, titleFor, dishName, ignoredSentence, linkOnlyTyped, goesToAsk, askKey, askMessages } from './page-state.mjs';

test('punctuation on the end of a search is not kept in the address', () => {
  assert.equal(cleanQ('mapo tofu.'), 'mapo tofu');
  assert.equal(cleanQ('  pad   thai?! '), 'pad thai');
  assert.equal(cleanQ('mac & cheese'), 'mac & cheese');
  assert.equal(cleanQ('...'), '');
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
