// Every recipe on each Discover shelf, by key, for "See all": the search page fetches this
// only when its address (or a recent search) has &collection=, and holds the search to that
// shelf's recipes the way the saved view holds it to saved ones. Built with the site.
import type { APIRoute } from 'astro';
import { DISCOVER } from '../../lib/discover';

export const prerender = true;

export const GET: APIRoute = () =>
  new Response(
    JSON.stringify({
      week: DISCOVER.week,
      shelves: DISCOVER.shelves.filter((s) => s.keys).map((s) => ({ id: s.id, title: s.title, keys: s.keys })),
    }),
    { headers: { 'content-type': 'application/json; charset=utf-8' } },
  );
