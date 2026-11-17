// The sitemap, built with the site (it was a hand-kept public/sitemap.xml until 2026-11-16,
// when every creator got a page). Add new pages to PAGES; creator and browse pages come
// from the index.
import type { APIRoute } from 'astro';
import { CREATORS, pagePath } from '../lib/creators';
import { ALL, CRAWLED } from '../lib/browse';

export const prerender = true;

// Pages written by hand. They carry no lastmod: a date nobody keeps is worse than none.
const PAGES = ['/about/', '/how-its-built/', '/assistants/', '/privacy/'];
// Pages built from the index change with every weekly crawl, so their lastmod is its date.
const FROM_INDEX = ['/', '/creators/', '/browse/'];

export const GET: APIRoute = () => {
  const dated = [...FROM_INDEX, ...ALL.map((b) => b.path), ...CREATORS.map((c) => pagePath(c.id))];
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${[
  ...dated.map((u) => `  <url><loc>https://findish.now${u}</loc><lastmod>${CRAWLED}</lastmod></url>`),
  ...PAGES.map((u) => `  <url><loc>https://findish.now${u}</loc></url>`),
].join('\n')}
</urlset>
`;
  return new Response(body, { headers: { 'content-type': 'application/xml; charset=utf-8' } });
};
