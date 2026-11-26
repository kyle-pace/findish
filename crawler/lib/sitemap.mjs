// Sitemap reading: an index of sitemaps or a plain urlset, gzipped or not.

import { gunzipSync } from 'node:zlib';
import { decodeEntities } from './text.mjs';

export function parseSitemap(xml) {
  const text = String(xml || '');
  const isIndex = /<sitemapindex[\s>]/i.test(text);
  const entries = [];
  const block = isIndex ? 'sitemap' : 'url';
  const re = new RegExp(`<${block}\\b[^>]*>([\\s\\S]*?)</${block}>`, 'gi');
  for (const m of text.matchAll(re)) {
    const loc = m[1].match(/<loc>\s*(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?\s*<\/loc>/i);
    if (!loc) continue;
    const lastmod = m[1].match(/<lastmod>\s*([\s\S]*?)\s*<\/lastmod>/i);
    entries.push({ loc: decodeEntities(loc[1].trim()), lastmod: lastmod ? lastmod[1].trim() : null });
  }
  return { isIndex, entries };
}

// Child sitemaps that never hold posts or recipes.
const SKIP_CHILD = /(category|tag|author|attachment|page-sitemap|product|web-?stor|wprm_|course|cuisine|keyword|ingredient|collection|format|portfolio|video-sitemap|image-sitemap|news-sitemap|local-sitemap)/i;

export async function readSitemaps(startUrl, fetchText, { include, depth = 0, log = () => {} } = {}) {
  const body = await fetchText(startUrl, { binary: startUrl.endsWith('.gz') });
  const xml = Buffer.isBuffer(body) ? gunzipSync(body).toString('utf8') : body;
  const { isIndex, entries } = parseSitemap(xml);
  if (!isIndex) {
    return entries.filter((e) => !include || include.test(e.loc));
  }
  if (depth > 2) return [];
  const out = [];
  for (const child of entries) {
    if (SKIP_CHILD.test(child.loc)) continue;
    try {
      out.push(...(await readSitemaps(child.loc, fetchText, { include, depth: depth + 1, log })));
    } catch (err) {
      log(`  sitemap ${child.loc} failed: ${err.message}`);
      throw err; // a missing child sitemap must not look like deleted recipes
    }
  }
  return out;
}

// A sitemap that suddenly lists far fewer of the pages we know is far more often a broken
// sitemap (a firewall's empty page, a plugin update) than a site that took its posts down.
// On 2026-11-26 RecipeTin Japan's sitemap came back empty and the crawl removed all 431 of
// its recipes, which stopped the index build. So the first time, nothing is removed and the
// site is read again next run; if the next run's sitemap is short too, it is believed, and
// the crawl's drop alert says so.
export const SITEMAP_KEEP = 0.9;
const SMALL_SITE = 20;

/** A note when the sitemap is too short to believe this run; null when it's fine. */
export function shortSitemap({ listed, known, shortLastRun = false }) {
  if (known <= SMALL_SITE || listed >= known * SITEMAP_KEEP || shortLastRun) return null;
  return `its sitemap listed ${listed} of the ${known} pages we know, so nothing was removed this run and it is read again next run; if the sitemap is still short then, it is believed.`;
}
