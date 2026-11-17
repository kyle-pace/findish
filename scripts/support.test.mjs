import { test } from 'node:test';
import assert from 'node:assert/strict';
import { supportKind } from './support.mjs';
import { readSources } from '../crawler/lib/sources.mjs';

const kind = (label, url, extra = {}) => supportKind({ label, url, ...extra });

test('paying a creator directly is join', () => {
  assert.equal(kind('Patreon', 'https://www.patreon.com/pailinskitchen'), 'join');
  assert.equal(kind('Ko-fi', 'https://ko-fi.com/someone'), 'join');
  assert.equal(kind('JOC Plus membership', 'https://www.justonecookbook.com/joc-plus/joc-plus-membership/'), 'join');
  assert.equal(kind('Canto Cooking Club', 'https://www.madewithlau.com/club'), 'join');
  assert.equal(kind('The FCA Club', 'https://www.thefrenchcookingacademy.com/fcaclub'), 'join');
});

test('books and shops are buy', () => {
  assert.equal(kind('Cookbooks', 'https://www.justonecookbook.com/cookbook/'), 'buy');
  assert.equal(kind('The Mala Market shop', 'https://themalamarket.com/'), 'buy');
  assert.equal(supportKind({ label: 'Sabai', url: 'https://bookshop.org/book/9780525611714', book: true }), 'buy');
});

test('free ways to follow are follow', () => {
  assert.equal(kind('YouTube', 'https://www.youtube.com/@Maangchi'), 'follow');
  assert.equal(kind('Newsletter', 'https://maangchi.substack.com/'), 'follow');
  assert.equal(kind('Newsletter', 'https://newsletter.madewithlau.com/'), 'follow');
  assert.equal(kind('Instagram', 'https://www.instagram.com/someone/'), 'follow');
});

test('a kind set in KitchenCatalog wins over the guess', () => {
  assert.equal(kind('Paid newsletter', 'https://someone.substack.com/', { kind: 'join' }), 'join');
  assert.equal(kind('Patreon', 'https://www.patreon.com/x', { kind: 'nonsense' }), 'join');
});

test('a broken address falls back to follow instead of throwing', () => {
  assert.equal(kind('Something', 'not a url'), 'follow');
});

test('every support link in the real sources list sorts somewhere sensible', () => {
  const { support } = readSources();
  for (const [id, v] of Object.entries(support))
    for (const l of v.links) {
      const k = supportKind(l);
      if (/patreon|club|membership/i.test(l.label)) assert.equal(k, 'join', `${id}: ${l.label}`);
      if (/youtube|newsletter/i.test(l.label)) assert.equal(k, 'follow', `${id}: ${l.label}`);
    }
});
