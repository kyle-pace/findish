// Ask, at POST findish.now/api/chat: the chat experiment (src/chat/chat.mjs), only offered on
// the page at findish.now/?chat=1 for now.
//
// The page sends what the person typed, plus the searches the page showed for their earlier
// questions in this chat:
//   {"messages": [{"role": "user", "content": "a soup with tofu"},
//                 {"role": "assistant", "showed": "with=tofu&course=soup"},
//                 {"role": "user", "content": "make it vegetarian"}]}
// and gets back a short reply and the search to show, as the page's own address parameters:
//   {"reply": "...", "query": "with=tofu&course=soup&diet=vegetarian", "searches": 1, "found": 12}
// (`searches`: how many searches Claude checked first; `found`: how many recipes and videos
// the server's copy of the search found.) Only the person's own turns are read as text.
// Earlier answers are rebuilt here from `showed` (or the "[showed: …]" at the end of
// `content`, which older copies of the page send), checked against the index, so a
// request can't put words in Claude's mouth.
//
// What's typed goes to Claude (Anthropic's API) to be answered and is never kept or logged
// here: the one log line is a status and a short reason ("timeout", "http_529"). Two rate
// limits guard the cost (per visitor and for everyone, in wrangler.jsonc), and the Anthropic
// workspace's spend limit is the last stop. Whenever Claude can't answer (a limit, an outage,
// no key, a missing rate limiter), the reply falls back to a plain search of the person's
// words: {"fallback": "busy" | "off" | "error", "reason": "...", "reply", "query"}.

import type { APIRoute } from 'astro';
import { ASK_ENABLED } from '../../lib/site';
import { env } from 'cloudflare:workers';
import { loadIndex } from '../../mcp/load-index';
import { chat, cleanMessages } from '../../chat/chat.mjs';
import { callClaude } from '../../chat/anthropic.mjs';
import { readJson, visitorKey } from '../../chat/request.mjs';

export const prerender = false;

const MAX_BODY = 8192;
const HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };
const reply = (status: number, value: unknown) => new Response(JSON.stringify(value), { status, headers: HEADERS });
const HOW = 'Send JSON: {"messages": [{"role": "user", "content": "..."}]}';

type Limiter = { limit(o: { key: string }): Promise<{ success: boolean }> };
type ChatEnv = { ANTHROPIC_API_KEY?: string; CHAT_PER_VISITOR?: Limiter; CHAT_EVERYONE?: Limiter };
const e = env as ChatEnv;

// The only thing ever logged: that Ask fell back, and a short reason. Never what was typed.
const note = (status: number, reason: string) => console.warn(`ask ${status} ${reason}`);

// A plain search of what the person typed, when Claude can't help right now.
function fallback(text: string, why: 'busy' | 'off' | 'error', reason: string) {
  note(200, `${why}:${reason}`);
  return reply(200, {
    fallback: why,
    reason,
    reply: 'Ask isn’t available right now, so here’s a plain search for your words.',
    query: new URLSearchParams({ q: text.slice(0, 120) }).toString(),
  });
}

export const POST: APIRoute = async ({ request, clientAddress }) => {
  const body = await readJson(request, MAX_BODY);
  if ('error' in body) return reply(body.status ?? 400, { error: body.error });
  const messages = cleanMessages((body.value as { messages?: unknown } | null)?.messages);
  if (!messages) return reply(400, { error: HOW });
  const last = messages.at(-1)!.content as string;

  // Paused (ASK_ENABLED in src/lib/site.ts): nothing is sent to Claude.
  if (!ASK_ENABLED) return fallback(last, 'off', 'paused');

  // With no key or no rate limiter (a binding lost in a config change), Ask is off: it never
  // runs unguarded.
  if (!e.ANTHROPIC_API_KEY) return fallback(last, 'off', 'no_key');
  if (!e.CHAT_PER_VISITOR || !e.CHAT_EVERYONE) return fallback(last, 'off', 'no_limiter');

  // The visitor's address is only used as the rate limit's key, in memory, never stored.
  const visitor = visitorKey(request.headers.get('cf-connecting-ip') || clientAddress);
  try {
    if (!(await e.CHAT_PER_VISITOR.limit({ key: visitor })).success) return fallback(last, 'busy', 'visitor_limit');
    if (!(await e.CHAT_EVERYONE.limit({ key: 'everyone' })).success) return fallback(last, 'busy', 'shared_limit');
  } catch {
    return fallback(last, 'off', 'limiter_failed');
  }

  let idx;
  try {
    idx = await loadIndex(new URL(request.url).origin);
  } catch {
    return fallback(last, 'error', 'no_index');
  }
  try {
    const key = e.ANTHROPIC_API_KEY;
    const out = await chat(idx, messages, (payload: object, opts: { timeoutMs: number }) => callClaude(key, payload, opts));
    return reply(200, { reply: out.reply, query: out.query, searches: out.searches, found: out.found });
  } catch (err) {
    const reason = (err as { reason?: unknown })?.reason;
    return fallback(last, 'error', typeof reason === 'string' ? reason : 'unknown');
  }
};

export const ALL: APIRoute = () =>
  new Response(JSON.stringify({ about: `POST ${HOW}. Ask is an experiment on https://findish.now/?chat=1` }), {
    status: 405,
    headers: { ...HEADERS, allow: 'POST' },
  });
