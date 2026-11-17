import test from 'node:test';
import assert from 'node:assert/strict';
import { dropFrom, keysFromHash, listHash, putFirst, readList, recentKey, rememberSearch, searchLabel } from './kept.mjs';

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
