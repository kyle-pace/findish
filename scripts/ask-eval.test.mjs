// Checks for the checker: scripts/ask-eval.mjs grades Ask's answers, so a wrong grade would
// hide a real miss. No request leaves the machine.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { prepare } from '../src/mcp/search.mjs';
import { CHECKS, grade, turnsOf } from './ask-eval.mjs';

const index = {
  crawled: '2026-11-09',
  sources: [{ id: 'woks', name: 'The Woks of Life', site: 'https://thewoksoflife.com', host: 'thewoksoflife.com', count: 2 }],
  videos: { sources: [{ id: 'maangchi', name: 'Maangchi', channel: 'https://www.youtube.com/@maangchi', site: '', count: 1 }], rows: [[0, 'Easy Kimchi', 'abc', '2026-01-02', []]] },
  cuisines: [['Chinese', 2]],
  courses: [['main', 'Mains', 1], ['side', 'Sides and salads', 1]],
  diet: { vegetarian: [0], vegan: [0] },
  fresh: [1],
  ing: [['pork', 'Pork', 1, []], ['tofu', 'Tofu', 2, []]],
  recipes: [
    [0, 'Mapo Tofu', '/mapo-tofu/', 30, 'Chinese', [0, 1], [0, 1], 'x.jpg', '', 0, 'main'],
    [0, 'Smashed Cucumber Salad', '/cucumber/', 10, 'Chinese', [1], [1], '', '', 0, 'side', '2026-11-09'],
  ],
};
const ready = prepare(index);
const missed = (expect, answer, ctx) => grade(expect, answer, ctx).filter(([, ok]) => !ok).map(([what]) => what);

test('each check passes on a right answer and fails on a wrong one', () => {
  const right = { reply: 'Chinese sides for it.', query: 'with=tofu&without=pork&course=side&cuisine=Chinese&diet=vegan&time=30&site=woks&new=1&show=recipes&sidesFor=mapo+tofu' };
  const expect = { with: ['tofu'], notWith: ['pork'], without: ['pork'], notWithout: ['tofu'], course: 'side', cuisine: 'Chinese', diet: 'vegan', maxTime: 30, site: 'woks', new: true, show: 'recipes', sidesFor: 'mapo tofu', noQ: true };
  assert.deepEqual(missed(expect, right), []);
  const wrong = { reply: 'x', query: 'q=soup&with=pork&without=tofu&course=main&time=90' };
  assert.equal(missed(expect, wrong).length, 13);
  assert.deepEqual(missed({ q: 'mapo' }, { reply: 'x', query: 'q=mapo+tofu' }), []);
  assert.deepEqual(missed({ q: 'mapo' }, { reply: 'x', query: 'with=tofu' }), ['dish words include "mapo"']);
});

test('a question that should show nothing, and one that fell back', () => {
  assert.deepEqual(missed({ noSearch: true, noNames: ['http'] }, { reply: 'I can only help find recipes here.', query: '' }), []);
  assert.deepEqual(missed({ noSearch: true, noNames: ['http'] }, { reply: 'See http://x', query: 'q=x' }), ['shows no search', 'reply has no "http"']);
  assert.deepEqual(missed({}, { fallback: 'error', reason: 'timeout', reply: 'x', query: 'q=x' }), ['answered (fell back: error, timeout)']);
  assert.deepEqual(missed({}, { reply: '', query: 'q=tofu' }), ['says something']);
});

test('a misspelled check fails instead of being skipped', () => {
  assert.deepEqual(missed({ cusine: 'Thai' }, { reply: 'x', query: 'q=x' }), ['"cusine" is a check this script knows']);
});

test('with the index: the shown search has to find something', () => {
  assert.deepEqual(missed({}, { reply: 'Tofu recipes.', query: 'with=tofu' }, { ready }), []);
  assert.deepEqual(missed({}, { reply: 'Hm.', query: 'q=unicorn' }, { ready }), ['the search finds at least 1 (found 0)']);
  assert.deepEqual(missed({ minResults: 0 }, { reply: 'Hm.', query: 'q=unicorn' }, { ready }), []);
  assert.deepEqual(missed({ minResults: 3 }, { reply: 'Tofu recipes.', query: 'with=tofu' }, { ready }), ['the search finds at least 3 (found 2)']);
  // A creator with only videos counts: videos are results too.
  assert.deepEqual(missed({ site: 'maangchi' }, { reply: 'Videos only.', query: 'site=maangchi&q=kimchi' }, { ready }), []);
});

test('with the index: a reply that names a recipe from the results is caught, on every question', () => {
  assert.deepEqual(missed({}, { reply: 'Try the Smashed Cucumber Salad.', query: 'with=tofu' }, { ready, asked: ['something with tofu'] }), ['reply names no recipe (named: Smashed Cucumber Salad)']);
  // Saying back the dish the person asked for isn't a leak.
  assert.deepEqual(missed({}, { reply: 'Here is mapo tofu.', query: 'q=mapo+tofu' }, { ready, asked: ['how do I make mapo tofu'] }), []);
  assert.deepEqual(missed({}, { reply: 'Here is mapo tofu.', query: 'q=mapo+tofu' }, { ready, asked: ['麻婆豆腐'] }), []);
});

test('the question file only uses checks the script knows, and chats are well formed', () => {
  const { questions } = JSON.parse(readFileSync(new URL('./ask-questions.json', import.meta.url), 'utf8'));
  assert.ok(questions.length >= 40);
  for (const q of questions) {
    const turns = turnsOf(q);
    assert.ok(turns.length >= 1);
    for (const t of turns) {
      assert.equal(typeof t.ask, 'string');
      assert.ok(t.ask.length > 0 && t.ask.length <= 400, t.ask);
      for (const k of Object.keys(t.expect || {})) assert.ok(CHECKS.includes(k), `${t.ask}: unknown check "${k}"`);
    }
  }
  assert.ok(questions.some((q) => q.turns?.length > 1));
});
