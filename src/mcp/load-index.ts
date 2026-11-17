// The one place the server reads the index: the MCP endpoint (src/pages/mcp.ts), Ask
// (src/pages/api/chat.ts) and the list endpoint (src/pages/api/with.ts) all call loadIndex(),
// so a running copy of the Worker (an isolate) parses the 2 MB file once and shares it,
// instead of each endpoint keeping its own copy.
//
// The index is the static file the page loads, read through the Worker's ASSETS binding.
// Each deploy starts fresh isolates, so a new crawl is picked up without any cache to clear.

import { env } from 'cloudflare:workers';
import { prepare } from './search.mjs';

export type Ready = ReturnType<typeof prepare>;

let ready: Promise<Ready> | null = null;

export function loadIndex(origin: string): Promise<Ready> {
  ready ??= (async () => {
    const assets = (env as { ASSETS?: { fetch: typeof fetch } }).ASSETS;
    if (!assets) throw new Error('The index is not available here');
    const res = await assets.fetch(new URL('/index.json', origin));
    if (!res.ok) throw new Error(`The index answered ${res.status}`);
    return prepare(await res.json());
  })().catch((e) => {
    ready = null; // try again on the next request
    throw e;
  });
  return ready;
}
