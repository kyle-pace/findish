// Talk to the MCP endpoint the way an assistant would, with the official MCP client:
// connect, list the tools, run a few searches, and print short results.
//
//   npm run preview                  (in another terminal)
//   npm run try-mcp                  (uses http://localhost:8787/mcp)
//   npm run try-mcp -- https://findish.now/mcp
//
// Exits non-zero if anything fails, so it works as a check after a deploy.
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';

const url = process.argv[2] ?? 'http://localhost:8787/mcp';
const client = new Client({ name: 'try-script', version: '0.1.0' });
await client.connect(new StreamableHTTPClientTransport(new URL(url)));
const info = client.getServerVersion();
console.log(`Connected to ${info?.title ?? info?.name} ${info?.version} at ${url}`);
const { tools } = await client.listTools();
console.log(`Tools: ${tools.map((t) => t.name).join(', ')}`);
const { prompts } = await client.listPrompts();
console.log(`Prompts: ${prompts.map((p) => p.name).join(', ')}`);

let failures = 0;
const expect = (what, ok) => {
  if (!ok) failures++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`);
};
const searchTool = tools.find((t) => t.name === 'search_recipes');
for (const arg of ['query', 'ingredients', 'without', 'diet', 'cuisine', 'course', 'max_minutes', 'creator', 'new_only', 'show', 'sort', 'videos', 'limit', 'offset']) {
  if (!searchTool?.inputSchema?.properties?.[arg]) expect(`search_recipes takes ${arg}`, false);
}
expect('every tool says what its answer looks like (outputSchema)', tools.every((t) => t.outputSchema?.type === 'object'));
expect('the server does not claim its tool list can change', client.getServerCapabilities()?.tools?.listChanged !== true);
expect('three prompts are offered', prompts.length === 3);
const prompt = await client.getPrompt({ name: 'cook_with', arguments: { ingredients: 'tofu, bok choy' } });
expect('a prompt fills in what was given', prompt.messages?.[0]?.content?.text?.includes('tofu, bok choy'));

// An assistant running in a web page sends an Origin; it must not be turned away.
const browser = await fetch(url, {
  method: 'POST',
  headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', origin: 'https://assistant.example' },
  body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
});
expect(`a request from another website's page is answered (${browser.status})`, browser.status !== 403);
await browser.body?.cancel();

async function call(name, args, check) {
  const started = Date.now();
  const res = await client.callTool({ name, arguments: args });
  const text = res.content?.[0]?.text ?? '';
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {}
  const same = JSON.stringify(res.structuredContent) === JSON.stringify(data);
  const problem = res.isError ? text : !data ? 'not JSON' : !same ? 'structuredContent differs from the text' : check(data);
  if (problem) failures++;
  console.log(`\n${problem ? 'FAIL' : 'ok  '} ${name}(${JSON.stringify(args)}) ${Date.now() - started} ms${problem ? `: ${problem}` : ''}`);
  return data;
}
const show = (d) => {
  for (const r of d?.recipes ?? []) console.log(`     ${r.name} (${r.from}${r.time ? `, ${r.time}` : ''})${r.uses ? ` uses ${r.uses.join(', ')}; also needs ${r.also_needs.length}` : ''}\n       ${r.url}`);
  for (const v of d?.videos ?? []) console.log(`     [YouTube] ${v.title} (${v.channel})`);
  for (const n of d?.notes ?? []) console.log(`     note: ${n}`);
};

show(await call('search_recipes', { query: 'mapo tofu', limit: 4 }, (d) => (d.recipes?.length && d.recipes.every((r) => /^https:\/\//.test(r.url)) ? null : 'no recipes with links')));
show(await call('search_recipes', { ingredients: ['chicken thighs', 'bok choy', 'tofu'], max_minutes: 45, videos: false, limit: 4 }, (d) => (d.recipes?.[0]?.uses?.length ? null : 'no ingredient matches')));
show(await call('search_recipes', { query: 'noodles', diet: 'vegetarian', cuisine: 'thai', limit: 3 }, (d) => (d.recipes?.every((r) => r.cuisine === 'Thai') ? null : 'cuisine filter not applied')));
await call('search_recipes', { query: 'soup', cuisine: 'martian' }, (d) => (d.error && d.cuisines?.length ? null : 'expected a helpful error'));
// The newer arguments (show, sort, offset, new_only) must be accepted. Whether the answer
// follows them is the search's job, checked in src/mcp/search.test.mjs.
show(await call('search_recipes', { query: 'curry', show: 'recipes', sort: 'quickest', limit: 3, offset: 3 }, (d) => (d.recipes?.length ? null : 'no recipes')));
await call('search_recipes', { new_only: true, limit: 3 }, (d) => (Array.isArray(d.recipes) ? null : 'no recipes list'));
show(await call('search_recipes', { query: 'kimchi', creator: 'Maangchi', limit: 3 }, (d) => (d.videos?.length ? null : 'a videos-only creator should return videos')));
const src = await call('list_sources', {}, (d) => (d.creators?.length ? null : 'no creators'));
if (src) console.log(`     ${src.recipe_count} recipes, ${src.video_count} videos from ${src.creators.map((c) => c.name).join(', ')}`);

await client.close();
if (failures) {
  console.error(`\n${failures} check(s) failed.`);
  process.exit(1);
}
console.log('\nAll good.');
