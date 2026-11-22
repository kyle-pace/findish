// The Discover shelves as data, built with the site: the same shelves as /discover/, for the
// Findish app and the MCP server to read later. Like index.json, fields are only ever added.
import type { APIRoute } from 'astro';
import { DISCOVER } from '../lib/discover';

export const prerender = true;

export const GET: APIRoute = () =>
  new Response(JSON.stringify({ version: 1, ...DISCOVER }), { headers: { 'content-type': 'application/json; charset=utf-8' } });
