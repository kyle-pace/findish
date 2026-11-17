// The sitemap, built with the site (it was a hand-kept public/sitemap.xml until 2026-11-16,
// when every creator got a page). Add new pages to PAGES; creator pages come from the index.
import type { APIRoute } from 'astro';
import { CREATORS, pagePath } from '../lib/creators';

export const prerender = true;

const PAGES = ['/', '/about/', '/how-its-built/', '/assistants/', '/privacy/', '/creators/'];

export const GET: APIRoute = () => {
  const urls = [...PAGES, ...CREATORS.map((c) => pagePath(c.id))];
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>https://findish.now${u}</loc></url>`).join('\n')}
</urlset>
`;
  return new Response(body, { headers: { 'content-type': 'application/xml; charset=utf-8' } });
};
