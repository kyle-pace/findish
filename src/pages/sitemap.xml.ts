// The sitemap, built with the site (it was a hand-kept public/sitemap.xml until 2026-11-16,
// when every creator got a page). Add new pages to PAGES; browse pages come from the index.
// Each creator's own page is left out (noindex since 2026-11-25); /creators/ stays.
import type { APIRoute } from 'astro';
import { ALL, CRAWLED } from '../lib/browse';
import { EXPLORE_LISTED } from '../lib/site';

export const prerender = true;

// Pages written by hand. They carry no lastmod: a date nobody keeps is worse than none.
const PAGES = ['/about/', '/how-its-built/', '/assistants/', '/privacy/', ...(EXPLORE_LISTED ? ['/explore/ingredients/', '/explore/globe/'] : [])];
// Pages built from the index change with every weekly crawl, so their lastmod is its date.
const FROM_INDEX = ['/', '/creators/', '/browse/', ...(EXPLORE_LISTED ? ['/explore/'] : [])];

export const GET: APIRoute = () => {
  const dated = [...FROM_INDEX, ...ALL.map((b) => b.path)];
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
