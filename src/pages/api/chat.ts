// Ask, at POST findish.now/api/chat: the chat experiment (src/chat/chat.mjs), only offered on
// the page at findish.now/?chat=1 for now. The page sends the conversation so far,
// {"messages": [{"role": "user", "content": "..."}, ...]}, and gets back a short reply and
// the search to show, as the page's own address parameters: {"reply": "...", "query": "q=...&with=..."}.
//
// What's typed goes to Claude (Anthropic's API) to be answered and is never kept or logged
// here. Two rate limits guard the cost (per visitor and for everyone, in wrangler.jsonc),
// and the Anthropic workspace's spend limit is the last stop. Whenever Claude can't answer
// (a limit, an outage, no key), the reply falls back to a plain search of the person's words.

import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { prepare } from '../../mcp/search.mjs';
import { chat, cleanMessages } from '../../chat/chat.mjs';
import { callClaude } from '../../chat/anthropic.mjs';

export const prerender = false;

const MAX_BODY = 8192;
const HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };
const reply = (status: number, value: unknown) => new Response(JSON.stringify(value), { status, headers: HEADERS });

type Limiter = { limit(o: { key: string }): Promise<{ success: boolean }> };
type ChatEnv = { ASSETS?: { fetch: typeof fetch }; ANTHROPIC_API_KEY?: string; CHAT_PER_VISITOR?: Limiter; CHAT_EVERYONE?: Limiter };
const e = env as ChatEnv;

// Read once per isolate, like the MCP endpoint.
let ready: Promise<ReturnType<typeof prepare>> | null = null;
function loadIndex(origin: string) {
  ready ??= (async () => {
    if (!e.ASSETS) throw new Error('The index is not available here');
    const res = await e.ASSETS.fetch(new URL('/index.json', origin));
    if (!res.ok) throw new Error(`The index answered ${res.status}`);
    return prepare(await res.json());
  })().catch((err) => {
    ready = null;
    throw err;
  });
  return ready;
}

// A plain search of what the person typed, when Claude can't help right now.
const fallback = (text: string, why: string) =>
  reply(200, { fallback: why, reply: 'Ask isn’t available right now, so here’s a plain search for your words.', query: new URLSearchParams({ q: text.slice(0, 120) }).toString() });

export const POST: APIRoute = async ({ request, clientAddress }) => {
  if (Number(request.headers.get('content-length') || 0) > MAX_BODY) return reply(413, { error: 'Too much in one request.' });
  let messages;
  try {
    const text = await request.text();
    if (text.length > MAX_BODY) return reply(413, { error: 'Too much in one request.' });
    messages = cleanMessages(JSON.parse(text)?.messages);
  } catch {
    messages = null;
  }
  if (!messages) return reply(400, { error: 'Send JSON: {"messages": [{"role": "user", "content": "..."}]}' });
  const last = messages.at(-1)!.content;

  // The visitor's address is only used as the rate limit's key, in memory, never stored.
  const visitor = request.headers.get('cf-connecting-ip') || clientAddress || 'unknown';
  if (e.CHAT_PER_VISITOR && !(await e.CHAT_PER_VISITOR.limit({ key: visitor })).success) return fallback(last, 'busy');
  if (e.CHAT_EVERYONE && !(await e.CHAT_EVERYONE.limit({ key: 'everyone' })).success) return fallback(last, 'busy');
  if (!e.ANTHROPIC_API_KEY) return fallback(last, 'off');

  try {
    const idx = await loadIndex(new URL(request.url).origin);
    const key = e.ANTHROPIC_API_KEY;
    const out = await chat(idx, messages, (body: object) => callClaude(key, body));
    return reply(200, { reply: out.reply, query: out.query });
  } catch {
    return fallback(last, 'error');
  }
};

export const ALL: APIRoute = () =>
  new Response(JSON.stringify({ about: 'POST {"messages": [{"role": "user", "content": "..."}]}. Ask is an experiment on https://findish.now/?chat=1' }), {
    status: 405,
    headers: { ...HEADERS, allow: 'POST' },
  });
