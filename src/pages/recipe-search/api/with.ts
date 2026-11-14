// Recipes that use several of a few ingredients, at kylepace.dev/recipe-search/api/with: the
// Seattle Grocery Deals app's "Recipes with your list". The app sends catalog ids for the
// list items that match this week's deals (never what the person typed), and gets back names,
// links and photos, the same as the page shows. Nothing about the request is kept or logged.
//
// POST, with the ids in a small JSON body, so they never appear in an address that a log or a
// cache could keep:  {"with": ["ground-pork", "napa-cabbage"], "diet": "vegetarian", "limit": 12}
// The answers are worked out in src/mcp/search.mjs (recipesWith).

import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { prepare, recipesWith } from '../../../mcp/search.mjs';

export const prerender = false;

const MAX_BODY = 4096;
const HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };
const reply = (status: number, value: unknown) => new Response(JSON.stringify(value), { status, headers: HEADERS });

// Read once per isolate, like the MCP endpoint.
let ready: Promise<ReturnType<typeof prepare>> | null = null;
function loadIndex(origin: string) {
  ready ??= (async () => {
    const assets = (env as { ASSETS?: { fetch: typeof fetch } }).ASSETS;
    if (!assets) throw new Error('The index is not available here');
    const res = await assets.fetch(new URL('/recipe-search/index.json', origin));
    if (!res.ok) throw new Error(`The index answered ${res.status}`);
    return prepare(await res.json());
  })().catch((e) => {
    ready = null;
    throw e;
  });
  return ready;
}

export const POST: APIRoute = async ({ request }) => {
  const length = Number(request.headers.get('content-length') || 0);
  if (length > MAX_BODY) return reply(413, { error: 'Too much in one request.' });
  let body: unknown;
  try {
    const text = await request.text();
    if (text.length > MAX_BODY) return reply(413, { error: 'Too much in one request.' });
    body = JSON.parse(text);
  } catch {
    return reply(400, { error: 'Send JSON: {"with": ["catalog-id", ...]}' });
  }
  if (!body || typeof body !== 'object' || !Array.isArray((body as { with?: unknown }).with)) {
    return reply(400, { error: 'Send JSON: {"with": ["catalog-id", ...]}' });
  }
  try {
    const { with: ids, diet, limit } = body as { with: unknown[]; diet?: unknown; limit?: unknown };
    return reply(200, recipesWith(await loadIndex(new URL(request.url).origin), { with: ids, diet, limit }));
  } catch {
    return reply(503, { error: 'Could not search right now. Try again in a minute.' });
  }
};

// Anything else (a browser opening the address) gets a short note instead of an error page.
export const ALL: APIRoute = () =>
  new Response(JSON.stringify({ about: 'POST {"with": ["catalog-id", ...]} for recipes that use several of them. See https://kylepace.dev/recipe-search/about/' }), {
    status: 405,
    headers: { ...HEADERS, allow: 'POST' },
  });
