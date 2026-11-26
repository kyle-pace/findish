// /explore/merged.json: the explorer pages that are now browse pages here, and where each
// lives ({"cuisine/korean-cuisine": "/cuisine/korean/#about"}). Written at build time; the
// page for one cuisine, dish or ingredient (src/pages/explore/[type]/[slug].astro) reads it
// to forward those addresses. See src/lib/explore.ts.
import type { APIRoute } from 'astro';
import { MERGED } from '../../lib/explore';

export const GET: APIRoute = () =>
  new Response(JSON.stringify(MERGED), { headers: { 'content-type': 'application/json', 'x-robots-tag': 'noindex' } });
