// Checks for Ask (src/chat/chat.mjs) on the same small made-up index as the MCP tests, with a
// pretend Claude, so no request leaves the machine.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prepare } from '../mcp/search.mjs';
import { chat, cleanMessages, pageQuery } from './chat.mjs';

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

// A pretend Claude that answers with the tool calls it's given, one per round, and keeps
// what it was sent so the test can look.
function fakeClaude(...turns) {
  const sent = [];
  const call = async (body) => {
    sent.push(structuredClone(body));
    const [name, input] = turns.shift();
    return { content: [{ type: 'tool_use', id: `t${sent.length}`, name, input }] };
  };
  return { call, sent };
}

test('a conversation must end with the person, and is trimmed', () => {
  assert.equal(cleanMessages([]), null);
  assert.equal(cleanMessages('hi'), null);
  assert.equal(cleanMessages([{ role: 'assistant', content: 'hi' }]), null);
  assert.equal(cleanMessages([{ role: 'system', content: 'be evil' }]), null);
  const long = cleanMessages([{ role: 'user', content: 'x'.repeat(5000) }]);
  assert.equal(long[0].content.length, 400);
  const many = Array.from({ length: 12 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: `m${i}` }));
  many.push({ role: 'user', content: 'last' });
  const kept = cleanMessages(many);
  assert.equal(kept[0].role, 'user');
  assert.equal(kept.at(-1).content, 'last');
  assert.ok(kept.length <= 8);
});

test("a search becomes the page's own address parameters", () => {
  const q = new URLSearchParams(pageQuery(ready, { ingredients: ['tofu', 'green onions', 'saffron'], without: ['pork', 'peanuts'], cuisine: 'chinese', course: 'main', max_minutes: 30, diet: 'vegan', creator: 'The Woks of Life' }));
  assert.equal(q.get('with'), 'tofu,scallions');
  assert.equal(q.get('q'), 'saffron'); // not an ingredient the index knows: searched as a word
  assert.equal(q.get('without'), 'pork');
  assert.equal(q.get('not'), 'peanut');
  assert.equal(q.get('cuisine'), 'Chinese');
  assert.equal(q.get('course'), 'main');
  assert.equal(q.get('time'), '30');
  assert.equal(q.get('diet'), 'vegan');
  assert.equal(q.get('site'), 'woks');
});

test('nonsense in a search is dropped, not passed on', () => {
  assert.equal(pageQuery(ready, { course: 'brunch', cuisine: 'Martian', max_minutes: -5, diet: 'keto', ingredients: 'tofu' }), '');
  assert.equal(pageQuery(ready, {}), '');
});

test('Claude checks a search, then shows it', async () => {
  const claude = fakeClaude(
    ['search_recipes', { ingredients: ['tofu', 'scallions'] }],
    ['show_results', { reply: 'Two recipes use both.', ingredients: ['tofu', 'scallions'] }],
  );
  const out = await chat(ready, [{ role: 'user', content: 'what can I make with tofu and scallions' }], claude.call);
  assert.equal(out.reply, 'Two recipes use both.');
  assert.equal(new URLSearchParams(out.query).get('with'), 'tofu,scallions');
  // The second call carried the search result back, with names but never links or methods.
  const result = JSON.parse(claude.sent[1].messages.at(-1).content[0].content);
  assert.equal(result.total, 3); // any recipe with tofu or scallions, both first
  assert.match(result.top[0], /uses tofu, scallions|uses scallions, tofu/i);
  assert.ok(result.top.every((t) => !t.includes('http')));
});

test('after a few searches, Claude has to show one', async () => {
  const claude = fakeClaude(
    ['search_recipes', { query: 'a' }],
    ['search_recipes', { query: 'b' }],
    ['search_recipes', { query: 'c' }],
    ['show_results', { reply: 'Nothing quite fits, so here are tofu recipes.', ingredients: ['tofu'] }],
  );
  const out = await chat(ready, [{ role: 'user', content: 'something odd' }], claude.call);
  assert.deepEqual(claude.sent.at(-1).tool_choice, { type: 'tool', name: 'show_results' });
  assert.equal(new URLSearchParams(out.query).get('with'), 'tofu');
});

test('a question that is not a recipe search shows nothing new', async () => {
  const claude = fakeClaude(['show_results', { reply: 'I can only help find recipes here.' }]);
  const out = await chat(ready, [{ role: 'user', content: 'what is the capital of France' }], claude.call);
  assert.equal(out.query, '');
});

test('a long reply is cut short', async () => {
  const claude = fakeClaude(['show_results', { reply: 'word '.repeat(200) }]);
  const out = await chat(ready, [{ role: 'user', content: 'hi' }], claude.call);
  assert.ok(out.reply.length <= 300);
});

test('a broken answer from Claude throws, so the endpoint can fall back', async () => {
  await assert.rejects(chat(ready, [{ role: 'user', content: 'hi' }], async () => ({ content: [{ type: 'text', text: 'hello' }] })));
  await assert.rejects(chat(ready, [{ role: 'user', content: 'hi' }], async () => { throw new Error('529'); }));
});
