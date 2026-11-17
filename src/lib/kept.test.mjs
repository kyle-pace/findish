import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { KEEP, dropFrom, keysFromHash, listHash, putFirst, readList, recentKey, rememberOpened, rememberSearch, searchLabel } from './kept.mjs';

test('a stored list is read back safely, whatever is in storage', () => {
  assert.deepEqual(readList('["a","b","a"]'), ['a', 'b']);
  assert.deepEqual(readList('not json'), []);
  assert.deepEqual(readList('{"a":1}'), []);
  assert.deepEqual(readList(null), []);
  assert.deepEqual(readList('[1, "", "ok", null, {"x":1}]'), ['ok']);
  assert.deepEqual(readList(JSON.stringify(['a', 'b', 'c']), 2), ['a', 'b']);
  assert.deepEqual(readList(JSON.stringify(['x'.repeat(601), 'ok'])), ['ok']);
});

test('the newest goes first, once, and the list has a limit', () => {
  assert.deepEqual(putFirst(['a', 'b'], 'c'), ['c', 'a', 'b']);
  assert.deepEqual(putFirst(['a', 'b', 'c'], 'b'), ['b', 'a', 'c']);
  assert.deepEqual(putFirst(['a', 'b', 'c'], 'd', 3), ['d', 'a', 'b']);
  assert.deepEqual(putFirst(['a'], ''), ['a']);
  assert.deepEqual(dropFrom(['a', 'b'], 'a'), ['b']);
});

test('a remembered search leaves out what is not the search', () => {
  assert.equal(recentKey('?q=mapo+tofu&site=woks&pick=woks%3A%2Fx%2F&chat=1&utm_source=x&exact=1'), 'q=mapo+tofu&site=woks');
  assert.equal(recentKey('?pick=woks%3A%2Fx%2F'), '');
  assert.equal(recentKey('?saved=1'), '', 'the saved view is not a search');
  assert.equal(recentKey(''), '');
});

test('the last 8 searches are kept, newest first, each once', () => {
  let list = [];
  for (let n = 1; n <= 10; n++) list = rememberSearch(list, `?q=dish${n}`);
  assert.equal(list.length, 8);
  assert.equal(list[0], 'q=dish10');
  assert.equal(list.at(-1), 'q=dish3');
  list = rememberSearch(list, '?q=dish5');
  assert.equal(list[0], 'q=dish5');
  assert.equal(list.filter((x) => x === 'q=dish5').length, 1);
  assert.deepEqual(rememberSearch(['q=a'], '?pick=x'), ['q=a'], 'nothing searched, nothing remembered');
});

test('refining a search replaces it instead of adding a step', () => {
  const list = rememberSearch(['q=tofu', 'q=ramen'], '?q=tofu&cuisine=Chinese', { refines: 'q=tofu' });
  assert.deepEqual(list, ['q=tofu&cuisine=Chinese', 'q=ramen']);
  assert.deepEqual(rememberSearch(['q=tofu'], '?q=tofu', { refines: 'q=tofu' }), ['q=tofu']);
});

test('a search reads as one line', () => {
  assert.equal(searchLabel(['', 'tofu', 'ginger', 'from The Woks of Life']), 'tofu, ginger, from The Woks of Life');
  assert.equal(searchLabel(['mapo tofu', undefined, ' 30 minutes or less ']), 'mapo tofu, 30 minutes or less');
});

test('a saved list survives the trip through an address fragment', () => {
  const keys = ['woks:/mapo-tofu/', 'htk:/pad thai,v2/', 'sk:/a#b'];
  assert.deepEqual(keysFromHash(listHash(keys)), keys);
  assert.equal(listHash([]), '');
  assert.deepEqual(keysFromHash('#about'), []);
  assert.deepEqual(keysFromHash('#list=%E0%A4%A,ok'), ['ok'], 'a broken piece is skipped');
  assert.equal(keysFromHash(listHash(Array.from({ length: 300 }, (_, n) => `k${n}`))).length, 200);
});

/** A stand-in for localStorage. */
const fakeStorage = (start = {}) => {
  const items = new Map(Object.entries(start));
  return { getItem: (k) => items.get(k) ?? null, setItem: (k, v) => void items.set(k, String(v)), items };
};

test('an opened recipe goes to the front of the one "recently opened" list, whichever page opened it', () => {
  const storage = fakeStorage({ [KEEP.opened.key]: JSON.stringify(['woks:/mapo-tofu/', 'rte:/pad-thai/']) });
  assert.deepEqual(rememberOpened('htk:/green-curry/', storage), ['htk:/green-curry/', 'woks:/mapo-tofu/', 'rte:/pad-thai/']);
  // Opening one again moves it up instead of listing it twice.
  assert.deepEqual(rememberOpened('rte:/pad-thai/', storage), ['rte:/pad-thai/', 'htk:/green-curry/', 'woks:/mapo-tofu/']);
  assert.deepEqual(JSON.parse(storage.items.get(KEEP.opened.key)), ['rte:/pad-thai/', 'htk:/green-curry/', 'woks:/mapo-tofu/']);
  for (let i = 0; i < 20; i++) rememberOpened(`woks:/r${i}/`, storage);
  assert.equal(JSON.parse(storage.items.get(KEEP.opened.key)).length, KEEP.opened.max);
});

test('an opened recipe with no key, or storage that is missing or throws, keeps nothing and breaks nothing', () => {
  const storage = fakeStorage();
  rememberOpened('', storage);
  assert.equal(storage.items.size, 0);
  assert.deepEqual(rememberOpened('woks:/mapo-tofu/', undefined), []);
  const full = { getItem: () => null, setItem: () => { throw new Error('full'); } };
  assert.deepEqual(rememberOpened('woks:/mapo-tofu/', full), []);
});

test('creator and browse pages record opens in the same list as the search page', () => {
  // They are separate scripts; before this they sent "Opened Recipe" and kept nothing.
  for (const file of ['creators.ts', 'browse.ts', 'search.ts']) {
    const src = readFileSync(new URL(`../scripts/${file}`, import.meta.url), 'utf8');
    assert.match(src, /rememberOpened\(/, file);
    assert.doesNotMatch(src, /findish-opened/, `${file} should not name the storage key itself`);
  }
});
