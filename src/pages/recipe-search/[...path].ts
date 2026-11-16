// Old addresses: Findish lived at kylepace.dev/recipe-search/ until 2026-11-16. That
// domain's two Worker routes (kylepace.dev/recipe-search and /recipe-search/*) still send
// requests here, so this forwards each one to the same page on findish.now, query and all.
// 308 keeps the method and body, so POSTs to /mcp and /api/with from older Grocery Deals and
// Henwood builds and from assistants connected to the old address keep working.
// If those routes are ever removed in Cloudflare, the hub's public/_redirects does the same.
import type { APIRoute } from 'astro';

export const prerender = false;

export const ALL: APIRoute = ({ params, url }) => {
  const to = new URL(`/${params.path ?? ''}`, 'https://findish.now');
  if (params.path && url.pathname.endsWith('/') && !to.pathname.endsWith('/')) to.pathname += '/';
  to.search = url.search;
  return new Response(null, { status: 308, headers: { location: to.href, 'cache-control': 'max-age=3600' } });
};
