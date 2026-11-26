// An ingredient page that isn't built any more. Which ingredients get a page (src/lib/browse.ts,
// the 200 most used) can change with each weekly crawl, and Google keeps the old address for a
// while: /with/celery-hearts/ and /with/phyllo-dough/ were both in search results as 404s in
// November 2026. So an address under /with/ that has no built page sends people to the same
// search on the search page, for as long as that ingredient is in the index, with a 301 so
// Google moves on too. Anything else is the usual 404. Built pages never reach this: they are
// static files, served before the Worker runs. Added 2026-11-26.
import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { loadIndex } from '../../mcp/load-index';

export const prerender = false;

export const GET: APIRoute = async ({ params, url }) => {
  const id = (params.rest ?? '').replace(/\/$/, '');
  if (/^[a-z0-9]+(-[a-z0-9]+)*$/.test(id)) {
    try {
      const ready: any = await loadIndex(url.origin);
      if (ready.ing.some((g: any[]) => g[0] === id))
        return new Response(null, { status: 301, headers: { location: `/?with=${id}`, 'cache-control': 'max-age=3600' } });
    } catch {
      // The index can't be read: fall through to the 404.
    }
  }
  // The site's own 404 page, with a 404 status.
  const assets = (env as { ASSETS?: { fetch: typeof fetch } }).ASSETS;
  const page = assets ? await assets.fetch(new URL('/404.html', url.origin)).catch(() => null) : null;
  return new Response(page?.ok ? page.body : 'Not found', { status: 404, headers: { 'content-type': 'text/html; charset=utf-8' } });
};
